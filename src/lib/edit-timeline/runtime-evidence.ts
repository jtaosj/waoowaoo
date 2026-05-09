import type {
  EditTimelineBlackboardRuntimeFinalVideoEvidence,
  EditTimelineBlackboardRuntimeProviderTaskEvidence,
} from './blackboard'

type JsonRecord = Record<string, unknown>

export interface EditTimelineRuntimeEvidenceStep {
  operationId: string
  input?: JsonRecord | null
  output?: JsonRecord | null
  taskId?: string | null
}

export interface EditTimelineRuntimeEvidenceTask {
  id: string
  status: string
  payload?: unknown
  result?: unknown
  errorCode?: string | null
  errorMessage?: string | null
}

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function firstString(values: readonly unknown[]): string | null {
  for (const value of values) {
    const text = readString(value)
    if (text) return text
  }
  return null
}

function providerFromModel(model: string): string {
  const provider = model.split('::')[0]?.trim()
  return provider || model
}

function uniqueStrings(values: readonly unknown[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const text = readString(value)
    if (!text || seen.has(text)) continue
    seen.add(text)
    result.push(text)
  }
  return result
}

export function buildEditTimelineProviderTaskRuntimeEvidence(params: {
  step: EditTimelineRuntimeEvidenceStep
  task?: EditTimelineRuntimeEvidenceTask | null
  status: EditTimelineBlackboardRuntimeProviderTaskEvidence['status']
  blocker?: string | null
}): EditTimelineBlackboardRuntimeProviderTaskEvidence | null {
  if (params.step.operationId !== 'generate_panel_video') return null

  const input = params.step.input ?? {}
  const output = params.step.output ?? {}
  const outputData = isRecord(output.data) ? output.data : {}
  const taskPayload = isRecord(params.task?.payload) ? params.task.payload : {}
  const taskResult = isRecord(params.task?.result) ? params.task.result : {}
  const taskResultData = isRecord(taskResult.data) ? taskResult.data : {}
  const shotId = firstString([
    taskResult.shotId,
    taskResultData.shotId,
    output.shotId,
    outputData.shotId,
    input.shotId,
    input.targetShotId,
  ])
  const model = firstString([
    taskResult.model,
    taskResult.modelKey,
    taskResultData.model,
    taskResultData.modelKey,
    output.model,
    output.modelKey,
    outputData.model,
    outputData.modelKey,
    taskPayload.videoModel,
    taskPayload.model,
    input.videoModel,
    input.firstLastFrameModel,
  ])
  if (!shotId || !model) return null

  const provider = firstString([
    taskResult.provider,
    taskResultData.provider,
    output.provider,
    outputData.provider,
    taskPayload.provider,
    input.provider,
  ]) ?? providerFromModel(model)
  const taskId = firstString([
    params.step.taskId,
    output.taskId,
    output.id,
    outputData.taskId,
    outputData.id,
    taskResult.taskId,
    taskResult.id,
    taskResultData.taskId,
    taskResultData.id,
    params.task?.id,
  ])
  const outputUrl = firstString([
    taskResult.videoUrl,
    taskResult.outputUrl,
    taskResult.finalVideoUrl,
    taskResult.url,
    taskResultData.videoUrl,
    taskResultData.outputUrl,
    taskResultData.finalVideoUrl,
    taskResultData.url,
    output.videoUrl,
    output.outputUrl,
    output.finalVideoUrl,
    output.url,
    outputData.videoUrl,
    outputData.outputUrl,
    outputData.finalVideoUrl,
    outputData.url,
  ])

  return {
    shotId,
    provider,
    model,
    taskId,
    outputUrl,
    status: params.status,
    blocker: readString(params.blocker) ?? null,
  }
}

export function buildEditTimelineFinalVideoRuntimeEvidence(params: {
  step: EditTimelineRuntimeEvidenceStep
}): EditTimelineBlackboardRuntimeFinalVideoEvidence | null {
  if (params.step.operationId !== 'assemble_timeline_video') return null

  const output = params.step.output ?? {}
  const url = firstString([
    output.finalVideoUrl,
    output.outputUrl,
    output.url,
  ])
  if (!url) return null

  return {
    url,
    evidenceRefs: uniqueStrings([
      output.storageKey,
      output.editorProjectId,
      output.finalVideoUrl,
      output.outputUrl,
      output.url,
    ]),
    score: readNumber(output.score),
    issues: Array.isArray(output.blockers)
      ? output.blockers.map(readString).filter((item): item is string => item !== null)
      : [],
  }
}
