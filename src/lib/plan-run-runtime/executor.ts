import { ApiError } from '@/lib/api-errors'
import type { ProjectAgentToolResult } from '@/lib/operations/types'
import {
  completePlanRun,
  completePlanStep,
  createPlanArtifact,
  createPlanRun,
  failPlanStep,
  getPlanRunSnapshot,
  startPlanStep,
} from './service'
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

export type { ExecutablePlanStep }

export interface ExecutablePlanInput {
  goal: string
  steps: ExecutablePlanStep[]
}

export interface PlanRunInitialArtifact {
  stepKey?: string | null
  artifactType: string
  refId: string
  payload?: JsonRecord | null
}

export type PlanStepInvoker = (params: {
  skillId: string
  operationId: string
  input: JsonRecord
}) => Promise<ProjectAgentToolResult<unknown>>

export async function executeAgentPlan(params: {
  userId: string
  projectId: string
  episodeId?: string | null
  planId?: string | null
  input: ExecutablePlanInput
  initialArtifacts?: readonly PlanRunInitialArtifact[]
  invokeStep: PlanStepInvoker
}) {
  const planRun = await createPlanRun({
    userId: params.userId,
    projectId: params.projectId,
    episodeId: params.episodeId || null,
    planId: params.planId || null,
    goal: params.input.goal,
    steps: params.input.steps.map((step, index) => ({
      stepKey: step.stepKey,
      skillId: step.skillId,
      operationId: step.operationId,
      stepIndex: index + 1,
      stepTotal: params.input.steps.length,
      dependsOn: step.dependsOn ?? [],
      inputArtifacts: step.inputArtifacts ?? [],
      outputArtifacts: step.outputArtifacts ?? [],
      input: step.input ?? null,
    })),
  })
  for (const artifact of params.initialArtifacts ?? []) {
    await createPlanArtifact({
      planRunId: planRun.id,
      stepKey: artifact.stepKey ?? null,
      artifactType: artifact.artifactType,
      refId: artifact.refId,
      payload: artifact.payload ?? null,
    })
  }

  const completedStepKeys = new Set<string>()
  const startedStepKeys = new Set<string>()
  const executedStepKeys: string[] = []
  let waitingTaskId: string | null = null

  while (completedStepKeys.size < params.input.steps.length) {
    const step = findRunnableExecutableStep({
      steps: params.input.steps,
      completedStepKeys,
      startedStepKeys,
    })
    if (!step) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PLAN_HAS_NO_RUNNABLE_STEP',
        message: 'plan has no runnable step',
      })
    }

    startedStepKeys.add(step.stepKey)
    await startPlanStep({
      planRunId: planRun.id,
      userId: params.userId,
      projectId: params.projectId,
      stepKey: step.stepKey,
    })

    let operationInput: JsonRecord
    try {
      operationInput = buildOperationInput({
        step,
        episodeId: params.episodeId,
      })
    } catch (error) {
      const message = inputBuildErrorMessage(error)
      await failPlanStep({
        planRunId: planRun.id,
        userId: params.userId,
        projectId: params.projectId,
        stepKey: step.stepKey,
        errorCode: 'PLAN_STEP_INPUT_BUILD_FAILED',
        errorMessage: message,
      })
      return {
        success: false,
        planRunId: planRun.id,
        failedStepKey: step.stepKey,
        error: {
          code: 'PLAN_STEP_INPUT_BUILD_FAILED',
          message,
        },
        snapshot: await getPlanRunSnapshot(planRun.id),
      }
    }
    const result = await params.invokeStep({
      skillId: step.skillId,
      operationId: step.operationId,
      input: operationInput,
    })

    if (!result.ok) {
      await failPlanStep({
        planRunId: planRun.id,
        userId: params.userId,
        projectId: params.projectId,
        stepKey: step.stepKey,
        errorCode: result.error.code,
        errorMessage: result.error.message,
      })
      return {
        success: false,
        planRunId: planRun.id,
        failedStepKey: step.stepKey,
        error: result.error,
        snapshot: await getPlanRunSnapshot(planRun.id),
      }
    }

    const output = sanitizeOutput(result.data)
    const taskId = extractTaskId(result.data)
    await completePlanStep({
      planRunId: planRun.id,
      userId: params.userId,
      projectId: params.projectId,
      stepKey: step.stepKey,
      output,
      taskId,
    })
    for (const artifactType of step.outputArtifacts ?? []) {
      await createPlanArtifact({
        planRunId: planRun.id,
        stepKey: step.stepKey,
        artifactType,
        refId: artifactRefId({
          stepKey: step.stepKey,
          taskId,
          artifactType,
          output,
        }),
        payload: output,
      })
    }

    executedStepKeys.push(step.stepKey)
    if (taskId) {
      waitingTaskId = taskId
      break
    }
    completedStepKeys.add(step.stepKey)
  }

  if (!waitingTaskId && completedStepKeys.size === params.input.steps.length) {
    await completePlanRun({
      planRunId: planRun.id,
      userId: params.userId,
      projectId: params.projectId,
    })
  }

  return {
    success: true,
    planRunId: planRun.id,
    status: waitingTaskId ? 'waiting_task' : 'completed',
    executedStepKeys,
    waitingTaskId,
    snapshot: await getPlanRunSnapshot(planRun.id),
  }
}
