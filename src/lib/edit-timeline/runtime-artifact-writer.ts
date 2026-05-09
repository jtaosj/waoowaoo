import { ApiError } from '@/lib/api-errors'
import {
  createPlanArtifact,
  getPlanRunSnapshot,
} from '@/lib/plan-run-runtime/service'
import {
  isRecord,
  readString,
  type ExecutablePlanStep,
  type JsonRecord,
} from '@/lib/plan-run-runtime/step-execution'
import { TASK_STATUS } from '@/lib/task/types'
import {
  editTimelineBlackboardSchema,
  mergeEditTimelineBlackboardRuntimeEvidence,
  type EditTimelineBlackboard,
  type EditTimelineBlackboardProviderTask,
  type EditTimelineBlackboardRuntimeFinalVideoEvidence,
  type EditTimelineBlackboardRuntimeProviderTaskEvidence,
} from './blackboard'
import {
  EDIT_TIMELINE_BLACKBOARD_ARTIFACT_TYPE,
  EDIT_TIMELINE_WORKFLOW_ARTIFACT_TYPE,
} from './runtime-artifacts'
import {
  buildEditTimelineFinalVideoRuntimeEvidence,
  buildEditTimelineProviderTaskRuntimeEvidence,
  type EditTimelineRuntimeEvidenceTask,
} from './runtime-evidence'

export type EditTimelinePlanRunSnapshot = NonNullable<Awaited<ReturnType<typeof getPlanRunSnapshot>>>
export type EditTimelinePlanRunSnapshotStep = EditTimelinePlanRunSnapshot['steps'][number]

export type EditTimelineRuntimeEvidenceStep =
  | EditTimelinePlanRunSnapshotStep
  | ExecutablePlanStep

export interface PersistEditTimelineRuntimeEvidenceResult {
  readonly blackboard: EditTimelineBlackboard | null
  readonly workflow: JsonRecord | null
  readonly snapshot: EditTimelinePlanRunSnapshot
}

function requireSnapshot(snapshot: EditTimelinePlanRunSnapshot | null, planRunId: string): EditTimelinePlanRunSnapshot {
  if (snapshot) return snapshot
  throw new ApiError('NOT_FOUND', {
    code: 'PLAN_RUN_NOT_FOUND',
    message: `plan run not found: ${planRunId}`,
  })
}

async function reloadSnapshot(planRunId: string): Promise<EditTimelinePlanRunSnapshot> {
  return requireSnapshot(await getPlanRunSnapshot(planRunId), planRunId)
}

export function findEditTimelineArtifactPayload(
  snapshot: EditTimelinePlanRunSnapshot,
  artifactType: string,
): JsonRecord | null {
  for (let index = snapshot.artifacts.length - 1; index >= 0; index -= 1) {
    const artifact = snapshot.artifacts[index]
    if (artifact?.artifactType !== artifactType) continue
    return isRecord(artifact.payload) ? artifact.payload : null
  }
  return null
}

export function readEditTimelineBlackboardFromSnapshot(
  snapshot: EditTimelinePlanRunSnapshot,
): EditTimelineBlackboard | null {
  const payload = findEditTimelineArtifactPayload(snapshot, EDIT_TIMELINE_BLACKBOARD_ARTIFACT_TYPE)
  if (!payload) return null
  const parsed = editTimelineBlackboardSchema.safeParse(payload)
  if (parsed.success) return parsed.data
  throw new ApiError('INVALID_PARAMS', {
    code: 'EDIT_TIMELINE_BLACKBOARD_ARTIFACT_INVALID',
    message: 'edit timeline blackboard artifact is invalid',
  })
}

export function readEditTimelineWorkflowFromSnapshot(
  snapshot: EditTimelinePlanRunSnapshot,
): JsonRecord | null {
  return findEditTimelineArtifactPayload(snapshot, EDIT_TIMELINE_WORKFLOW_ARTIFACT_TYPE)
}

function workflowStatusFromProviderTaskStatus(
  status: EditTimelineBlackboardRuntimeProviderTaskEvidence['status'],
): 'planned' | 'blocked' | 'submitted' | 'running' | 'succeeded' | 'failed' {
  if (status === 'succeeded') return 'succeeded'
  if (status === 'failed') return 'failed'
  if (status === 'blocked') return 'blocked'
  if (status === 'running') return 'running'
  if (status === 'submitted') return 'submitted'
  return 'planned'
}

type WorkflowSnapshotStatus = ReturnType<typeof workflowStatusFromProviderTaskStatus>

function workflowStatusFromProviderTask(task: EditTimelineBlackboardProviderTask): WorkflowSnapshotStatus {
  if (task.status === 'succeeded' && !task.outputUrl) return 'running'
  if ((task.status === 'submitted' || task.status === 'running') && !task.taskId) return 'planned'
  return workflowStatusFromProviderTaskStatus(task.status)
}

function finalVideoWorkflowRef(blackboard: EditTimelineBlackboard): string | null {
  return blackboard.finalCritic.evidenceRefs.find((ref) => {
    const normalized = ref.trim().toLowerCase()
    return normalized.endsWith('.mp4')
      || normalized.endsWith('.mov')
      || normalized.endsWith('.webm')
      || normalized.includes('final-video')
      || normalized.includes('final-videos/')
      || normalized.includes('/video-editor/')
  }) ?? null
}

function finalVideoWorkflowStatus(params: {
  blackboard: EditTimelineBlackboard
  finalVideo?: EditTimelineBlackboardRuntimeFinalVideoEvidence | null
}): WorkflowSnapshotStatus {
  if (params.finalVideo) return 'succeeded'
  if (params.blackboard.finalCritic.status === 'scored' && finalVideoWorkflowRef(params.blackboard)) {
    return 'succeeded'
  }
  if (params.blackboard.finalCritic.status === 'blocked') return 'blocked'
  if (params.blackboard.finalCritic.status === 'ready') return 'running'
  return 'planned'
}

export function providerRuntimeStatusFromTaskStatus(
  status: string,
): EditTimelineBlackboardRuntimeProviderTaskEvidence['status'] | null {
  if (status === TASK_STATUS.QUEUED) return 'submitted'
  if (status === TASK_STATUS.PROCESSING) return 'running'
  return null
}

function buildProviderTaskWorkflowArtifacts(blackboard: EditTimelineBlackboard): JsonRecord[] {
  return blackboard.shots.flatMap((shot) => {
    if (!shot.providerTask.taskId) return []
    return [{
      id: `artifact-provider-task-${shot.shotId}`,
      kind: 'provider-task',
      status: workflowStatusFromProviderTask(shot.providerTask),
      ref: shot.providerTask.taskId,
    }]
  })
}

function workflowArtifactKey(item: unknown): string | null {
  if (!isRecord(item)) return null
  const id = readString(item.id)
  const kind = readString(item.kind)
  if (!id || !kind) return null
  return `${kind}:${id}`
}

function appendMissingWorkflowArtifacts(params: {
  existing: readonly unknown[]
  additions: readonly JsonRecord[]
}): unknown[] {
  const seen = new Set<string>()
  const output: unknown[] = []
  for (const item of params.existing) {
    const key = workflowArtifactKey(item)
    if (key) seen.add(key)
    output.push(item)
  }
  for (const item of params.additions) {
    const key = workflowArtifactKey(item)
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    output.push(item)
  }
  return output
}

function mergeWorkflowSnapshotPayload(params: {
  payload: JsonRecord
  blackboard: EditTimelineBlackboard
  finalVideo?: EditTimelineBlackboardRuntimeFinalVideoEvidence | null
}): JsonRecord {
  const shotById = new Map(params.blackboard.shots.map((shot) => [shot.shotId, shot] as const))
  const providerTasks = Array.isArray(params.payload.providerTasks)
    ? params.payload.providerTasks.map((item) => {
        if (!isRecord(item)) return item
        const shotId = readString(item.shotId)
        const shot = shotId ? shotById.get(shotId) : null
        if (!shot) return item
        return {
          ...item,
          id: shot.providerTask.taskId ?? readString(item.id) ?? `provider-task-${shot.shotId}`,
          status: workflowStatusFromProviderTask(shot.providerTask),
          providerModel: shot.providerTask.model,
          outputUrl: shot.providerTask.outputUrl,
          blockers: shot.providerTask.blocker ? [shot.providerTask.blocker] : [],
        }
      })
    : params.payload.providerTasks
  const finalVideoRef = params.finalVideo?.url ?? finalVideoWorkflowRef(params.blackboard)
  const finalVideoStatus = finalVideoWorkflowStatus({
    blackboard: params.blackboard,
    finalVideo: params.finalVideo ?? null,
  })
  const workflowTimelineId = readString(params.payload.timelineId) ?? params.blackboard.timelineId
  const baseArtifacts = Array.isArray(params.payload.artifacts)
    ? params.payload.artifacts.map((item) => {
        if (!isRecord(item)) return item
        const kind = readString(item.kind)
        if (kind !== 'video') return item
        const nextItem: JsonRecord = {
          ...item,
          status: finalVideoStatus,
        }
        if (finalVideoRef) {
          nextItem.ref = finalVideoRef
        }
        return nextItem
      })
    : []
  const artifacts = appendMissingWorkflowArtifacts({
    existing: baseArtifacts,
    additions: [
      ...buildProviderTaskWorkflowArtifacts(params.blackboard),
      ...(finalVideoStatus !== 'planned' || finalVideoRef
        ? [{
            id: `artifact-final-video-${workflowTimelineId}`,
            kind: 'video',
            status: finalVideoStatus,
            ref: finalVideoRef,
          }]
        : []),
    ],
  })

  return {
    ...params.payload,
    blackboard: { ...params.blackboard },
    providerTasks,
    artifacts,
  }
}

async function persistWorkflowBlackboard(params: {
  planRunId: string
  snapshot: EditTimelinePlanRunSnapshot
  blackboard: EditTimelineBlackboard
  finalVideo?: EditTimelineBlackboardRuntimeFinalVideoEvidence | null
}): Promise<void> {
  const workflowPayload = readEditTimelineWorkflowFromSnapshot(params.snapshot)
  if (!workflowPayload) return
  const nextPayload = mergeWorkflowSnapshotPayload({
    payload: workflowPayload,
    blackboard: params.blackboard,
    finalVideo: params.finalVideo ?? null,
  })
  await createPlanArtifact({
    planRunId: params.planRunId,
    artifactType: EDIT_TIMELINE_WORKFLOW_ARTIFACT_TYPE,
    refId: readString(workflowPayload.timelineId) ?? params.blackboard.timelineId,
    payload: nextPayload,
  })
}

async function persistBlackboardRuntimeEvidence(params: {
  planRunId: string
  snapshot: EditTimelinePlanRunSnapshot
  providerTasks?: readonly EditTimelineBlackboardRuntimeProviderTaskEvidence[]
  finalVideo?: EditTimelineBlackboardRuntimeFinalVideoEvidence | null
  finalVideoBlocker?: string | null
}): Promise<PersistEditTimelineRuntimeEvidenceResult> {
  const blackboard = readEditTimelineBlackboardFromSnapshot(params.snapshot)
  if (!blackboard) {
    const snapshot = await reloadSnapshot(params.planRunId)
    return {
      blackboard: null,
      workflow: readEditTimelineWorkflowFromSnapshot(snapshot),
      snapshot,
    }
  }

  const merged = mergeEditTimelineBlackboardRuntimeEvidence(blackboard, {
    providerTasks: params.providerTasks ?? [],
    finalVideo: params.finalVideo ?? null,
    finalVideoBlocker: params.finalVideoBlocker ?? null,
  })
  await createPlanArtifact({
    planRunId: params.planRunId,
    artifactType: EDIT_TIMELINE_BLACKBOARD_ARTIFACT_TYPE,
    refId: merged.id,
    payload: { ...merged },
  })
  const snapshotAfterBlackboard = await reloadSnapshot(params.planRunId)
  await persistWorkflowBlackboard({
    planRunId: params.planRunId,
    snapshot: snapshotAfterBlackboard,
    blackboard: merged,
    finalVideo: params.finalVideo ?? null,
  })
  const snapshot = await reloadSnapshot(params.planRunId)
  return {
    blackboard: readEditTimelineBlackboardFromSnapshot(snapshot),
    workflow: readEditTimelineWorkflowFromSnapshot(snapshot),
    snapshot,
  }
}

function stepTaskId(step: EditTimelineRuntimeEvidenceStep): string | null {
  return 'taskId' in step ? readString(step.taskId) : null
}

export async function persistEditTimelineProviderEvidence(params: {
  planRunId: string
  snapshot: EditTimelinePlanRunSnapshot
  step: EditTimelineRuntimeEvidenceStep
  task?: EditTimelineRuntimeEvidenceTask | null
  output?: JsonRecord | null
  status: EditTimelineBlackboardRuntimeProviderTaskEvidence['status']
  blocker?: string | null
}): Promise<PersistEditTimelineRuntimeEvidenceResult> {
  if (!readEditTimelineBlackboardFromSnapshot(params.snapshot)) {
    const snapshot = await reloadSnapshot(params.planRunId)
    return {
      blackboard: null,
      workflow: readEditTimelineWorkflowFromSnapshot(snapshot),
      snapshot,
    }
  }
  const evidence = buildEditTimelineProviderTaskRuntimeEvidence({
    step: {
      operationId: params.step.operationId,
      input: params.step.input ?? null,
      output: params.output ?? null,
      taskId: stepTaskId(params.step),
    },
    task: params.task ?? null,
    status: params.status,
    blocker: params.blocker ?? null,
  })
  if (!evidence) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'EDIT_TIMELINE_RUNTIME_PROVIDER_EVIDENCE_INCOMPLETE',
      message: `provider evidence is incomplete for step ${params.step.stepKey}`,
    })
  }
  return await persistBlackboardRuntimeEvidence({
    planRunId: params.planRunId,
    snapshot: params.snapshot,
    providerTasks: [evidence],
  })
}

export async function persistEditTimelineFinalVideoEvidence(params: {
  planRunId: string
  snapshot: EditTimelinePlanRunSnapshot
  step: ExecutablePlanStep
  output: JsonRecord
}): Promise<PersistEditTimelineRuntimeEvidenceResult> {
  if (!readEditTimelineBlackboardFromSnapshot(params.snapshot)) {
    const snapshot = await reloadSnapshot(params.planRunId)
    return {
      blackboard: null,
      workflow: readEditTimelineWorkflowFromSnapshot(snapshot),
      snapshot,
    }
  }
  const evidence = buildEditTimelineFinalVideoRuntimeEvidence({
    step: {
      operationId: params.step.operationId,
      input: params.step.input ?? null,
      output: params.output,
      taskId: null,
    },
  })
  if (!evidence) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'EDIT_TIMELINE_FINAL_VIDEO_EVIDENCE_MISSING',
      message: `final video evidence is missing for step ${params.step.stepKey}`,
    })
  }
  return await persistBlackboardRuntimeEvidence({
    planRunId: params.planRunId,
    snapshot: params.snapshot,
    finalVideo: evidence,
  })
}

export async function persistEditTimelineFinalVideoBlocker(params: {
  planRunId: string
  snapshot: EditTimelinePlanRunSnapshot
  blocker: string
}): Promise<PersistEditTimelineRuntimeEvidenceResult> {
  return await persistBlackboardRuntimeEvidence({
    planRunId: params.planRunId,
    snapshot: params.snapshot,
    finalVideoBlocker: params.blocker,
  })
}
