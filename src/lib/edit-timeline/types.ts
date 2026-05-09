import { z } from 'zod'

const nonEmptyStringSchema = z.string().trim().min(1)
const nonNegativeIntegerSchema = z.number().int().min(0)
const positiveIntegerSchema = z.number().int().positive()

export const timelineTrackSchema = z.enum(['video', 'audio', 'voice', 'music'])

export const referenceAssetKindSchema = z.enum([
  'character',
  'location',
  'prop',
  'style',
  'first_frame',
  'last_frame',
  'performance',
])

export const referenceAssetSchema = z.object({
  id: nonEmptyStringSchema,
  kind: referenceAssetKindSchema,
  label: nonEmptyStringSchema,
  artifactRef: nonEmptyStringSchema,
  description: z.string().trim().optional(),
}).strict()

export const continuityBibleSchema = z.object({
  characters: z.array(nonEmptyStringSchema).default([]),
  locations: z.array(nonEmptyStringSchema).default([]),
  props: z.array(nonEmptyStringSchema).default([]),
  visualRules: z.array(nonEmptyStringSchema).default([]),
  audioRules: z.array(nonEmptyStringSchema).default([]),
}).strict()

export const timelineSegmentSchema = z.object({
  id: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  startMs: nonNegativeIntegerSchema,
  durationMs: positiveIntegerSchema,
  intent: nonEmptyStringSchema,
  shotIds: z.array(nonEmptyStringSchema).default([]),
}).strict()

export const controlPayloadSchema = z.object({
  prompt: nonEmptyStringSchema,
  negativePrompt: z.string().trim().optional(),
  durationSeconds: z.number().positive().optional(),
  aspectRatio: nonEmptyStringSchema.optional(),
  seed: nonNegativeIntegerSchema.optional(),
  firstFrameRef: nonEmptyStringSchema.optional(),
  lastFrameRef: nonEmptyStringSchema.optional(),
  referenceImageRefs: z.array(nonEmptyStringSchema).default([]),
  characterRefIds: z.array(nonEmptyStringSchema).default([]),
  performanceRefIds: z.array(nonEmptyStringSchema).default([]),
  cameraMotion: z.string().trim().optional(),
  subjectMotion: z.string().trim().optional(),
  sceneMotion: z.string().trim().optional(),
  providerHints: z.record(z.unknown()).optional(),
}).strict()

export const shotEditorialSchema = z.object({
  visual: nonEmptyStringSchema,
  story: nonEmptyStringSchema,
  sound: nonEmptyStringSchema,
  caption: nonEmptyStringSchema.optional(),
}).strict()

export const shotRevisionSchema = z.object({
  parentShotId: nonEmptyStringSchema,
  sourceTraceId: nonEmptyStringSchema.optional(),
  redoReason: nonEmptyStringSchema,
  affectedDependencies: z.array(nonEmptyStringSchema).default([]),
}).strict()

export const shotNodeSchema = z.object({
  id: nonEmptyStringSchema,
  segmentId: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  goal: nonEmptyStringSchema,
  track: timelineTrackSchema.default('video'),
  order: nonNegativeIntegerSchema,
  startMs: nonNegativeIntegerSchema,
  durationMs: positiveIntegerSchema,
  dependsOn: z.array(nonEmptyStringSchema).default([]),
  inputArtifacts: z.array(nonEmptyStringSchema).default([]),
  outputArtifacts: z.array(nonEmptyStringSchema).default([]),
  referenceIds: z.array(nonEmptyStringSchema).default([]),
  editorial: shotEditorialSchema.optional(),
  control: controlPayloadSchema,
  revision: shotRevisionSchema.optional(),
}).strict()

export const editTimelineSchema = z.object({
  id: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  aspectRatio: nonEmptyStringSchema,
  fps: z.number().positive(),
  segments: z.array(timelineSegmentSchema).min(1),
  shots: z.array(shotNodeSchema).min(1),
  references: z.array(referenceAssetSchema).default([]),
  continuityBible: continuityBibleSchema.default({}),
  evalRubric: z.object({
    objective: nonEmptyStringSchema,
    dimensions: z.array(nonEmptyStringSchema).min(1),
  }).strict().optional(),
}).strict()

export type TimelineTrack = z.infer<typeof timelineTrackSchema>
export type ReferenceAssetKind = z.infer<typeof referenceAssetKindSchema>
export type ReferenceAsset = z.output<typeof referenceAssetSchema>
export type ContinuityBible = z.output<typeof continuityBibleSchema>
export type TimelineSegment = z.output<typeof timelineSegmentSchema>
export type ControlPayload = z.output<typeof controlPayloadSchema>
export type ShotEditorial = z.output<typeof shotEditorialSchema>
export type ShotRevision = z.output<typeof shotRevisionSchema>
export type ShotNode = z.output<typeof shotNodeSchema>
export type ParsedEditTimeline = z.output<typeof editTimelineSchema>
export type EditTimeline = z.input<typeof editTimelineSchema>

export const campaignScoreDimensionSchema = z.object({
  safetyGates: z.number().min(0).max(20),
  timelineCorrectness: z.number().min(0).max(20),
  planRunRuntime: z.number().min(0).max(15),
  providerPayload: z.number().min(0).max(15),
  evalQuality: z.number().min(0).max(15),
  agentUxContract: z.number().min(0).max(10),
  researchQuality: z.number().min(0).max(5),
}).strict()

export const campaignScoreMetricsSchema = z.object({
  targetedTestPassRate: z.number().min(0).max(100).optional(),
  regressionPassRate: z.number().min(0).max(100).optional(),
  traceEvalPassRate: z.number().min(0).max(100).optional(),
  hiddenFallbackCount: nonNegativeIntegerSchema.optional(),
  bannedFixedWorkflowReferenceCount: nonNegativeIntegerSchema.optional(),
  unresolvedP0Count: nonNegativeIntegerSchema.optional(),
  unresolvedP1Count: nonNegativeIntegerSchema.optional(),
}).strict()

export const campaignScoreInputSchema = campaignScoreDimensionSchema.extend({
  metrics: campaignScoreMetricsSchema.optional(),
}).strict()

export type CampaignScoreDimensions = z.output<typeof campaignScoreDimensionSchema>
export type CampaignScoreMetrics = z.output<typeof campaignScoreMetricsSchema>
export type CampaignScoreInput = z.input<typeof campaignScoreInputSchema>
export type CampaignIssuePriority = 'P0' | 'P1' | 'P2' | 'P3'
export type CampaignScoreBlocker =
  | 'targeted_tests_not_passing'
  | 'trace_eval_not_passing'
  | 'hidden_fallback_detected'
  | 'banned_fixed_workflow_reference_detected'
  | 'unresolved_high_priority_issue'
