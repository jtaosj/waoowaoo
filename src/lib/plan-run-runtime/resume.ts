import type { NextRequest } from 'next/server'
import { ApiError } from '@/lib/api-errors'
import { getAgentSkillManifest } from '@/lib/agent-skills/registry'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'
import {
  persistEditTimelineFinalVideoBlocker,
  persistEditTimelineFinalVideoEvidence,
  persistEditTimelineProviderEvidence,
  providerRuntimeStatusFromTaskStatus,
} from '@/lib/edit-timeline/runtime-artifact-writer'
import { getTaskById } from '@/lib/task/service'
import { TASK_STATUS } from '@/lib/task/types'
import {
  completePlanRun,
  completePlanStep,
  completeWaitingPlanStepTask,
  createPlanArtifact,
  failPlanStep,
  getPlanRunSnapshot,
  startPlanStep,
} from './service'
import { PLAN_RUN_STATUS, PLAN_STEP_STATUS } from './types'
import {
  artifactRefId,
  buildOperationInput,
  extractTaskId,
  findRunnableExecutableStep,
  inputBuildErrorMessage,
  sanitizeOutput,
  type ExecutablePlanStep,
  type JsonRecord,
} from './step-execution'

type PlanRunSnapshot = NonNullable<Awaited<ReturnType<typeof getPlanRunSnapshot>>>
type PlanRunSnapshotStep = PlanRunSnapshot['steps'][number]
type TaskSnapshot = NonNullable<Awaited<ReturnType<typeof getTaskById>>>

const TERMINAL_PLAN_RUN_STATUSES = new Set<string>([
  PLAN_RUN_STATUS.COMPLETED,
  PLAN_RUN_STATUS.FAILED,
  PLAN_RUN_STATUS.CANCELED,
])

const ACTIVE_TASK_STATUSES = new Set<string>([
  TASK_STATUS.QUEUED,
  TASK_STATUS.PROCESSING,
])

function ensureOwnedSnapshot(snapshot: PlanRunSnapshot | null, userId: string): PlanRunSnapshot {
  if (!snapshot || snapshot.planRun.userId !== userId) throw new ApiError('NOT_FOUND')
  return snapshot
}

function toExecutableStep(step: PlanRunSnapshotStep): ExecutablePlanStep {
  if (!step.skillId) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'PLAN_STEP_SKILL_MISSING',
      stepKey: step.stepKey,
      operationId: step.operationId,
    })
  }
  return {
    stepKey: step.stepKey,
    skillId: step.skillId,
    operationId: step.operationId,
    inputArtifacts: step.inputArtifacts,
    outputArtifacts: step.outputArtifacts,
    dependsOn: step.dependsOn,
    input: step.input,
  }
}

function ensureStepOperationAllowed(step: ExecutablePlanStep) {
  const manifest = getAgentSkillManifest(step.skillId)
  if (!manifest) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'PLAN_STEP_SKILL_NOT_FOUND',
      skillId: step.skillId,
      operationId: step.operationId,
    })
  }
  if (!manifest.allowedOperationIds.includes(step.operationId)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'PLAN_STEP_OPERATION_NOT_ALLOWED',
      skillId: step.skillId,
      operationId: step.operationId,
    })
  }
}

function assertTaskBelongsToPlan(task: TaskSnapshot | null, snapshot: PlanRunSnapshot): TaskSnapshot {
  if (!task) throw new ApiError('NOT_FOUND')
  if (task.userId !== snapshot.planRun.userId || task.projectId !== snapshot.planRun.projectId) {
    throw new ApiError('NOT_FOUND')
  }
  return task
}

function taskFailureDetail(task: TaskSnapshot): {
  errorCode: string
  errorMessage: string
} {
  const status = typeof task.status === 'string' ? task.status : 'unknown'
  const errorCode = typeof task.errorCode === 'string' && task.errorCode.trim()
    ? task.errorCode.trim()
    : `PLAN_WAITING_TASK_${status.toUpperCase()}`
  const errorMessage = typeof task.errorMessage === 'string' && task.errorMessage.trim()
    ? task.errorMessage.trim()
    : `waiting task ${task.id} ended with status ${status}`
  return { errorCode, errorMessage }
}

function collectCompletedStepKeys(snapshot: PlanRunSnapshot): Set<string> {
  return new Set(snapshot.steps
    .filter((step) => step.status === PLAN_STEP_STATUS.COMPLETED)
    .map((step) => step.stepKey))
}

function findWaitingTaskStep(snapshot: PlanRunSnapshot): PlanRunSnapshotStep | null {
  return snapshot.steps.find((step) => step.status === PLAN_STEP_STATUS.WAITING_TASK && step.taskId) ?? null
}

function findWaitingTaskId(snapshot: PlanRunSnapshot): string | null {
  return findWaitingTaskStep(snapshot)?.taskId ?? null
}

function findRunnableStep(snapshot: PlanRunSnapshot): ExecutablePlanStep | null {
  const steps = snapshot.steps
    .filter((step) => step.status === PLAN_STEP_STATUS.PENDING)
    .map(toExecutableStep)
  return findRunnableExecutableStep({
    steps,
    completedStepKeys: collectCompletedStepKeys(snapshot),
  })
}

function allStepsCompleted(snapshot: PlanRunSnapshot): boolean {
  return snapshot.steps.length > 0
    && snapshot.steps.every((step) => step.status === PLAN_STEP_STATUS.COMPLETED)
}

async function createOutputArtifacts(params: {
  planRunId: string
  step: ExecutablePlanStep
  taskId: string | null
  output: JsonRecord
}) {
  for (const artifactType of params.step.outputArtifacts ?? []) {
    await createPlanArtifact({
      planRunId: params.planRunId,
      stepKey: params.step.stepKey,
      artifactType,
      refId: artifactRefId({
        stepKey: params.step.stepKey,
        taskId: params.taskId,
        artifactType,
        output: params.output,
      }),
      payload: params.output,
    })
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.trim() || 'OPERATION_EXECUTION_FAILED'
  if (typeof error === 'string' && error.trim()) return error.trim()
  return 'OPERATION_EXECUTION_FAILED'
}

function errorCode(error: unknown): string {
  if (error instanceof ApiError) return error.code
  return 'OPERATION_EXECUTION_FAILED'
}

export async function resumePlanRunFromApi(params: {
  request: NextRequest
  planRunId: string
  userId: string
  locale?: string | null
}) {
  let snapshot = ensureOwnedSnapshot(await getPlanRunSnapshot(params.planRunId), params.userId)
  const resumedStepKeys: string[] = []

  if (TERMINAL_PLAN_RUN_STATUSES.has(snapshot.planRun.status)) {
    return {
      success: true,
      planRunId: params.planRunId,
      status: snapshot.planRun.status,
      resumedStepKeys,
      waitingTaskId: null,
      snapshot,
    }
  }

  const waitingStep = findWaitingTaskStep(snapshot)
  if (waitingStep?.taskId) {
    const task = assertTaskBelongsToPlan(await getTaskById(waitingStep.taskId), snapshot)
    if (ACTIVE_TASK_STATUSES.has(task.status)) {
      const providerStatus = waitingStep.operationId === 'generate_panel_video'
        ? providerRuntimeStatusFromTaskStatus(task.status)
        : null
      let activeSnapshot = snapshot
      if (providerStatus) {
        const persisted = await persistEditTimelineProviderEvidence({
          planRunId: params.planRunId,
          snapshot,
          step: waitingStep,
          task,
          status: providerStatus,
        })
        activeSnapshot = ensureOwnedSnapshot(persisted.snapshot, params.userId)
      }
      return {
        success: true,
        planRunId: params.planRunId,
        status: PLAN_STEP_STATUS.WAITING_TASK,
        resumedStepKeys,
        waitingTaskId: waitingStep.taskId,
        snapshot: activeSnapshot,
      }
    }
    if (task.status !== TASK_STATUS.COMPLETED) {
      const failure = taskFailureDetail(task)
      await failPlanStep({
        planRunId: params.planRunId,
        userId: params.userId,
        projectId: snapshot.planRun.projectId,
        stepKey: waitingStep.stepKey,
        errorCode: failure.errorCode,
        errorMessage: failure.errorMessage,
      })
      let failedSnapshot = ensureOwnedSnapshot(await getPlanRunSnapshot(params.planRunId), params.userId)
      if (waitingStep.operationId === 'generate_panel_video') {
        const persisted = await persistEditTimelineProviderEvidence({
          planRunId: params.planRunId,
          snapshot: failedSnapshot,
          step: waitingStep,
          task,
          status: 'failed',
          blocker: failure.errorMessage,
        })
        failedSnapshot = ensureOwnedSnapshot(persisted.snapshot, params.userId)
      }
      return {
        success: false,
        planRunId: params.planRunId,
        status: PLAN_RUN_STATUS.FAILED,
        failedStepKey: waitingStep.stepKey,
        error: failure,
        resumedStepKeys,
        waitingTaskId: null,
        snapshot: failedSnapshot,
      }
    }

    const output = sanitizeOutput(task.result)
    await completeWaitingPlanStepTask({
      planRunId: params.planRunId,
      userId: params.userId,
      projectId: snapshot.planRun.projectId,
      stepKey: waitingStep.stepKey,
      taskId: waitingStep.taskId,
      output,
    })
    await createOutputArtifacts({
      planRunId: params.planRunId,
      step: toExecutableStep(waitingStep),
      taskId: waitingStep.taskId,
      output,
    })
    const persisted = await persistEditTimelineProviderEvidence({
      planRunId: params.planRunId,
      snapshot,
      step: waitingStep,
      task,
      output,
      status: 'succeeded',
    })
    snapshot = ensureOwnedSnapshot(persisted.snapshot, params.userId)
  }

  while (!TERMINAL_PLAN_RUN_STATUSES.has(snapshot.planRun.status)) {
    if (allStepsCompleted(snapshot)) {
      const completedSnapshot = await completePlanRun({
        planRunId: params.planRunId,
        userId: params.userId,
        projectId: snapshot.planRun.projectId,
      })
      return {
        success: true,
        planRunId: params.planRunId,
        status: PLAN_RUN_STATUS.COMPLETED,
        resumedStepKeys,
        waitingTaskId: null,
        snapshot: completedSnapshot,
      }
    }

    const step = findRunnableStep(snapshot)
    if (!step) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PLAN_HAS_NO_RUNNABLE_STEP',
        message: 'plan has no runnable step',
      })
    }
    ensureStepOperationAllowed(step)

    await startPlanStep({
      planRunId: params.planRunId,
      userId: params.userId,
      projectId: snapshot.planRun.projectId,
      stepKey: step.stepKey,
    })
    resumedStepKeys.push(step.stepKey)

    let operationInput: JsonRecord
    try {
      operationInput = buildOperationInput({
        step,
        episodeId: snapshot.planRun.episodeId,
      })
    } catch (error) {
      const message = inputBuildErrorMessage(error)
      await failPlanStep({
        planRunId: params.planRunId,
        userId: params.userId,
        projectId: snapshot.planRun.projectId,
        stepKey: step.stepKey,
        errorCode: 'PLAN_STEP_INPUT_BUILD_FAILED',
        errorMessage: message,
      })
      if (step.operationId === 'generate_panel_video') {
        const persisted = await persistEditTimelineProviderEvidence({
          planRunId: params.planRunId,
          snapshot,
          step,
          status: 'blocked',
          blocker: message,
        })
        snapshot = ensureOwnedSnapshot(persisted.snapshot, params.userId)
      } else if (step.operationId === 'assemble_timeline_video') {
        const persisted = await persistEditTimelineFinalVideoBlocker({
          planRunId: params.planRunId,
          snapshot,
          blocker: message,
        })
        snapshot = ensureOwnedSnapshot(persisted.snapshot, params.userId)
      } else {
        snapshot = ensureOwnedSnapshot(await getPlanRunSnapshot(params.planRunId), params.userId)
      }
      return {
        success: false,
        planRunId: params.planRunId,
        status: PLAN_RUN_STATUS.FAILED,
        failedStepKey: step.stepKey,
        error: {
          code: 'PLAN_STEP_INPUT_BUILD_FAILED',
          message,
        },
        resumedStepKeys,
        waitingTaskId: null,
        snapshot,
      }
    }

    try {
      const result = await executeProjectAgentOperationFromApi({
        request: params.request,
        operationId: step.operationId,
        projectId: snapshot.planRun.projectId,
        userId: params.userId,
        context: {
          ...(params.locale ? { locale: params.locale } : {}),
          ...(snapshot.planRun.episodeId ? { episodeId: snapshot.planRun.episodeId } : {}),
        },
        input: operationInput,
        source: 'plan-run-resume',
      })
      const output = sanitizeOutput(result)
      const taskId = extractTaskId(result)
      await completePlanStep({
        planRunId: params.planRunId,
        userId: params.userId,
        projectId: snapshot.planRun.projectId,
        stepKey: step.stepKey,
        output,
        taskId,
      })
      await createOutputArtifacts({
        planRunId: params.planRunId,
        step,
        taskId,
        output,
      })
      if (taskId) {
        const persisted = await persistEditTimelineProviderEvidence({
          planRunId: params.planRunId,
          snapshot,
          step,
          output,
          status: 'submitted',
        })
        snapshot = ensureOwnedSnapshot(persisted.snapshot, params.userId)
      } else if (step.operationId === 'assemble_timeline_video') {
        const persisted = await persistEditTimelineFinalVideoEvidence({
          planRunId: params.planRunId,
          snapshot,
          step,
          output,
        })
        snapshot = ensureOwnedSnapshot(persisted.snapshot, params.userId)
      } else {
        snapshot = ensureOwnedSnapshot(await getPlanRunSnapshot(params.planRunId), params.userId)
      }

      if (taskId) {
        return {
          success: true,
          planRunId: params.planRunId,
          status: PLAN_STEP_STATUS.WAITING_TASK,
          resumedStepKeys,
          waitingTaskId: findWaitingTaskId(snapshot) || taskId,
          snapshot,
        }
      }
    } catch (error) {
      const failure = {
        code: errorCode(error),
        message: errorMessage(error),
      }
      await failPlanStep({
        planRunId: params.planRunId,
        userId: params.userId,
        projectId: snapshot.planRun.projectId,
        stepKey: step.stepKey,
        errorCode: failure.code,
        errorMessage: failure.message,
      })
      if (step.operationId === 'generate_panel_video') {
        const persisted = await persistEditTimelineProviderEvidence({
          planRunId: params.planRunId,
          snapshot,
          step,
          status: 'failed',
          blocker: failure.message,
        })
        snapshot = ensureOwnedSnapshot(persisted.snapshot, params.userId)
      } else if (step.operationId === 'assemble_timeline_video') {
        const persisted = await persistEditTimelineFinalVideoBlocker({
          planRunId: params.planRunId,
          snapshot,
          blocker: failure.message,
        })
        snapshot = ensureOwnedSnapshot(persisted.snapshot, params.userId)
      } else {
        snapshot = ensureOwnedSnapshot(await getPlanRunSnapshot(params.planRunId), params.userId)
      }
      return {
        success: false,
        planRunId: params.planRunId,
        status: PLAN_RUN_STATUS.FAILED,
        failedStepKey: step.stepKey,
        error: failure,
        resumedStepKeys,
        waitingTaskId: null,
        snapshot,
      }
    }
  }

  return {
    success: true,
    planRunId: params.planRunId,
    status: snapshot.planRun.status,
    resumedStepKeys,
    waitingTaskId: findWaitingTaskId(snapshot),
    snapshot,
  }
}
