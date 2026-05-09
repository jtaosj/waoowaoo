import { controlPayloadSchema } from './types'
import type { ControlPayload } from './types'

export interface VideoProviderControlOptions {
  prompt: string
  duration?: number
  aspectRatio?: string
  seed?: number
  lastFrameImageUrl?: string
}

export interface RetainedTimelineControls {
  characterRefIds: string[]
  performanceRefIds: string[]
  negativePrompt?: string
  providerHints?: Record<string, unknown>
}

export type VideoProviderExecutionMode = 'normal' | 'firstlastframe'

export interface VideoProviderControlInput {
  executionMode: VideoProviderExecutionMode
  imageUrl?: string
  options: VideoProviderControlOptions
  retainedTimelineControls: RetainedTimelineControls
}

function formatParseIssue(path: (string | number)[], message: string): string {
  const location = path.length ? path.join('.') : 'root'
  return `${location}:${message}`
}

function parseControlPayload(input: unknown): ControlPayload {
  const parsed = controlPayloadSchema.safeParse(input)
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => formatParseIssue(issue.path, issue.message))
      .join('|')
    throw new Error(`EDIT_TIMELINE_CONTROL_PAYLOAD_INVALID:${details}`)
  }
  return parsed.data
}

function assertNoUnsupportedProviderControls(control: ControlPayload): void {
  if (control.referenceImageRefs.length > 0) {
    throw new Error('EDIT_TIMELINE_VIDEO_PROVIDER_UNSUPPORTED_CONTROL:referenceImageRefs')
  }
  if (control.lastFrameRef !== undefined && control.firstFrameRef === undefined) {
    throw new Error('EDIT_TIMELINE_VIDEO_PROVIDER_LAST_FRAME_REQUIRES_FIRST_FRAME')
  }
}

function buildProviderPrompt(control: ControlPayload): string {
  return [
    control.prompt,
    control.subjectMotion,
    control.cameraMotion,
    control.sceneMotion,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .join('\n')
}

function buildRetainedTimelineControls(control: ControlPayload): RetainedTimelineControls {
  const negativePrompt = control.negativePrompt?.trim()
  return {
    characterRefIds: control.characterRefIds,
    performanceRefIds: control.performanceRefIds,
    ...(negativePrompt ? { negativePrompt } : {}),
    ...(control.providerHints ? { providerHints: control.providerHints } : {}),
  }
}

export function mapControlPayloadToVideoProviderInput(input: unknown): VideoProviderControlInput {
  const control = parseControlPayload(input)
  assertNoUnsupportedProviderControls(control)
  const executionMode: VideoProviderExecutionMode = control.lastFrameRef ? 'firstlastframe' : 'normal'

  const options: VideoProviderControlOptions = {
    prompt: buildProviderPrompt(control),
  }

  if (control.durationSeconds !== undefined) {
    if (!Number.isInteger(control.durationSeconds)) {
      throw new Error(`EDIT_TIMELINE_VIDEO_PROVIDER_DURATION_NON_INTEGER:${control.durationSeconds}`)
    }
    options.duration = control.durationSeconds
  }
  if (control.aspectRatio !== undefined) options.aspectRatio = control.aspectRatio
  if (control.seed !== undefined) options.seed = control.seed
  if (control.lastFrameRef !== undefined) options.lastFrameImageUrl = control.lastFrameRef

  return {
    executionMode,
    ...(control.firstFrameRef ? { imageUrl: control.firstFrameRef } : {}),
    options,
    retainedTimelineControls: buildRetainedTimelineControls(control),
  }
}
