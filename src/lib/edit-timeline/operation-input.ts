import {
  mapControlPayloadToVideoProviderInput,
  type VideoProviderControlOptions,
} from './provider-options'

type GenerationOptionValue = string | number | boolean

export type GeneratePanelVideoTarget =
  | {
      panelId: string
      storyboardId?: never
      panelIndex?: never
    }
  | {
      panelId?: never
      storyboardId: string
      panelIndex: number
    }

export interface GeneratePanelVideoFirstLastFrameInput {
  flModel: string
  lastFrameImageUrl: string
  customPrompt?: string
}

export interface GeneratePanelVideoOperationInput {
  confirmed?: boolean
  panelId?: string
  storyboardId?: string
  panelIndex?: number
  videoModel: string
  customPrompt?: string
  firstLastFrame?: GeneratePanelVideoFirstLastFrameInput
  generationOptions?: Record<string, GenerationOptionValue>
}

export interface BuildGeneratePanelVideoInputFromControlParams {
  confirmed?: boolean
  target: GeneratePanelVideoTarget
  videoModel: string
  firstLastFrameModel?: string
  sourceFrameRef?: string
  mediaRefs?: Readonly<Record<string, string>>
  generationOptions?: Readonly<Record<string, GenerationOptionValue>>
  controlPayload: unknown
}

type UnknownRecord = Record<string, unknown>

function normalizeRequiredString(value: string | undefined, errorCode: string): string {
  const normalized = value?.trim() ?? ''
  if (!normalized) {
    throw new Error(errorCode)
  }
  return normalized
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim() ?? ''
  return normalized || undefined
}

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readOptionalStringField(input: UnknownRecord, key: string): string | undefined {
  const value = input[key]
  return typeof value === 'string' ? normalizeOptionalString(value) : undefined
}

function readRequiredStringField(input: UnknownRecord, key: string, errorCode: string): string {
  return normalizeRequiredString(readOptionalStringField(input, key), errorCode)
}

function readPanelTargetFromStepInput(input: UnknownRecord): GeneratePanelVideoTarget {
  const panelId = readOptionalStringField(input, 'panelId')
  if (panelId) return { panelId }

  const storyboardId = readOptionalStringField(input, 'storyboardId')
  const panelIndex = input.panelIndex
  if (!storyboardId && panelIndex === undefined) {
    throw new Error('EDIT_TIMELINE_GENERATE_PANEL_VIDEO_TARGET_REQUIRED')
  }
  const normalizedStoryboardId = normalizeRequiredString(
    storyboardId,
    'EDIT_TIMELINE_GENERATE_PANEL_VIDEO_STORYBOARD_ID_REQUIRED',
  )
  if (!Number.isInteger(panelIndex) || Number(panelIndex) < 0) {
    throw new Error('EDIT_TIMELINE_GENERATE_PANEL_VIDEO_PANEL_INDEX_INVALID')
  }
  return {
    storyboardId: normalizedStoryboardId,
    panelIndex: Number(panelIndex),
  }
}

function readMediaRefs(value: unknown): Readonly<Record<string, string>> | undefined {
  if (value === undefined) return undefined
  if (!isUnknownRecord(value)) {
    throw new Error('EDIT_TIMELINE_GENERATE_PANEL_VIDEO_MEDIA_REFS_INVALID')
  }

  const mediaRefs: Record<string, string> = {}
  for (const [key, refValue] of Object.entries(value)) {
    const normalizedKey = normalizeOptionalString(key)
    const normalizedRefValue = typeof refValue === 'string' ? normalizeOptionalString(refValue) : undefined
    if (!normalizedKey || !normalizedRefValue) {
      throw new Error(`EDIT_TIMELINE_GENERATE_PANEL_VIDEO_MEDIA_REFS_INVALID:${key}`)
    }
    mediaRefs[normalizedKey] = normalizedRefValue
  }
  return mediaRefs
}

function isGenerationOptionValue(value: unknown): value is GenerationOptionValue {
  return (
    typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
  )
}

function readGenerationOptions(value: unknown): Readonly<Record<string, GenerationOptionValue>> | undefined {
  if (value === undefined) return undefined
  if (!isUnknownRecord(value)) {
    throw new Error('EDIT_TIMELINE_GENERATE_PANEL_VIDEO_GENERATION_OPTIONS_INVALID')
  }

  const generationOptions: Record<string, GenerationOptionValue> = {}
  for (const [key, optionValue] of Object.entries(value)) {
    const normalizedKey = normalizeOptionalString(key)
    if (!normalizedKey || !isGenerationOptionValue(optionValue)) {
      throw new Error(`EDIT_TIMELINE_GENERATE_PANEL_VIDEO_GENERATION_OPTIONS_INVALID:${key}`)
    }
    generationOptions[normalizedKey] = optionValue
  }
  return generationOptions
}

function buildTargetInput(target: GeneratePanelVideoTarget): Pick<
  GeneratePanelVideoOperationInput,
  'panelId' | 'storyboardId' | 'panelIndex'
> {
  if (target.panelId !== undefined) {
    return {
      panelId: normalizeRequiredString(target.panelId, 'EDIT_TIMELINE_GENERATE_PANEL_VIDEO_PANEL_ID_REQUIRED'),
    }
  }

  const storyboardId = normalizeRequiredString(
    target.storyboardId,
    'EDIT_TIMELINE_GENERATE_PANEL_VIDEO_STORYBOARD_ID_REQUIRED',
  )
  if (!Number.isInteger(target.panelIndex) || target.panelIndex < 0) {
    throw new Error('EDIT_TIMELINE_GENERATE_PANEL_VIDEO_PANEL_INDEX_INVALID')
  }

  return {
    storyboardId,
    panelIndex: target.panelIndex,
  }
}

function buildGenerationOptions(
  options: VideoProviderControlOptions,
): Record<string, GenerationOptionValue> | undefined {
  const generationOptions: Record<string, GenerationOptionValue> = {}

  if (options.duration !== undefined) generationOptions.duration = options.duration
  if (options.aspectRatio !== undefined) generationOptions.aspectRatio = options.aspectRatio
  if (options.seed !== undefined) generationOptions.seed = options.seed

  return Object.keys(generationOptions).length ? generationOptions : undefined
}

function mergeGenerationOptions(params: {
  derived: Record<string, GenerationOptionValue> | undefined
  explicit: Readonly<Record<string, GenerationOptionValue>> | undefined
}): Record<string, GenerationOptionValue> | undefined {
  const merged = {
    ...(params.derived ?? {}),
    ...(params.explicit ?? {}),
  }
  return Object.keys(merged).length ? merged : undefined
}

function isSymbolicFrameRef(value: string): boolean {
  return (
    value.startsWith('media:')
    || value.startsWith('artifact:')
    || value.startsWith('timeline:')
    || value.startsWith('shot:')
    || value.startsWith('reference:')
  )
}

function resolveFrameMaterial(params: {
  ref: string | undefined
  mediaRefs: Readonly<Record<string, string>> | undefined
  missingCode: string
  unresolvedCode: string
}): string {
  const ref = normalizeRequiredString(params.ref, params.missingCode)
  const resolved = normalizeOptionalString(params.mediaRefs?.[ref])
  if (resolved) return resolved
  if (isSymbolicFrameRef(ref)) {
    throw new Error(`${params.unresolvedCode}:${ref}`)
  }
  return ref
}

function assertSourceFrameMatches(params: {
  mappedFirstFrameRef: string | undefined
  sourceFrameRef: string | undefined
}): void {
  if (!params.mappedFirstFrameRef) return
  const sourceFrameRef = normalizeRequiredString(
    params.sourceFrameRef,
    'EDIT_TIMELINE_GENERATE_PANEL_VIDEO_SOURCE_FRAME_REF_REQUIRED',
  )
  if (sourceFrameRef !== params.mappedFirstFrameRef) {
    throw new Error(`EDIT_TIMELINE_GENERATE_PANEL_VIDEO_SOURCE_FRAME_MISMATCH:${params.mappedFirstFrameRef}:${sourceFrameRef}`)
  }
}

export function buildGeneratePanelVideoInputFromControl(
  params: BuildGeneratePanelVideoInputFromControlParams,
): GeneratePanelVideoOperationInput {
  const mapped = mapControlPayloadToVideoProviderInput(params.controlPayload)
  const videoModel = normalizeRequiredString(
    params.videoModel,
    'EDIT_TIMELINE_GENERATE_PANEL_VIDEO_MODEL_REQUIRED',
  )
  const prompt = normalizeRequiredString(
    mapped.options.prompt,
    'EDIT_TIMELINE_GENERATE_PANEL_VIDEO_PROMPT_REQUIRED',
  )
  const generationOptions = mergeGenerationOptions({
    derived: buildGenerationOptions(mapped.options),
    explicit: params.generationOptions,
  })
  const operationInput: GeneratePanelVideoOperationInput = {
    ...buildTargetInput(params.target),
    videoModel,
    ...(params.confirmed !== undefined ? { confirmed: params.confirmed } : {}),
    ...(generationOptions ? { generationOptions } : {}),
  }

  if (mapped.executionMode === 'firstlastframe') {
    assertSourceFrameMatches({
      mappedFirstFrameRef: mapped.imageUrl,
      sourceFrameRef: params.sourceFrameRef,
    })
    const firstLastFrameModel = normalizeRequiredString(
      params.firstLastFrameModel,
      'EDIT_TIMELINE_GENERATE_PANEL_VIDEO_FIRSTLAST_MODEL_REQUIRED',
    )
    const lastFrameImageUrl = resolveFrameMaterial({
      ref: mapped.options.lastFrameImageUrl,
      mediaRefs: params.mediaRefs,
      missingCode: 'EDIT_TIMELINE_GENERATE_PANEL_VIDEO_LAST_FRAME_REQUIRED',
      unresolvedCode: 'EDIT_TIMELINE_GENERATE_PANEL_VIDEO_LAST_FRAME_UNRESOLVED',
    })
    return {
      ...operationInput,
      firstLastFrame: {
        flModel: firstLastFrameModel,
        lastFrameImageUrl,
        customPrompt: prompt,
      },
    }
  }

  return {
    ...operationInput,
    customPrompt: prompt,
  }
}

export function buildGeneratePanelVideoInputFromEditFirstStepInput(
  input: UnknownRecord,
): GeneratePanelVideoOperationInput {
  if (input.controlPayload === undefined) {
    throw new Error('EDIT_TIMELINE_GENERATE_PANEL_VIDEO_CONTROL_PAYLOAD_REQUIRED')
  }

  return buildGeneratePanelVideoInputFromControl({
    target: readPanelTargetFromStepInput(input),
    videoModel: readRequiredStringField(
      input,
      'videoModel',
      'EDIT_TIMELINE_GENERATE_PANEL_VIDEO_MODEL_REQUIRED',
    ),
    firstLastFrameModel: readOptionalStringField(input, 'firstLastFrameModel'),
    sourceFrameRef: readOptionalStringField(input, 'sourceFrameRef'),
    mediaRefs: readMediaRefs(input.mediaRefs),
    generationOptions: readGenerationOptions(input.generationOptions),
    controlPayload: input.controlPayload,
  })
}
