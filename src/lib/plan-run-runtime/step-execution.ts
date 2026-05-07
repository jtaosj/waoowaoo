export type JsonRecord = Record<string, unknown>

export interface ExecutablePlanStep {
  stepKey: string
  skillId: string
  operationId: string
  inputArtifacts?: string[]
  outputArtifacts?: string[]
  dependsOn?: string[]
  input?: JsonRecord | null
}

const EPISODE_CONTEXT_OPERATION_IDS = new Set([
  'split_clips',
  'write_screenplay',
  'generate_voice_lines',
  'generate_voice_line_audio',
  'generate_episode_voice_audio',
  'generate_episode_videos',
])

export function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[MaxDepth]'
  if (typeof value === 'string') {
    if (value.startsWith('data:')) return '[OmittedDataUrl]'
    if (value.length > 4000) return `${value.slice(0, 4000)}...[truncated]`
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1))
  if (!isRecord(value)) return null
  const next: JsonRecord = {}
  for (const [key, item] of Object.entries(value)) {
    const lowerKey = key.toLowerCase()
    if (lowerKey.includes('raw') && lowerKey.includes('response')) continue
    if (lowerKey.includes('base64')) continue
    next[key] = sanitizeValue(item, depth + 1)
  }
  return next
}

export function sanitizeOutput(value: unknown): JsonRecord {
  const sanitized = sanitizeValue(value)
  return isRecord(sanitized) ? sanitized : { value: sanitized }
}

export function extractTaskId(result: unknown): string | null {
  if (!isRecord(result)) return null
  return readString(result.taskId)
    || readString(result.id)
    || (isRecord(result.data) ? readString(result.data.taskId) : null)
}

export function artifactRefId(params: {
  stepKey: string
  taskId: string | null
  output: JsonRecord
}): string {
  return readString(params.output.mediaId)
    || readString(params.output.imageMediaId)
    || readString(params.output.videoMediaId)
    || readString(params.output.audioMediaId)
    || readString(params.output.panelId)
    || readString(params.output.clipId)
    || readString(params.output.assetId)
    || params.taskId
    || params.stepKey
}

export function findRunnableExecutableStep(params: {
  steps: ExecutablePlanStep[]
  completedStepKeys: Set<string>
  startedStepKeys?: Set<string>
}): ExecutablePlanStep | null {
  return params.steps.find((step) => {
    if (params.completedStepKeys.has(step.stepKey)) return false
    if (params.startedStepKeys?.has(step.stepKey)) return false
    return (step.dependsOn ?? []).every((dependency) => params.completedStepKeys.has(dependency))
  }) ?? null
}

export function buildOperationInput(params: {
  step: ExecutablePlanStep
  episodeId?: string | null
}): JsonRecord {
  const input = { ...(params.step.input ?? {}) }
  const episodeId = readString(params.episodeId)
  if (
    episodeId
    && EPISODE_CONTEXT_OPERATION_IDS.has(params.step.operationId)
    && !readString(input.episodeId)
  ) {
    input.episodeId = episodeId
  }
  return {
    ...input,
    confirmed: true,
  }
}
