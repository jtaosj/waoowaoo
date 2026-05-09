import { z } from 'zod'
import type { ExecutablePlanInput, ExecutablePlanStep } from '@/lib/plan-run-runtime/executor'
import { parseEditTimeline } from './compiler'
import type { ParsedEditTimeline, ReferenceAsset, ShotNode } from './types'

type UnknownRecord = Record<string, unknown>

const nonEmptyStringSchema = z.string().trim().min(1)

export const editTimelineMaterialStatusSchema = z.enum([
  'ready',
  'missing',
  'unresolved',
  'not_required',
])

export const editTimelineProviderModeSchema = z.enum([
  'text-to-video',
  'first-frame',
  'first-last-frame',
  'reference-guided',
])

export const editTimelineIssueSchema = z.object({
  code: nonEmptyStringSchema,
  message: nonEmptyStringSchema,
}).strict()

export const editTimelineMaterialStatusDetailSchema = z.object({
  ref: nonEmptyStringSchema.nullable(),
  resolvedRef: nonEmptyStringSchema.nullable(),
  status: editTimelineMaterialStatusSchema,
}).strict()

export const editTimelineReferenceAssetStatusSchema = z.object({
  referenceId: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  artifactRef: nonEmptyStringSchema,
  resolvedRef: nonEmptyStringSchema.nullable(),
  status: editTimelineMaterialStatusSchema,
}).strict()

export const editTimelineShotConfirmationSummarySchema = z.object({
  shotId: nonEmptyStringSchema,
  segmentId: nonEmptyStringSchema,
  shotTitle: nonEmptyStringSchema,
  startMs: z.number().int().min(0),
  durationMs: z.number().int().positive(),
  operationId: nonEmptyStringSchema,
  providerMode: editTimelineProviderModeSchema,
  referenceIds: z.array(nonEmptyStringSchema),
  firstFrame: editTimelineMaterialStatusDetailSchema,
  lastFrame: editTimelineMaterialStatusDetailSchema,
  referenceImages: z.array(editTimelineMaterialStatusDetailSchema),
  referenceAssets: z.array(editTimelineReferenceAssetStatusSchema),
  canRedo: z.boolean(),
}).strict()

export const editTimelineConfirmationSummarySchema = z.object({
  timelineId: nonEmptyStringSchema,
  timelineTitle: nonEmptyStringSchema,
  totalDurationMs: z.number().int().positive(),
  aspectRatio: nonEmptyStringSchema,
  segmentCount: z.number().int().min(1),
  shotCount: z.number().int().min(1),
  providerTaskCount: z.number().int().min(0),
  effects: z.object({
    billable: z.boolean(),
    externalSideEffects: z.boolean(),
    longRunning: z.boolean(),
  }).strict(),
  blockers: z.array(editTimelineIssueSchema),
  unresolvedRefs: z.array(nonEmptyStringSchema),
  redoCandidates: z.array(nonEmptyStringSchema),
  shots: z.array(editTimelineShotConfirmationSummarySchema),
}).strict()

export type EditTimelineIssue = z.output<typeof editTimelineIssueSchema>
export type EditTimelineMaterialStatus = z.output<typeof editTimelineMaterialStatusSchema>
export type EditTimelineProviderMode = z.output<typeof editTimelineProviderModeSchema>
export type EditTimelineMaterialStatusDetail = z.output<typeof editTimelineMaterialStatusDetailSchema>
export type EditTimelineReferenceAssetStatus = z.output<typeof editTimelineReferenceAssetStatusSchema>
export type EditTimelineShotConfirmationSummary = z.output<typeof editTimelineShotConfirmationSummarySchema>
export type EditTimelineConfirmationSummary = z.output<typeof editTimelineConfirmationSummarySchema>

export interface BuildEditTimelineConfirmationSummaryInput {
  timeline: unknown
  plan: ExecutablePlanInput
  materializedRefs?: Readonly<Record<string, string>>
}

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readStepInput(step: ExecutablePlanStep): UnknownRecord | null {
  return isRecord(step.input) ? step.input : null
}

function readShotIdFromStep(step: ExecutablePlanStep): string | null {
  return readString(readStepInput(step)?.shotId)
}

function isEvaluationStep(step: ExecutablePlanStep): boolean {
  return !!readString(readStepInput(step)?.materializeStepKey)
}

function isEditFirstMaterializeStep(step: ExecutablePlanStep): boolean {
  const input = readStepInput(step)
  if (!input) return false
  return input.editFirst === true && !!readString(input.shotId) && !isEvaluationStep(step)
}

function isSymbolicRef(ref: string): boolean {
  return (
    ref.startsWith('media:')
    || ref.startsWith('artifact:')
    || ref.startsWith('timeline:')
    || ref.startsWith('shot:')
    || ref.startsWith('reference:')
  )
}

function statusDetail(params: {
  ref: string | undefined
  materializedRefs: Readonly<Record<string, string>> | undefined
}): EditTimelineMaterialStatusDetail {
  const ref = params.ref?.trim()
  if (!ref) {
    return {
      ref: null,
      resolvedRef: null,
      status: 'not_required',
    }
  }
  const resolvedRef = params.materializedRefs?.[ref]?.trim() || null
  if (resolvedRef) {
    return {
      ref,
      resolvedRef,
      status: 'ready',
    }
  }
  return {
    ref,
    resolvedRef: isSymbolicRef(ref) ? null : ref,
    status: isSymbolicRef(ref) ? 'unresolved' : 'ready',
  }
}

function referenceAssetStatus(params: {
  reference: ReferenceAsset
  materializedRefs: Readonly<Record<string, string>> | undefined
}): EditTimelineReferenceAssetStatus {
  const detail = statusDetail({
    ref: params.reference.artifactRef,
    materializedRefs: params.materializedRefs,
  })
  return {
    referenceId: params.reference.id,
    label: params.reference.label,
    artifactRef: params.reference.artifactRef,
    resolvedRef: detail.resolvedRef,
    status: detail.status,
  }
}

function providerMode(shot: ShotNode): EditTimelineProviderMode {
  if (shot.control.lastFrameRef) return 'first-last-frame'
  if (shot.control.firstFrameRef) return 'first-frame'
  if (shot.control.referenceImageRefs.length > 0) return 'reference-guided'
  return 'text-to-video'
}

function issue(code: string, message: string): EditTimelineIssue {
  return { code, message }
}

function collectMaterialBlockers(params: {
  shot: ShotNode
  firstFrame: EditTimelineMaterialStatusDetail
  lastFrame: EditTimelineMaterialStatusDetail
  referenceImages: EditTimelineMaterialStatusDetail[]
  referenceAssets: EditTimelineReferenceAssetStatus[]
}): EditTimelineIssue[] {
  const blockers: EditTimelineIssue[] = []
  if (params.shot.control.lastFrameRef && !params.shot.control.firstFrameRef) {
    blockers.push(issue(
      'EDIT_TIMELINE_FIRST_FRAME_REQUIRED',
      `EDIT_TIMELINE_FIRST_FRAME_REQUIRED:${params.shot.id}:${params.shot.control.lastFrameRef}`,
    ))
  }
  if (params.firstFrame.status === 'unresolved') {
    blockers.push(issue(
      'EDIT_TIMELINE_FIRST_FRAME_UNRESOLVED',
      `EDIT_TIMELINE_FIRST_FRAME_UNRESOLVED:${params.shot.id}:${params.firstFrame.ref}`,
    ))
  }
  if (params.lastFrame.status === 'unresolved') {
    blockers.push(issue(
      'EDIT_TIMELINE_LAST_FRAME_UNRESOLVED',
      `EDIT_TIMELINE_LAST_FRAME_UNRESOLVED:${params.shot.id}:${params.lastFrame.ref}`,
    ))
  }
  for (const referenceImage of params.referenceImages) {
    if (referenceImage.status !== 'unresolved') continue
    blockers.push(issue(
      'EDIT_TIMELINE_REFERENCE_IMAGE_UNRESOLVED',
      `EDIT_TIMELINE_REFERENCE_IMAGE_UNRESOLVED:${params.shot.id}:${referenceImage.ref}`,
    ))
  }
  for (const referenceAsset of params.referenceAssets) {
    if (referenceAsset.status !== 'unresolved') continue
    blockers.push(issue(
      'EDIT_TIMELINE_REFERENCE_ASSET_UNRESOLVED',
      `EDIT_TIMELINE_REFERENCE_ASSET_UNRESOLVED:${params.shot.id}:${referenceAsset.referenceId}:${referenceAsset.artifactRef}`,
    ))
  }
  return blockers
}

function totalDurationMs(timeline: ParsedEditTimeline): number {
  return Math.max(
    ...timeline.segments.map((segment) => segment.startMs + segment.durationMs),
  )
}

function materializeStepsByShot(plan: ExecutablePlanInput): Map<string, ExecutablePlanStep> {
  const byShotId = new Map<string, ExecutablePlanStep>()
  for (const step of plan.steps) {
    if (!isEditFirstMaterializeStep(step)) continue
    const shotId = readShotIdFromStep(step)
    if (!shotId) continue
    byShotId.set(shotId, step)
  }
  return byShotId
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

export function buildEditTimelineConfirmationSummary(
  input: BuildEditTimelineConfirmationSummaryInput,
): EditTimelineConfirmationSummary {
  const timeline = parseEditTimeline(input.timeline)
  const materializeByShot = materializeStepsByShot(input.plan)
  const referencesById = new Map(timeline.references.map((reference) => [reference.id, reference]))
  const blockers: EditTimelineIssue[] = []
  const unresolvedRefs: string[] = []
  const shots: EditTimelineShotConfirmationSummary[] = timeline.shots.map((shot) => {
    const materializeStep = materializeByShot.get(shot.id)
    if (!materializeStep) {
      blockers.push(issue(
        'EDIT_TIMELINE_SHOT_STEP_MISSING',
        `EDIT_TIMELINE_SHOT_STEP_MISSING:${shot.id}`,
      ))
    }

    const firstFrame = statusDetail({
      ref: shot.control.firstFrameRef,
      materializedRefs: input.materializedRefs,
    })
    const lastFrame = statusDetail({
      ref: shot.control.lastFrameRef,
      materializedRefs: input.materializedRefs,
    })
    const referenceImages = shot.control.referenceImageRefs.map((ref) => statusDetail({
      ref,
      materializedRefs: input.materializedRefs,
    }))
    const referenceAssets = shot.referenceIds.map((referenceId) => {
      const reference = referencesById.get(referenceId)
      if (!reference) {
        throw new Error(`EDIT_TIMELINE_UNKNOWN_SHOT_REFERENCE:${shot.id}:${referenceId}`)
      }
      return referenceAssetStatus({
        reference,
        materializedRefs: input.materializedRefs,
      })
    })
    const shotBlockers = collectMaterialBlockers({
      shot,
      firstFrame,
      lastFrame,
      referenceImages,
      referenceAssets,
    })
    blockers.push(...shotBlockers)
    for (const detail of [firstFrame, lastFrame, ...referenceImages]) {
      if (detail.status === 'unresolved' && detail.ref) unresolvedRefs.push(detail.ref)
    }
    for (const referenceAsset of referenceAssets) {
      if (referenceAsset.status === 'unresolved') unresolvedRefs.push(referenceAsset.artifactRef)
    }

    return {
      shotId: shot.id,
      segmentId: shot.segmentId,
      shotTitle: shot.title,
      startMs: shot.startMs,
      durationMs: shot.durationMs,
      operationId: materializeStep?.operationId ?? 'missing-operation',
      providerMode: providerMode(shot),
      referenceIds: shot.referenceIds,
      firstFrame,
      lastFrame,
      referenceImages,
      referenceAssets,
      canRedo: !!materializeStep,
    }
  })
  const providerTaskCount = Array.from(materializeByShot.values()).length

  return {
    timelineId: timeline.id,
    timelineTitle: timeline.title,
    totalDurationMs: totalDurationMs(timeline),
    aspectRatio: timeline.aspectRatio,
    segmentCount: timeline.segments.length,
    shotCount: timeline.shots.length,
    providerTaskCount,
    effects: {
      billable: providerTaskCount > 0,
      externalSideEffects: providerTaskCount > 0,
      longRunning: providerTaskCount > 0,
    },
    blockers,
    unresolvedRefs: uniqueStrings(unresolvedRefs),
    redoCandidates: shots.filter((shot) => shot.canRedo).map((shot) => shot.shotId),
    shots,
  }
}
