import { z } from 'zod'
import type {
  EditTimelineAgentCrew,
  EditTimelineCreativeBrief,
} from '@/lib/project-agent/types'
import type { ParsedEditTimeline, ShotNode } from './types'
import {
  buildCinematographyContribution,
  buildContinuityContribution,
  buildPromptPackageFromContributions,
  buildScreenplayContribution,
  buildSoundPlanContribution,
  type EditTimelineAgentContributionContext,
  type EditTimelineShotContributions,
} from './agents'

const nonEmptyStringSchema = z.string().trim().min(1)

export const editTimelineBlackboardAgentRoleSchema = z.enum([
  'main-director',
  'screenplay-agent',
  'cinematography-agent',
  'continuity-agent',
  'prompt-engineer-agent',
  'sound-agent',
  'provider-production-agent',
  'film-critic-agent',
])

export const editTimelineBlackboardStatusSchema = z.enum([
  'planned',
  'ready',
  'blocked',
  'scored',
])

export const editTimelineBlackboardReferencePolicySchema = z.enum([
  'text-to-video',
  'image-to-video',
  'first-last-frame',
  'requires-reference',
])

export const editTimelinePromptPackageSchema = z.object({
  subject: nonEmptyStringSchema,
  action: nonEmptyStringSchema,
  scene: nonEmptyStringSchema,
  camera: nonEmptyStringSchema,
  motion: nonEmptyStringSchema,
  continuity: nonEmptyStringSchema,
  referencePolicy: editTimelineBlackboardReferencePolicySchema,
  imagePrompt: nonEmptyStringSchema,
  providerPrompt: nonEmptyStringSchema,
  negativePrompt: nonEmptyStringSchema.optional(),
}).strict()

export const editTimelineBlackboardProviderTaskSchema = z.object({
  provider: nonEmptyStringSchema.nullable(),
  model: nonEmptyStringSchema.nullable(),
  taskId: nonEmptyStringSchema.nullable(),
  outputUrl: nonEmptyStringSchema.nullable(),
  status: z.enum(['planned', 'submitted', 'running', 'succeeded', 'failed', 'blocked']),
  blocker: nonEmptyStringSchema.nullable(),
}).strict()

export const editTimelineBlackboardQualitySchema = z.object({
  score: z.number().int().min(0).max(100),
  issues: z.array(nonEmptyStringSchema),
  redoReason: nonEmptyStringSchema.nullable(),
}).strict()

export const editTimelineBlackboardAgentSchema = z.object({
  agentId: nonEmptyStringSchema,
  role: editTimelineBlackboardAgentRoleSchema,
  title: nonEmptyStringSchema,
  mission: nonEmptyStringSchema,
  status: editTimelineBlackboardStatusSchema,
  ownedShotIds: z.array(nonEmptyStringSchema),
  dependencies: z.array(nonEmptyStringSchema),
  outputs: z.array(nonEmptyStringSchema),
}).strict()

export const editTimelineBlackboardShotSchema = z.object({
  shotId: nonEmptyStringSchema,
  ownerAgentId: nonEmptyStringSchema,
  dependencyShotIds: z.array(nonEmptyStringSchema),
  status: editTimelineBlackboardStatusSchema,
  readiness: z.enum(['ready', 'blocked']),
  blocker: nonEmptyStringSchema.nullable(),
  previousShotContext: nonEmptyStringSchema.nullable(),
  nextShotSetup: nonEmptyStringSchema.nullable(),
  promptPackage: editTimelinePromptPackageSchema,
  providerTask: editTimelineBlackboardProviderTaskSchema,
  quality: editTimelineBlackboardQualitySchema,
}).strict()

export const editTimelineMacroScriptSegmentSchema = z.object({
  segmentId: nonEmptyStringSchema,
  startMs: z.number().int().min(0),
  endMs: z.number().int().positive(),
  beatGoal: nonEmptyStringSchema,
  storyFunction: z.enum(['setup', 'development', 'turn', 'payoff']),
  dependencies: z.array(nonEmptyStringSchema),
}).strict()

export const editTimelineSegmentAgentStateSchema = z.object({
  agentId: nonEmptyStringSchema,
  role: editTimelineBlackboardAgentRoleSchema,
  status: editTimelineBlackboardStatusSchema,
  dependsOn: z.array(nonEmptyStringSchema),
  outputs: z.array(nonEmptyStringSchema),
  blocker: nonEmptyStringSchema.nullable(),
}).strict()

export const editTimelineSegmentScreenplaySchema = z.object({
  visibleAction: nonEmptyStringSchema,
  dialogueDraft: nonEmptyStringSchema.nullable(),
  narrationDraft: nonEmptyStringSchema.nullable(),
}).strict()

export const editTimelineSegmentCinematographySchema = z.object({
  camera: nonEmptyStringSchema,
  motion: nonEmptyStringSchema,
  composition: nonEmptyStringSchema,
  lighting: nonEmptyStringSchema,
  transitionHook: nonEmptyStringSchema,
}).strict()

export const editTimelineSegmentContinuitySchema = z.object({
  characterContinuity: nonEmptyStringSchema,
  locationContinuity: nonEmptyStringSchema,
  propContinuity: nonEmptyStringSchema,
  styleContinuity: nonEmptyStringSchema,
  previousContext: nonEmptyStringSchema.nullable(),
  nextSetup: nonEmptyStringSchema.nullable(),
}).strict()

export const editTimelineSegmentSoundPlanSchema = z.object({
  status: editTimelineBlackboardStatusSchema,
  dependsOn: z.array(nonEmptyStringSchema),
  cues: z.array(nonEmptyStringSchema),
  blocking: z.boolean(),
  blocker: nonEmptyStringSchema.nullable(),
}).strict()

export const editTimelineSegmentBlackboardSchema = z.object({
  segmentId: nonEmptyStringSchema,
  ownerAgentId: nonEmptyStringSchema,
  shotIds: z.array(nonEmptyStringSchema),
  dependencies: z.array(nonEmptyStringSchema),
  status: editTimelineBlackboardStatusSchema,
  readiness: z.enum(['ready', 'blocked']),
  blocker: nonEmptyStringSchema.nullable(),
  agentStates: z.array(editTimelineSegmentAgentStateSchema),
  screenplay: editTimelineSegmentScreenplaySchema,
  cinematography: editTimelineSegmentCinematographySchema,
  continuity: editTimelineSegmentContinuitySchema,
  promptPackage: editTimelinePromptPackageSchema,
  soundPlan: editTimelineSegmentSoundPlanSchema,
  providerTask: editTimelineBlackboardProviderTaskSchema,
  quality: editTimelineBlackboardQualitySchema,
}).strict()

export const editTimelineBlackboardFinalCriticSchema = z.object({
  agentId: nonEmptyStringSchema,
  status: editTimelineBlackboardStatusSchema,
  score: z.number().int().min(0).max(100),
  issues: z.array(nonEmptyStringSchema),
  nextOptimizationTarget: nonEmptyStringSchema,
  evidenceRefs: z.array(nonEmptyStringSchema),
}).strict()

export const editTimelineBlackboardProviderExperimentSchema = z.object({
  shotId: nonEmptyStringSchema,
  provider: nonEmptyStringSchema,
  model: nonEmptyStringSchema,
  inputPrompt: nonEmptyStringSchema,
  taskId: nonEmptyStringSchema.nullable(),
  outputUrl: nonEmptyStringSchema.nullable(),
  criticScore: z.number().int().min(0).max(100).nullable(),
  status: z.enum(['planned', 'submitted', 'running', 'succeeded', 'failed', 'blocked']),
  blocker: nonEmptyStringSchema.nullable(),
}).strict()

export const editTimelineBlackboardSchema = z.object({
  id: nonEmptyStringSchema,
  timelineId: nonEmptyStringSchema,
  version: nonEmptyStringSchema,
  sourceStory: nonEmptyStringSchema,
  status: editTimelineBlackboardStatusSchema,
  agents: z.array(editTimelineBlackboardAgentSchema),
  macroScript: z.array(editTimelineMacroScriptSegmentSchema),
  segmentBlackboards: z.array(editTimelineSegmentBlackboardSchema),
  shots: z.array(editTimelineBlackboardShotSchema),
  providerExperiments: z.array(editTimelineBlackboardProviderExperimentSchema),
  finalCritic: editTimelineBlackboardFinalCriticSchema,
  nextOptimizationTarget: nonEmptyStringSchema,
}).strict()

export type EditTimelineBlackboardAgentRole = z.output<typeof editTimelineBlackboardAgentRoleSchema>
export type EditTimelineBlackboardStatus = z.output<typeof editTimelineBlackboardStatusSchema>
export type EditTimelineBlackboardReferencePolicy = z.output<typeof editTimelineBlackboardReferencePolicySchema>
export type EditTimelinePromptPackage = z.output<typeof editTimelinePromptPackageSchema>
export type EditTimelineBlackboardProviderTask = z.output<typeof editTimelineBlackboardProviderTaskSchema>
export type EditTimelineBlackboardQuality = z.output<typeof editTimelineBlackboardQualitySchema>
export type EditTimelineBlackboardAgent = z.output<typeof editTimelineBlackboardAgentSchema>
export type EditTimelineBlackboardShot = z.output<typeof editTimelineBlackboardShotSchema>
export type EditTimelineMacroScriptSegment = z.output<typeof editTimelineMacroScriptSegmentSchema>
export type EditTimelineSegmentAgentState = z.output<typeof editTimelineSegmentAgentStateSchema>
export type EditTimelineSegmentScreenplay = z.output<typeof editTimelineSegmentScreenplaySchema>
export type EditTimelineSegmentCinematography = z.output<typeof editTimelineSegmentCinematographySchema>
export type EditTimelineSegmentContinuity = z.output<typeof editTimelineSegmentContinuitySchema>
export type EditTimelineSegmentSoundPlan = z.output<typeof editTimelineSegmentSoundPlanSchema>
export type EditTimelineSegmentBlackboard = z.output<typeof editTimelineSegmentBlackboardSchema>
export type EditTimelineBlackboardFinalCritic = z.output<typeof editTimelineBlackboardFinalCriticSchema>
export type EditTimelineBlackboardProviderExperiment = z.output<typeof editTimelineBlackboardProviderExperimentSchema>
export type EditTimelineBlackboard = z.output<typeof editTimelineBlackboardSchema>

export interface EditTimelineBlackboardRuntimeProviderTaskEvidence {
  readonly shotId: string
  readonly provider: string
  readonly model: string
  readonly taskId: string | null
  readonly outputUrl: string | null
  readonly status: EditTimelineBlackboardProviderTask['status']
  readonly blocker?: string | null
  readonly criticScore?: number | null
}

export interface EditTimelineBlackboardRuntimeFinalVideoEvidence {
  readonly url: string
  readonly evidenceRefs: readonly string[]
  readonly score?: number | null
  readonly issues?: readonly string[]
}

export interface MergeEditTimelineBlackboardRuntimeEvidenceInput {
  readonly providerTasks?: readonly EditTimelineBlackboardRuntimeProviderTaskEvidence[]
  readonly finalVideo?: EditTimelineBlackboardRuntimeFinalVideoEvidence | null
  readonly finalVideoBlocker?: string | null
}

export interface BuildEditTimelineBlackboardInput {
  timeline: ParsedEditTimeline
  sourceStory: string
  creativeBrief: EditTimelineCreativeBrief
  agentCrew?: EditTimelineAgentCrew
  risks: ReadonlyArray<{
    code: string
    message: string
  }>
}

export interface EditTimelineFinalVideoEvidenceScore {
  readonly score: number
  readonly issues: string[]
  readonly nextOptimizationTarget: string
}

const BLACKBOARD_ROLES: Array<{
  role: EditTimelineBlackboardAgentRole
  agentId: string
  title: string
  mission: string
  dependencies: string[]
}> = [
  {
    role: 'main-director',
    agentId: 'main-director',
    title: 'Main Director Agent',
    mission: 'Own the final-video path: timeline split, visible shot goals, dependencies, and assembly target before provider work starts.',
    dependencies: [],
  },
  {
    role: 'screenplay-agent',
    agentId: 'screenplay-agent',
    title: 'Screenplay Agent',
    mission: 'Turn the source story into executable visible actions with one start-middle-end narrative beat per shot.',
    dependencies: ['main-director'],
  },
  {
    role: 'cinematography-agent',
    agentId: 'cinematography-agent',
    title: 'Cinematography Agent',
    mission: 'Define camera, framing, movement, lighting, and transition hooks that keep vertical shots readable in final assembly.',
    dependencies: ['screenplay-agent'],
  },
  {
    role: 'continuity-agent',
    agentId: 'continuity-agent',
    title: 'Continuity Agent',
    mission: 'Keep character, wardrobe, props, location, lighting, and style consistent across adjacent shots.',
    dependencies: ['screenplay-agent'],
  },
  {
    role: 'prompt-engineer-agent',
    agentId: 'prompt-engineer-agent',
    title: 'Prompt Engineer Agent',
    mission: 'Convert each shot into provider-ready prompts with opening frame, middle motion, ending frame, and strict visual constraints.',
    dependencies: ['cinematography-agent', 'continuity-agent'],
  },
  {
    role: 'sound-agent',
    agentId: 'sound-agent',
    title: 'Sound Agent',
    mission: 'Record the sound and timing plan from screenplay actions without blocking silent-video v1 generation.',
    dependencies: ['screenplay-agent', 'continuity-agent'],
  },
  {
    role: 'provider-production-agent',
    agentId: 'provider-production-agent',
    title: 'Provider Production Agent',
    mission: 'Submit real provider tasks, track task ids, output URLs, failures, and explicit provider experiments.',
    dependencies: ['prompt-engineer-agent', 'sound-agent'],
  },
  {
    role: 'film-critic-agent',
    agentId: 'film-critic-agent',
    title: 'Film Critic Agent',
    mission: 'Score only real shot outputs and final.video evidence, then choose one highest-impact redo target.',
    dependencies: ['provider-production-agent'],
  },
]

function textOrFallback(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : fallback
}

function qualityForShot(params: {
  shot: ShotNode
  promptPackage: EditTimelinePromptPackage
  riskCodes: ReadonlySet<string>
}): EditTimelineBlackboardQuality {
  const issues: string[] = []
  let score = 100

  if (params.promptPackage.referencePolicy === 'requires-reference') {
    score -= 12
    issues.push(`missing-reference:${params.shot.id}`)
  }
  if (params.promptPackage.providerPrompt.length < 180) {
    score -= 10
    issues.push(`prompt-too-short:${params.shot.id}`)
  }
  if (!params.promptPackage.providerPrompt.toLowerCase().includes('subject visible')) {
    score -= 18
    issues.push(`visibility-not-explicit:${params.shot.id}`)
  }
  if (params.shot.durationMs > 6000) {
    score -= 5
    issues.push(`shot-duration-long:${params.shot.id}`)
  }
  if (params.riskCodes.size > 0) {
    score -= Math.min(12, params.riskCodes.size * 4)
  }

  const boundedScore = Math.max(0, Math.min(100, score))
  return {
    score: boundedScore,
    issues,
    redoReason: issues[0] ?? null,
  }
}

function nextShotSetup(params: {
  timeline: ParsedEditTimeline
  index: number
}): string | null {
  const nextShot = params.timeline.shots[params.index + 1]
  if (!nextShot) return null
  return `Leave a clear visual hook for next shot: ${nextShot.goal}`
}

function previousShotContext(params: {
  timeline: ParsedEditTimeline
  shot: ShotNode
}): string | null {
  const previousShotId = params.shot.dependsOn[params.shot.dependsOn.length - 1]
  if (!previousShotId) return null
  const previousShot = params.timeline.shots.find((candidate) => candidate.id === previousShotId)
  return previousShot ? `Continue from previous shot: ${previousShot.goal}` : null
}

function orderedTimelineSegments(timeline: ParsedEditTimeline): ParsedEditTimeline['segments'] {
  return [...timeline.segments].sort((left, right) => {
    if (left.startMs !== right.startMs) return left.startMs - right.startMs
    return left.id.localeCompare(right.id)
  })
}

function storyFunctionForSegment(index: number, count: number): EditTimelineMacroScriptSegment['storyFunction'] {
  if (index === 0) return 'setup'
  if (index === count - 1) return 'payoff'
  if (count > 3 && index === count - 2) return 'turn'
  return 'development'
}

function buildSegmentDependencies(params: {
  timeline: ParsedEditTimeline
  segmentId: string
  index: number
  orderedSegments: ParsedEditTimeline['segments']
}): string[] {
  const segmentIdsByShotId = new Map<string, string>()
  for (const segment of params.timeline.segments) {
    for (const shotId of segment.shotIds) segmentIdsByShotId.set(shotId, segment.id)
  }

  const dependencies = new Set<string>()
  for (const shot of params.timeline.shots.filter((candidate) => candidate.segmentId === params.segmentId)) {
    for (const dependencyShotId of shot.dependsOn) {
      const dependencySegmentId = segmentIdsByShotId.get(dependencyShotId)
      if (dependencySegmentId && dependencySegmentId !== params.segmentId) {
        dependencies.add(dependencySegmentId)
      }
    }
  }

  if (dependencies.size === 0 && params.index > 0) {
    const previousSegment = params.orderedSegments[params.index - 1]
    if (previousSegment) dependencies.add(previousSegment.id)
  }

  return Array.from(dependencies)
}

function buildMacroScript(timeline: ParsedEditTimeline): EditTimelineMacroScriptSegment[] {
  const orderedSegments = orderedTimelineSegments(timeline)
  const shotsById = new Map(timeline.shots.map((shot) => [shot.id, shot] as const))

  return orderedSegments.map((segment, index) => {
    const firstShot = segment.shotIds
      .map((shotId) => shotsById.get(shotId))
      .find((shot): shot is ShotNode => shot !== undefined)
    const beatGoal = textOrFallback(segment.intent, firstShot?.goal ?? segment.label)
    return {
      segmentId: segment.id,
      startMs: segment.startMs,
      endMs: segment.startMs + segment.durationMs,
      beatGoal,
      storyFunction: storyFunctionForSegment(index, orderedSegments.length),
      dependencies: buildSegmentDependencies({
        timeline,
        segmentId: segment.id,
        index,
        orderedSegments,
      }),
    }
  })
}

function buildProviderTask(): EditTimelineBlackboardProviderTask {
  return {
    provider: null,
    model: null,
    taskId: null,
    outputUrl: null,
    status: 'planned',
    blocker: null,
  }
}

function buildShotContributionContext(params: {
  input: BuildEditTimelineBlackboardInput
  macroSegment: EditTimelineMacroScriptSegment
  shot: ShotNode
  orderedShots: readonly ShotNode[]
  index: number
}): EditTimelineAgentContributionContext {
  return {
    timeline: params.input.timeline,
    shot: params.shot,
    macroSegment: params.macroSegment,
    creativeBrief: params.input.creativeBrief,
    sourceStory: params.input.sourceStory,
    previousShot: params.orderedShots[params.index - 1] ?? null,
    nextShot: params.orderedShots[params.index + 1] ?? null,
  }
}

function buildShotContributions(params: {
  input: BuildEditTimelineBlackboardInput
  macroScript: readonly EditTimelineMacroScriptSegment[]
}): Map<string, EditTimelineShotContributions> {
  const macroBySegmentId = new Map(params.macroScript.map((segment) => [segment.segmentId, segment] as const))
  const orderedShots = [...params.input.timeline.shots].sort((left, right) => {
    if (left.startMs !== right.startMs) return left.startMs - right.startMs
    if (left.order !== right.order) return left.order - right.order
    return left.id.localeCompare(right.id)
  })
  const contributions = new Map<string, EditTimelineShotContributions>()

  orderedShots.forEach((shot, index) => {
    const macroSegment = macroBySegmentId.get(shot.segmentId)
    if (!macroSegment) {
      throw new Error(`EDIT_TIMELINE_BLACKBOARD_MACRO_SEGMENT_MISSING:${shot.segmentId}`)
    }
    const context = buildShotContributionContext({
      input: params.input,
      macroSegment,
      shot,
      orderedShots,
      index,
    })
    const screenplay = buildScreenplayContribution(context)
    const cinematography = buildCinematographyContribution(context)
    const continuity = buildContinuityContribution(context)
    const soundPlan = buildSoundPlanContribution(context)
    const promptPackage = buildPromptPackageFromContributions({
      context,
      screenplay,
      cinematography,
      continuity,
    })
    contributions.set(shot.id, {
      screenplay,
      cinematography,
      continuity,
      soundPlan,
      promptPackage,
    })
  })

  return contributions
}

function buildBlackboardShots(params: {
  input: BuildEditTimelineBlackboardInput
  contributionsByShotId: ReadonlyMap<string, EditTimelineShotContributions>
}): EditTimelineBlackboardShot[] {
  const input = params.input
  const riskCodes = new Set(input.risks.map((item) => item.code))
  return input.timeline.shots.map((shot, index) => {
    const contributions = params.contributionsByShotId.get(shot.id)
    if (!contributions) {
      throw new Error(`EDIT_TIMELINE_BLACKBOARD_SHOT_CONTRIBUTION_MISSING:${shot.id}`)
    }
    const promptPackage = contributions.promptPackage
    const quality = qualityForShot({
      shot,
      promptPackage,
      riskCodes,
    })
    const blocker = promptPackage.referencePolicy === 'requires-reference'
      ? `EDIT_TIMELINE_BLACKBOARD_REFERENCE_REQUIRED:${shot.id}`
      : null

    return {
      shotId: shot.id,
      ownerAgentId: 'prompt-engineer-agent',
      dependencyShotIds: shot.dependsOn,
      status: blocker ? 'blocked' : 'planned',
      readiness: blocker ? 'blocked' : 'ready',
      blocker,
      previousShotContext: contributions.continuity.previousContext ?? previousShotContext({ timeline: input.timeline, shot }),
      nextShotSetup: contributions.continuity.nextSetup ?? nextShotSetup({ timeline: input.timeline, index }),
      promptPackage,
      providerTask: buildProviderTask(),
      quality,
    }
  })
}

function averageQuality(shots: readonly EditTimelineBlackboardShot[]): EditTimelineBlackboardQuality {
  if (shots.length === 0) {
    return {
      score: 0,
      issues: ['segment-has-no-shots'],
      redoReason: 'segment-has-no-shots',
    }
  }
  const issues = uniqueStrings(shots.flatMap((shot) => shot.quality.issues))
  return {
    score: clampScore(shots.reduce((total, shot) => total + shot.quality.score, 0) / shots.length),
    issues,
    redoReason: shots.find((shot) => shot.quality.redoReason)?.quality.redoReason ?? null,
  }
}

function combineSegmentScreenplay(
  contributions: readonly EditTimelineShotContributions[],
): EditTimelineSegmentScreenplay {
  const first = contributions[0]?.screenplay
  if (!first) {
    return {
      visibleAction: 'Segment action missing.',
      dialogueDraft: null,
      narrationDraft: null,
    }
  }
  return {
    ...first,
    visibleAction: uniqueStrings(contributions.map((contribution) => contribution.screenplay.visibleAction)).join(' / '),
    dialogueDraft: uniqueStrings(contributions
      .map((contribution) => contribution.screenplay.dialogueDraft)
      .filter((value): value is string => value !== null)).join(' / ') || null,
    narrationDraft: uniqueStrings(contributions
      .map((contribution) => contribution.screenplay.narrationDraft)
      .filter((value): value is string => value !== null)).join(' / ') || null,
  }
}

function combineSegmentCinematography(
  contributions: readonly EditTimelineShotContributions[],
): EditTimelineSegmentCinematography {
  const first = contributions[0]?.cinematography
  if (!first) {
    return {
      camera: 'medium shot',
      motion: 'locked',
      composition: 'subject centered in a 9:16 frame',
      lighting: 'available practical light',
      transitionHook: 'hold on the final visible action',
    }
  }
  return {
    ...first,
    camera: uniqueStrings(contributions.map((contribution) => contribution.cinematography.camera)).join(' / '),
    motion: uniqueStrings(contributions.map((contribution) => contribution.cinematography.motion)).join(' / '),
    composition: uniqueStrings(contributions.map((contribution) => contribution.cinematography.composition)).join(' / '),
    lighting: uniqueStrings(contributions.map((contribution) => contribution.cinematography.lighting)).join(' / '),
    transitionHook: uniqueStrings(contributions.map((contribution) => contribution.cinematography.transitionHook)).join(' / '),
  }
}

function combineSegmentContinuity(
  contributions: readonly EditTimelineShotContributions[],
): EditTimelineSegmentContinuity {
  const first = contributions[0]?.continuity
  if (!first) {
    return {
      characterContinuity: 'maintain the same main subject',
      locationContinuity: 'maintain the same scene geography',
      propContinuity: 'maintain visible prop continuity',
      styleContinuity: 'maintain the same visual style',
      previousContext: null,
      nextSetup: null,
    }
  }
  return {
    ...first,
    characterContinuity: uniqueStrings(contributions.map((contribution) => contribution.continuity.characterContinuity)).join(' / '),
    locationContinuity: uniqueStrings(contributions.map((contribution) => contribution.continuity.locationContinuity)).join(' / '),
    propContinuity: uniqueStrings(contributions.map((contribution) => contribution.continuity.propContinuity)).join(' / '),
    styleContinuity: uniqueStrings(contributions.map((contribution) => contribution.continuity.styleContinuity)).join(' / '),
    previousContext: first.previousContext,
    nextSetup: contributions[contributions.length - 1]?.continuity.nextSetup ?? first.nextSetup,
  }
}

function combineSegmentPromptPackage(
  shots: readonly EditTimelineBlackboardShot[],
): EditTimelinePromptPackage {
  const first = shots[0]?.promptPackage
  if (!first) {
    throw new Error('EDIT_TIMELINE_BLACKBOARD_SEGMENT_PROMPT_MISSING')
  }
  if (shots.length === 1) return first
  return {
    ...first,
    subject: uniqueStrings(shots.map((shot) => shot.promptPackage.subject)).join(' / '),
    action: uniqueStrings(shots.map((shot) => shot.promptPackage.action)).join(' / '),
    scene: uniqueStrings(shots.map((shot) => shot.promptPackage.scene)).join(' / '),
    camera: uniqueStrings(shots.map((shot) => shot.promptPackage.camera)).join(' / '),
    motion: uniqueStrings(shots.map((shot) => shot.promptPackage.motion)).join(' / '),
    continuity: uniqueStrings(shots.map((shot) => shot.promptPackage.continuity)).join(' / '),
    imagePrompt: uniqueStrings(shots.map((shot) => shot.promptPackage.imagePrompt)).join(' / '),
    providerPrompt: uniqueStrings(shots.map((shot) => shot.promptPackage.providerPrompt)).join('\n\n'),
    negativePrompt: uniqueStrings(shots
      .map((shot) => shot.promptPackage.negativePrompt)
      .filter((value): value is string => value !== undefined)).join(', ') || first.negativePrompt,
  }
}

function buildSegmentAgentStates(params: {
  segmentId: string
  shots: readonly EditTimelineBlackboardShot[]
  screenplay: EditTimelineSegmentScreenplay
  cinematography: EditTimelineSegmentCinematography
  continuity: EditTimelineSegmentContinuity
  soundCues: readonly string[]
  blocker: string | null
}): EditTimelineSegmentAgentState[] {
  const shotIds = params.shots.map((shot) => shot.shotId)
  const binding = `${params.segmentId}:${shotIds.join(',')}`
  const status: EditTimelineBlackboardStatus = params.blocker ? 'blocked' : 'planned'
  return [
    {
      agentId: `screenplay-agent:${params.segmentId}`,
      role: 'screenplay-agent',
      status,
      dependsOn: ['main-director'],
      outputs: [`visible-action:${binding}:${params.screenplay.visibleAction}`],
      blocker: params.blocker,
    },
    {
      agentId: `cinematography-agent:${params.segmentId}`,
      role: 'cinematography-agent',
      status,
      dependsOn: ['screenplay-agent'],
      outputs: [
        `camera:${binding}:${params.cinematography.camera}`,
        `motion:${binding}:${params.cinematography.motion}`,
        `lighting:${binding}:${params.cinematography.lighting}`,
        `transition-hook:${binding}:${params.cinematography.transitionHook}`,
      ],
      blocker: params.blocker,
    },
    {
      agentId: `continuity-agent:${params.segmentId}`,
      role: 'continuity-agent',
      status,
      dependsOn: ['screenplay-agent'],
      outputs: [
        `character-continuity:${binding}:${params.continuity.characterContinuity}`,
        `location-continuity:${binding}:${params.continuity.locationContinuity}`,
        `prop-continuity:${binding}:${params.continuity.propContinuity}`,
        `style-continuity:${binding}:${params.continuity.styleContinuity}`,
      ],
      blocker: params.blocker,
    },
    {
      agentId: `prompt-engineer-agent:${params.segmentId}`,
      role: 'prompt-engineer-agent',
      status,
      dependsOn: ['cinematography-agent', 'continuity-agent'],
      outputs: params.shots.flatMap((shot) => [
        `image-prompt:${shot.shotId}:${shot.promptPackage.imagePrompt}`,
        `video-prompt:${shot.shotId}:${shot.promptPackage.providerPrompt}`,
        `negative-prompt:${shot.shotId}:${shot.promptPackage.negativePrompt ?? 'none'}`,
      ]),
      blocker: params.blocker,
    },
    {
      agentId: `sound-agent:${params.segmentId}`,
      role: 'sound-agent',
      status: 'planned',
      dependsOn: ['screenplay-agent', 'continuity-agent'],
      outputs: params.soundCues.map((cue) => `sound-plan:${binding}:${cue}`),
      blocker: null,
    },
    {
      agentId: `provider-production-agent:${params.segmentId}`,
      role: 'provider-production-agent',
      status,
      dependsOn: ['prompt-engineer-agent'],
      outputs: shotIds.map((shotId) => `provider-task-planned:${shotId}`),
      blocker: params.blocker,
    },
    {
      agentId: `film-critic-agent:${params.segmentId}`,
      role: 'film-critic-agent',
      status,
      dependsOn: ['provider-production-agent'],
      outputs: params.shots.map((shot) => `final-review-pending:${shot.shotId}:final.video evidence required`),
      blocker: params.blocker,
    },
  ]
}

function buildSegmentBlackboards(params: {
  input: BuildEditTimelineBlackboardInput
  macroScript: readonly EditTimelineMacroScriptSegment[]
  shots: readonly EditTimelineBlackboardShot[]
  contributionsByShotId: ReadonlyMap<string, EditTimelineShotContributions>
}): EditTimelineSegmentBlackboard[] {
  const timelineShotsById = new Map(params.input.timeline.shots.map((shot) => [shot.id, shot] as const))
  const blackboardShotsById = new Map(params.shots.map((shot) => [shot.shotId, shot] as const))
  const macroBySegmentId = new Map(params.macroScript.map((segment) => [segment.segmentId, segment] as const))

  return orderedTimelineSegments(params.input.timeline).map((segment) => {
    const macro = macroBySegmentId.get(segment.id)
    if (!macro) {
      throw new Error(`EDIT_TIMELINE_BLACKBOARD_MACRO_SEGMENT_MISSING:${segment.id}`)
    }
    const timelineShots = segment.shotIds
      .map((shotId) => timelineShotsById.get(shotId))
      .filter((shot): shot is ShotNode => shot !== undefined)
    const blackboardShots = segment.shotIds
      .map((shotId) => blackboardShotsById.get(shotId))
      .filter((shot): shot is EditTimelineBlackboardShot => shot !== undefined)
    const firstTimelineShot = timelineShots[0]
    const firstBlackboardShot = blackboardShots[0]
    if (!firstTimelineShot || !firstBlackboardShot) {
      throw new Error(`EDIT_TIMELINE_BLACKBOARD_SEGMENT_SHOT_MISSING:${segment.id}`)
    }
    const contributions = timelineShots.map((shot) => params.contributionsByShotId.get(shot.id))
    if (contributions.some((contribution) => contribution === undefined)) {
      throw new Error(`EDIT_TIMELINE_BLACKBOARD_SEGMENT_CONTRIBUTION_MISSING:${segment.id}`)
    }
    const segmentContributions = contributions.filter((contribution): contribution is EditTimelineShotContributions => contribution !== undefined)
    const firstContribution = segmentContributions[0]
    if (!firstContribution) {
      throw new Error(`EDIT_TIMELINE_BLACKBOARD_SEGMENT_CONTRIBUTION_MISSING:${segment.id}`)
    }

    const blocker = blackboardShots.find((shot) => shot.blocker)?.blocker ?? null
    const soundCues = uniqueStrings(timelineShots.flatMap((shot) => (
      params.contributionsByShotId.get(shot.id)?.soundPlan.cues ?? []
    )))
    const normalizedSoundCues = soundCues.length > 0
      ? soundCues
      : firstContribution.soundPlan.cues
    const quality = averageQuality(blackboardShots)
    const screenplay = combineSegmentScreenplay(segmentContributions)
    const cinematography = combineSegmentCinematography(segmentContributions)
    const continuity = combineSegmentContinuity(segmentContributions)
    const soundPlan: EditTimelineSegmentSoundPlan = {
      ...firstContribution.soundPlan,
      cues: normalizedSoundCues,
    }
    const promptPackage = combineSegmentPromptPackage(blackboardShots)
    const providerTask = aggregateSegmentProviderTask(blackboardShots)

    return {
      segmentId: segment.id,
      ownerAgentId: 'main-director',
      shotIds: segment.shotIds,
      dependencies: macro.dependencies,
      status: blocker ? 'blocked' : 'planned',
      readiness: blocker ? 'blocked' : 'ready',
      blocker,
      agentStates: buildSegmentAgentStates({
        segmentId: segment.id,
        shots: blackboardShots,
        screenplay,
        cinematography,
        continuity,
        soundCues: normalizedSoundCues,
        blocker,
      }),
      screenplay,
      cinematography,
      continuity,
      promptPackage,
      soundPlan,
      providerTask,
      quality,
    }
  })
}

function buildAgents(params: {
  timeline: ParsedEditTimeline
  shots: readonly EditTimelineBlackboardShot[]
  macroScript: readonly EditTimelineMacroScriptSegment[]
  segmentBlackboards: readonly EditTimelineSegmentBlackboard[]
}): EditTimelineBlackboardAgent[] {
  const allShotIds = params.timeline.shots.map((shot) => shot.id)
  const blockedShotIds = params.shots
    .filter((shot) => shot.readiness === 'blocked')
    .map((shot) => shot.shotId)

  return BLACKBOARD_ROLES.map((role) => {
    const ownedShotIds = role.role === 'film-critic-agent'
      ? blockedShotIds
      : allShotIds
    const outputs = (() => {
      if (role.role === 'main-director') {
        return params.macroScript.map((segment) => `${segment.segmentId}:${String(segment.startMs)}-${String(segment.endMs)}:${segment.beatGoal}`)
      }
      if (role.role === 'screenplay-agent') {
        return params.segmentBlackboards.map((segment) => `${segment.segmentId}:${segment.shotIds.join(',')}: ${segment.screenplay.visibleAction}`)
      }
      if (role.role === 'cinematography-agent') {
        return params.segmentBlackboards.map((segment) => [
          `${segment.segmentId}:${segment.shotIds.join(',')}:`,
          `camera:${segment.cinematography.camera}`,
          `motion:${segment.cinematography.motion}`,
          `composition:${segment.cinematography.composition}`,
          `lighting:${segment.cinematography.lighting}`,
        ].join(' '))
      }
      if (role.role === 'continuity-agent') {
        return params.segmentBlackboards.map((segment) => [
          `${segment.segmentId}:${segment.shotIds.join(',')}:`,
          segment.continuity.characterContinuity,
          segment.continuity.locationContinuity,
          segment.continuity.propContinuity,
        ].join(' '))
      }
      if (role.role === 'prompt-engineer-agent') {
        return params.segmentBlackboards.map((segment) => `${segment.segmentId}:${segment.shotIds.join(',')}: ${segment.promptPackage.referencePolicy} ${segment.promptPackage.providerPrompt.split('\n')[0] ?? segment.promptPackage.providerPrompt}`)
      }
      if (role.role === 'sound-agent') {
        return params.segmentBlackboards.map((segment) => `${segment.segmentId}:${segment.shotIds.join(',')}: ${segment.soundPlan.cues.join(' | ')}`)
      }
      if (role.role === 'provider-production-agent') {
        return params.shots.map((shot) => `${shot.shotId}: provider task planned`)
      }
      if (role.role === 'film-critic-agent') {
        return params.shots.map((shot) => `${shot.shotId}: final review pending final.video evidence`)
      }
      return params.shots.map((shot) => `${shot.shotId}: timeline dependency planned`)
    })()

    return {
      agentId: role.agentId,
      role: role.role,
      title: role.title,
      mission: role.mission,
      status: blockedShotIds.length > 0 && (role.role === 'provider-production-agent' || role.role === 'film-critic-agent')
        ? 'blocked'
        : 'planned',
      ownedShotIds,
      dependencies: role.dependencies,
      outputs,
    }
  })
}

function criticFromShots(params: {
  shots: readonly EditTimelineBlackboardShot[]
  risks: ReadonlyArray<{ code: string; message: string }>
}): EditTimelineBlackboardFinalCritic {
  const issues = [
    ...params.risks.map((item) => item.code),
    ...params.shots.flatMap((shot) => shot.quality.issues),
  ]
  const nextOptimizationTarget = issues[0] ?? 'awaiting-final-video-evidence'

  return {
    agentId: 'film-critic-agent',
    status: issues.length > 0 ? 'blocked' : 'planned',
    score: 0,
    issues,
    nextOptimizationTarget,
    evidenceRefs: [],
  }
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function nullableTrim(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)))
}

function carryForwardFinalCriticIssues(params: {
  issues: readonly string[]
  finalVideo: EditTimelineBlackboardRuntimeFinalVideoEvidence | null
}): string[] {
  if (!params.finalVideo) return [...params.issues]
  return params.issues.filter((issue) => issue !== 'final-video-missing')
}

function averageShotScore(shots: readonly EditTimelineBlackboardShot[]): number {
  if (shots.length === 0) return 0
  return clampScore(shots.reduce((total, shot) => total + shot.quality.score, 0) / shots.length)
}

function runtimeIssueForTask(task: EditTimelineBlackboardRuntimeProviderTaskEvidence): string | null {
  const blocker = nullableTrim(task.blocker)
  if (blocker) return `${task.shotId}:${blocker}`
  if (task.status === 'failed' || task.status === 'blocked') return `${task.shotId}:${task.status}`
  if (task.status === 'succeeded' && !nullableTrim(task.outputUrl)) return `${task.shotId}:missing-output-url`
  return null
}

function runtimeRedoReason(task: EditTimelineBlackboardRuntimeProviderTaskEvidence): string | null {
  const blocker = nullableTrim(task.blocker)
  if (blocker) return blocker
  if (task.status === 'failed' || task.status === 'blocked') return task.status
  if (task.status === 'succeeded' && !nullableTrim(task.outputUrl)) return 'missing-output-url'
  return null
}

function providerTaskFromEvidence(task: EditTimelineBlackboardRuntimeProviderTaskEvidence): EditTimelineBlackboardProviderTask {
  return {
    provider: nullableTrim(task.provider),
    model: nullableTrim(task.model),
    taskId: nullableTrim(task.taskId),
    outputUrl: nullableTrim(task.outputUrl),
    status: task.status,
    blocker: nullableTrim(task.blocker),
  }
}

function qualityFromRuntimeTask(params: {
  shot: EditTimelineBlackboardShot
  task: EditTimelineBlackboardRuntimeProviderTaskEvidence
  issue: string | null
}): EditTimelineBlackboardQuality {
  const criticScore = typeof params.task.criticScore === 'number'
    ? clampScore(params.task.criticScore)
    : null
  const fallbackScore = params.issue
    ? Math.min(params.shot.quality.score, 40)
    : params.task.status === 'succeeded'
      ? Math.max(params.shot.quality.score, 80)
      : params.shot.quality.score

  return {
    score: criticScore ?? fallbackScore,
    issues: uniqueStrings([
      ...params.shot.quality.issues,
      ...(params.issue ? [params.issue] : []),
    ]),
    redoReason: runtimeRedoReason(params.task) ?? params.shot.quality.redoReason,
  }
}

function statusFromRuntimeTask(params: {
  shot: EditTimelineBlackboardShot
  task: EditTimelineBlackboardRuntimeProviderTaskEvidence
  issue: string | null
}): EditTimelineBlackboardStatus {
  if (params.issue) return 'blocked'
  if (params.task.status === 'succeeded') return 'scored'
  if (params.task.status === 'submitted' || params.task.status === 'running') return 'ready'
  return params.shot.status
}

function providerExperimentKey(experiment: {
  readonly shotId: string
  readonly provider: string
  readonly model: string
  readonly taskId: string | null
  readonly status: EditTimelineBlackboardProviderTask['status']
}): string {
  return [
    experiment.shotId,
    experiment.provider,
    experiment.model,
    experiment.taskId ?? experiment.status,
  ].join('::')
}

function aggregateSegmentProviderTask(shots: readonly EditTimelineBlackboardShot[]): EditTimelineBlackboardProviderTask {
  const blocked = shots.find((shot) => shot.providerTask.status === 'failed' || shot.providerTask.status === 'blocked' || shot.providerTask.blocker)
  if (blocked) return blocked.providerTask
  const running = shots.find((shot) => shot.providerTask.status === 'running')
  if (running) return running.providerTask
  const submitted = shots.find((shot) => shot.providerTask.status === 'submitted')
  if (submitted) return submitted.providerTask
  const succeeded = shots.find((shot) => shot.providerTask.status === 'succeeded')
  if (succeeded && shots.every((shot) => shot.providerTask.status === 'succeeded')) return succeeded.providerTask
  return shots[0]?.providerTask ?? buildProviderTask()
}

function statusFromSegmentShots(shots: readonly EditTimelineBlackboardShot[]): EditTimelineBlackboardStatus {
  if (shots.some((shot) => shot.status === 'blocked')) return 'blocked'
  if (shots.length > 0 && shots.every((shot) => shot.status === 'scored')) return 'scored'
  if (shots.some((shot) => shot.providerTask.status === 'submitted' || shot.providerTask.status === 'running')) return 'ready'
  return 'planned'
}

function updateSegmentAgentStatesFromRuntime(params: {
  segment: EditTimelineSegmentBlackboard
  providerTask: EditTimelineBlackboardProviderTask
  quality: EditTimelineBlackboardQuality
  status: EditTimelineBlackboardStatus
}): EditTimelineSegmentAgentState[] {
  return params.segment.agentStates.map((agentState) => {
    if (agentState.role === 'provider-production-agent') {
      const task = params.providerTask
      const taskRef = task.taskId ? ` task:${task.taskId}` : ''
      const outputRef = task.outputUrl ? ` output:${task.outputUrl}` : ''
      const blockerRef = task.blocker ? ` blocker:${task.blocker}` : ''
      return {
        ...agentState,
        status: params.status,
        outputs: [`provider:${task.status}${taskRef}${outputRef}${blockerRef}`],
        blocker: task.blocker,
      }
    }
    if (agentState.role === 'film-critic-agent') {
      const outputs = params.status === 'scored'
        ? [`segment:scored score:${String(params.quality.score)}`]
        : [`segment:${params.status} awaiting-provider-or-final-video-evidence`]
      return {
        ...agentState,
        status: params.status === 'blocked' || params.status === 'scored' ? params.status : agentState.status,
        outputs,
        blocker: params.quality.redoReason,
      }
    }
    return agentState
  })
}

function updateSegmentBlackboardsFromRuntime(params: {
  segmentBlackboards: readonly EditTimelineSegmentBlackboard[]
  shots: readonly EditTimelineBlackboardShot[]
}): EditTimelineSegmentBlackboard[] {
  const shotsById = new Map(params.shots.map((shot) => [shot.shotId, shot] as const))
  return params.segmentBlackboards.map((segment) => {
    const segmentShots = segment.shotIds
      .map((shotId) => shotsById.get(shotId))
      .filter((shot): shot is EditTimelineBlackboardShot => shot !== undefined)
    const providerTask = aggregateSegmentProviderTask(segmentShots)
    const quality = averageQuality(segmentShots)
    const status = statusFromSegmentShots(segmentShots)
    const blocker = providerTask.blocker ?? segmentShots.find((shot) => shot.blocker)?.blocker ?? null
    return {
      ...segment,
      status,
      readiness: blocker ? 'blocked' : segment.readiness,
      blocker,
      agentStates: updateSegmentAgentStatesFromRuntime({
        segment,
        providerTask,
        quality,
        status,
      }),
      providerTask,
      quality,
    }
  })
}

function updateRuntimeAgents(params: {
  agents: readonly EditTimelineBlackboardAgent[]
  shots: readonly EditTimelineBlackboardShot[]
  finalCritic: EditTimelineBlackboardFinalCritic
}): EditTimelineBlackboardAgent[] {
  const hasRuntimeProviderTask = params.shots.some((shot) => shot.providerTask.status !== 'planned')
  const hasBlockedShot = params.shots.some((shot) => shot.status === 'blocked')
  const allSubmittedShotsSucceeded = params.shots.length > 0
    && params.shots.every((shot) => shot.providerTask.status === 'succeeded' && shot.providerTask.outputUrl)

  return params.agents.map((agent) => {
    if (agent.role === 'provider-production-agent') {
      const status: EditTimelineBlackboardStatus = hasBlockedShot
        ? 'blocked'
        : allSubmittedShotsSucceeded
          ? 'scored'
          : hasRuntimeProviderTask
            ? 'ready'
            : agent.status
      return {
        ...agent,
        status,
        outputs: params.shots.map((shot) => {
          const task = shot.providerTask
          const taskRef = task.taskId ? ` task:${task.taskId}` : ''
          const outputRef = task.outputUrl ? ` output:${task.outputUrl}` : ''
          const blockerRef = task.blocker ? ` blocker:${task.blocker}` : ''
          return `${shot.shotId}: ${task.status}${taskRef}${outputRef}${blockerRef}`
        }),
      }
    }

    if (agent.role === 'film-critic-agent') {
      const outputs = params.finalCritic.status === 'scored'
        ? [
            `final:scored score:${String(params.finalCritic.score)} next:${params.finalCritic.nextOptimizationTarget}`,
          ]
        : [
            `final:${params.finalCritic.status} next:${params.finalCritic.nextOptimizationTarget}`,
          ]
      return {
        ...agent,
        status: params.finalCritic.status,
        ownedShotIds: params.shots
          .filter((shot) => shot.status === 'blocked' || shot.quality.redoReason)
          .map((shot) => shot.shotId),
        outputs,
      }
    }

    return agent
  })
}

function promptAspectRatio(prompt: string): string | null {
  const match = prompt.match(/\b(\d{1,2}:\d{1,2})\b/)
  return match?.[1] ?? null
}

export function scoreEditTimelineFinalVideoEvidence(params: {
  blackboard: EditTimelineBlackboard
  finalVideo?: EditTimelineBlackboardRuntimeFinalVideoEvidence | null
}): EditTimelineFinalVideoEvidenceScore {
  const finalUrl = nullableTrim(params.finalVideo?.url ?? null)
  if (!finalUrl) {
    return {
      score: 0,
      issues: ['final-video-missing'],
      nextOptimizationTarget: 'assemble_timeline_video',
    }
  }

  const issues: string[] = []
  const shotCount = params.blackboard.shots.length
  if (shotCount < 3) {
    issues.push('shot-count-below-three')
  }

  const missingOutputShotIds = params.blackboard.shots
    .filter((shot) => !nullableTrim(shot.providerTask.outputUrl))
    .map((shot) => shot.shotId)
  if (missingOutputShotIds.length > 0) {
    issues.push(`missing-panel-video:${missingOutputShotIds.join(',')}`)
  }

  const blockedShotIds = params.blackboard.shots
    .filter((shot) => shot.status === 'blocked' || shot.providerTask.status === 'failed' || shot.providerTask.status === 'blocked')
    .map((shot) => shot.shotId)
  if (blockedShotIds.length > 0) {
    issues.push(`blocked-shot:${blockedShotIds.join(',')}`)
  }

  const providerBlockers = uniqueStrings(params.blackboard.shots
    .map((shot) => nullableTrim(shot.providerTask.blocker) ?? nullableTrim(shot.blocker))
    .filter((blocker): blocker is string => blocker !== null))
  issues.push(...providerBlockers)

  const targetAspectRatio = promptAspectRatio(params.blackboard.shots[0]?.promptPackage.providerPrompt ?? '')
  if (!targetAspectRatio) {
    issues.push('target-aspect-ratio-not-recorded')
  } else {
    const mismatchedShotIds = params.blackboard.shots
      .filter((shot) => !shot.promptPackage.providerPrompt.includes(targetAspectRatio))
      .map((shot) => shot.shotId)
    if (mismatchedShotIds.length > 0) {
      issues.push(`target-aspect-ratio-mismatch:${mismatchedShotIds.join(',')}`)
    }
  }

  issues.push(...(params.finalVideo?.issues ?? []))
  const uniqueIssues = uniqueStrings(issues)
  const score = Math.max(0, 100 - uniqueIssues.length * 12)
  return {
    score,
    issues: uniqueIssues,
    nextOptimizationTarget: uniqueIssues[0] ?? 'browser-playback-acceptance',
  }
}

export function mergeEditTimelineBlackboardRuntimeEvidence(
  blackboard: EditTimelineBlackboard,
  evidence: MergeEditTimelineBlackboardRuntimeEvidenceInput,
): EditTimelineBlackboard {
  const runtimeTasks = evidence.providerTasks ?? []
  const shotsById = new Map(blackboard.shots.map((shot) => [shot.shotId, shot] as const))
  for (const task of runtimeTasks) {
    if (!shotsById.has(task.shotId)) {
      throw new Error(`EDIT_TIMELINE_BLACKBOARD_UNKNOWN_RUNTIME_SHOT:${task.shotId}`)
    }
  }

  const runtimeTasksByShotId = new Map(runtimeTasks.map((task) => [task.shotId, task] as const))
  const shots = blackboard.shots.map((shot) => {
    const runtimeTask = runtimeTasksByShotId.get(shot.shotId)
    if (!runtimeTask) return shot

    const issue = runtimeIssueForTask(runtimeTask)
    const providerTask = providerTaskFromEvidence(runtimeTask)
    return {
      ...shot,
      status: statusFromRuntimeTask({ shot, task: runtimeTask, issue }),
      readiness: issue ? 'blocked' : shot.readiness,
      blocker: nullableTrim(runtimeTask.blocker) ?? (issue && runtimeTask.status === 'succeeded' ? issue : shot.blocker),
      providerTask,
      quality: qualityFromRuntimeTask({
        shot,
        task: runtimeTask,
        issue,
      }),
    }
  })

  const runtimeExperiments = runtimeTasks.map((task) => {
    const shot = shotsById.get(task.shotId)
    if (!shot) {
      throw new Error(`EDIT_TIMELINE_BLACKBOARD_UNKNOWN_RUNTIME_SHOT:${task.shotId}`)
    }
    return {
      shotId: task.shotId,
      provider: task.provider,
      model: task.model,
      inputPrompt: shot.promptPackage.providerPrompt,
      taskId: nullableTrim(task.taskId),
      outputUrl: nullableTrim(task.outputUrl),
      criticScore: typeof task.criticScore === 'number' ? clampScore(task.criticScore) : null,
      status: task.status,
      blocker: nullableTrim(task.blocker),
    }
  })
  const runtimeExperimentKeys = new Set(runtimeExperiments.map(providerExperimentKey))
  const providerExperiments = [
    ...blackboard.providerExperiments.filter((experiment) => !runtimeExperimentKeys.has(providerExperimentKey(experiment))),
    ...runtimeExperiments,
  ]
  const segmentBlackboards = updateSegmentBlackboardsFromRuntime({
    segmentBlackboards: blackboard.segmentBlackboards,
    shots,
  })

  const runtimeIssues = uniqueStrings(runtimeTasks
    .map(runtimeIssueForTask)
    .filter((issue): issue is string => issue !== null))
  const finalVideo = evidence.finalVideo ?? null
  const finalVideoBlocker = nullableTrim(evidence.finalVideoBlocker)
  const finalEvidenceRefs = finalVideo
    ? uniqueStrings([finalVideo.url, ...finalVideo.evidenceRefs])
    : blackboard.finalCritic.evidenceRefs
  const finalVideoIssues = finalVideo?.issues ? [...finalVideo.issues] : []
  const finalVideoScore = scoreEditTimelineFinalVideoEvidence({
    blackboard: {
      ...blackboard,
      shots,
    },
    finalVideo,
  })
  const allShotsHaveSucceededOutput = shots.length > 0
    && shots.every((shot) => shot.providerTask.status === 'succeeded' && shot.providerTask.outputUrl)
  const finalAssemblyReady = runtimeTasks.length > 0
    && allShotsHaveSucceededOutput
    && !finalVideo
    && runtimeIssues.length === 0
    && !finalVideoBlocker
  const finalIssues = uniqueStrings([
    ...carryForwardFinalCriticIssues({
      issues: blackboard.finalCritic.issues,
      finalVideo,
    }),
    ...runtimeIssues,
    ...finalVideoScore.issues.filter((issue) => finalVideo !== null || issue !== 'final-video-missing'),
    ...finalVideoIssues,
    ...(finalVideoBlocker ? [finalVideoBlocker] : []),
  ])
  const finalCritic: EditTimelineBlackboardFinalCritic = {
    ...blackboard.finalCritic,
    status: runtimeIssues.length > 0 || finalVideoBlocker
      ? 'blocked'
      : finalVideo
        ? 'scored'
        : finalAssemblyReady
          ? 'ready'
        : blackboard.finalCritic.status,
    score: runtimeIssues.length > 0 || finalVideoBlocker
      ? 0
      : finalVideo
        ? clampScore(finalVideoScore.score)
        : 0,
    issues: finalIssues,
    nextOptimizationTarget: finalIssues[0] ?? (finalVideo
      ? finalVideoScore.nextOptimizationTarget
      : finalAssemblyReady
        ? 'assemble_timeline_video'
        : blackboard.finalCritic.nextOptimizationTarget),
    evidenceRefs: finalEvidenceRefs,
  }

  const agents = updateRuntimeAgents({
    agents: blackboard.agents,
    shots,
    finalCritic,
  })

  return editTimelineBlackboardSchema.parse({
    ...blackboard,
    status: finalCritic.status === 'blocked'
      ? 'blocked'
      : finalCritic.status === 'scored'
        ? 'scored'
        : blackboard.status,
    agents,
    segmentBlackboards,
    shots,
    providerExperiments,
    finalCritic,
    nextOptimizationTarget: finalCritic.nextOptimizationTarget,
  })
}

export function buildEditTimelineBlackboard(input: BuildEditTimelineBlackboardInput): EditTimelineBlackboard {
  const macroScript = buildMacroScript(input.timeline)
  const contributionsByShotId = buildShotContributions({
    input,
    macroScript,
  })
  const shots = buildBlackboardShots({
    input,
    contributionsByShotId,
  })
  const segmentBlackboards = buildSegmentBlackboards({
    input,
    macroScript,
    shots,
    contributionsByShotId,
  })
  const finalCritic = criticFromShots({
    shots,
    risks: input.risks,
  })
  const agents = buildAgents({
    timeline: input.timeline,
    shots,
    macroScript,
    segmentBlackboards,
  })

  return editTimelineBlackboardSchema.parse({
    id: `blackboard-${input.timeline.id}`,
    timelineId: input.timeline.id,
    version: 'edit-timeline-blackboard-v1',
    sourceStory: input.sourceStory,
    status: finalCritic.issues.length > 0 ? 'blocked' : 'planned',
    agents,
    macroScript,
    segmentBlackboards,
    shots,
    providerExperiments: [],
    finalCritic,
    nextOptimizationTarget: finalCritic.nextOptimizationTarget,
  })
}
