import { ARTIFACT_TYPES, type ArtifactType } from '@/lib/artifact-system/types'
import type { ExecutablePlanInput, ExecutablePlanStep } from '@/lib/plan-run-runtime/executor'
import {
  editTimelineBlackboardSchema,
  type EditTimelineBlackboard,
  type EditTimelineBlackboardShot,
  type EditTimelineSegmentBlackboard,
} from './blackboard'
import {
  editTimelineSchema,
  type ParsedEditTimeline,
  type ReferenceAsset,
  type ShotNode,
} from './types'

export interface CompileEditTimelineOptions {
  skillId: string
  materializeOperationId: string
  evaluateOperationId?: string | null
  blackboard?: EditTimelineBlackboard
  outputArtifactType?: ArtifactType
  evaluationOutputArtifactType?: ArtifactType
  materializeInput?: {
    common?: Readonly<Record<string, unknown>>
    byShotId?: Readonly<Record<string, Readonly<Record<string, unknown>>>>
  }
}

interface ShotStepKeys {
  materialize: string
  evaluate: string | null
}

interface BlackboardCompileContext {
  readonly blackboard: EditTimelineBlackboard
  readonly shotsById: ReadonlyMap<string, EditTimelineBlackboardShot>
  readonly segmentsById: ReadonlyMap<string, EditTimelineSegmentBlackboard>
}

function formatParseIssue(path: (string | number)[], message: string): string {
  const location = path.length ? path.join('.') : 'root'
  return `${location}:${message}`
}

function findDuplicate(values: string[]): string | null {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) return value
    seen.add(value)
  }
  return null
}

function assertNoDuplicateIds(kind: string, ids: string[]): void {
  const duplicate = findDuplicate(ids)
  if (duplicate) {
    throw new Error(`EDIT_TIMELINE_DUPLICATE_${kind.toUpperCase()}_ID:${duplicate}`)
  }
}

export function parseEditTimeline(input: unknown): ParsedEditTimeline {
  const parsed = editTimelineSchema.safeParse(input)
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => formatParseIssue(issue.path, issue.message))
      .join('|')
    throw new Error(`EDIT_TIMELINE_INVALID:${details}`)
  }

  const timeline = parsed.data
  assertNoDuplicateIds('segment', timeline.segments.map((segment) => segment.id))
  assertNoDuplicateIds('shot', timeline.shots.map((shot) => shot.id))
  assertNoDuplicateIds('reference', timeline.references.map((reference) => reference.id))

  const segmentsById = new Map(timeline.segments.map((segment) => [segment.id, segment] as const))
  const segmentIds = new Set(segmentsById.keys())
  const shotIds = new Set(timeline.shots.map((shot) => shot.id))
  const referenceIds = new Set(timeline.references.map((reference) => reference.id))

  for (const shot of timeline.shots) {
    if (!segmentIds.has(shot.segmentId)) {
      throw new Error(`EDIT_TIMELINE_UNKNOWN_SHOT_SEGMENT:${shot.id}:${shot.segmentId}`)
    }
    const segment = segmentsById.get(shot.segmentId)
    if (!segment) {
      throw new Error(`EDIT_TIMELINE_UNKNOWN_SHOT_SEGMENT:${shot.id}:${shot.segmentId}`)
    }
    if (shot.startMs < segment.startMs) {
      throw new Error(`EDIT_TIMELINE_SHOT_START_BEFORE_SEGMENT:${shot.id}:${shot.segmentId}`)
    }
    const shotEndMs = shot.startMs + shot.durationMs
    const segmentEndMs = segment.startMs + segment.durationMs
    if (shotEndMs > segmentEndMs) {
      throw new Error(`EDIT_TIMELINE_SHOT_END_AFTER_SEGMENT:${shot.id}:${shot.segmentId}`)
    }
    for (const dependency of shot.dependsOn) {
      if (!shotIds.has(dependency)) {
        throw new Error(`EDIT_TIMELINE_UNKNOWN_SHOT_DEPENDENCY:${shot.id}:${dependency}`)
      }
    }
    for (const referenceId of shot.referenceIds) {
      if (!referenceIds.has(referenceId)) {
        throw new Error(`EDIT_TIMELINE_UNKNOWN_SHOT_REFERENCE:${shot.id}:${referenceId}`)
      }
    }
  }

  for (const segment of timeline.segments) {
    for (const shotId of segment.shotIds) {
      if (!shotIds.has(shotId)) {
        throw new Error(`EDIT_TIMELINE_UNKNOWN_SEGMENT_SHOT:${segment.id}:${shotId}`)
      }
    }
  }

  for (const shot of timeline.shots) {
    const segment = segmentsById.get(shot.segmentId)
    if (!segment) {
      throw new Error(`EDIT_TIMELINE_UNKNOWN_SHOT_SEGMENT:${shot.id}:${shot.segmentId}`)
    }
    if (!segment.shotIds.includes(shot.id)) {
      throw new Error(`EDIT_TIMELINE_SHOT_NOT_LISTED_IN_SEGMENT:${shot.id}:${shot.segmentId}`)
    }
  }

  return timeline
}

function sanitizeStepToken(value: string): string {
  const token = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return token || 'shot'
}

function reserveStepKey(baseKey: string, reservedStepKeys: Set<string>): string {
  if (!reservedStepKeys.has(baseKey)) {
    reservedStepKeys.add(baseKey)
    return baseKey
  }

  let index = 2
  while (reservedStepKeys.has(`${baseKey}_${index}`)) {
    index += 1
  }
  const nextKey = `${baseKey}_${index}`
  reservedStepKeys.add(nextKey)
  return nextKey
}

function sortShotsByTimelineOrder(left: ShotNode, right: ShotNode): number {
  if (left.startMs !== right.startMs) return left.startMs - right.startMs
  if (left.order !== right.order) return left.order - right.order
  return left.id.localeCompare(right.id)
}

function durationSeconds(shot: ShotNode): number {
  const seconds = shot.control.durationSeconds ?? shot.durationMs / 1000
  return Number(seconds.toFixed(3))
}

function stripUndefinedValues(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) output[key] = value
  }
  return output
}

function buildControlPayload(shot: ShotNode, timeline: ParsedEditTimeline): Record<string, unknown> {
  return stripUndefinedValues({
    prompt: shot.control.prompt,
    negativePrompt: shot.control.negativePrompt,
    durationSeconds: durationSeconds(shot),
    aspectRatio: shot.control.aspectRatio ?? timeline.aspectRatio,
    seed: shot.control.seed,
    firstFrameRef: shot.control.firstFrameRef,
    lastFrameRef: shot.control.lastFrameRef,
    referenceImageRefs: shot.control.referenceImageRefs,
    characterRefIds: shot.control.characterRefIds,
    performanceRefIds: shot.control.performanceRefIds,
    cameraMotion: shot.control.cameraMotion,
    subjectMotion: shot.control.subjectMotion,
    sceneMotion: shot.control.sceneMotion,
    providerHints: shot.control.providerHints,
  })
}

function buildBlackboardControlPayload(params: {
  shot: ShotNode
  timeline: ParsedEditTimeline
  blackboardShot: EditTimelineBlackboardShot
}): Record<string, unknown> {
  const basePayload = buildControlPayload(params.shot, params.timeline)
  const {
    prompt: _timelinePrompt,
    negativePrompt: _timelineNegativePrompt,
    ...restPayload
  } = basePayload
  return stripUndefinedValues({
    ...restPayload,
    prompt: params.blackboardShot.promptPackage.providerPrompt,
    negativePrompt: params.blackboardShot.promptPackage.negativePrompt,
  })
}

function buildShotReferences(shot: ShotNode, timeline: ParsedEditTimeline): ReferenceAsset[] {
  const referencesById = new Map(timeline.references.map((reference) => [reference.id, reference]))
  return shot.referenceIds.map((referenceId) => {
    const reference = referencesById.get(referenceId)
    if (!reference) {
      throw new Error(`EDIT_TIMELINE_UNKNOWN_SHOT_REFERENCE:${shot.id}:${referenceId}`)
    }
    return reference
  })
}

function buildMaterializeInput(params: {
  timeline: ParsedEditTimeline
  shot: ShotNode
  blackboardShot?: EditTimelineBlackboardShot
  segmentBlackboard?: EditTimelineSegmentBlackboard
  overrides?: Readonly<Record<string, unknown>>
}): Record<string, unknown> {
  const blackboardControlPayload = params.blackboardShot
    ? buildBlackboardControlPayload({
        timeline: params.timeline,
        shot: params.shot,
        blackboardShot: params.blackboardShot,
      })
    : null
  return {
    editFirst: true,
    timelineId: params.timeline.id,
    timelineTitle: params.timeline.title,
    segmentId: params.shot.segmentId,
    shotId: params.shot.id,
    shotTitle: params.shot.title,
    shotGoal: params.shot.goal,
    referenceIds: params.shot.referenceIds,
    track: params.shot.track,
    startMs: params.shot.startMs,
    durationMs: params.shot.durationMs,
    durationSeconds: durationSeconds(params.shot),
    controlPayload: blackboardControlPayload ?? buildControlPayload(params.shot, params.timeline),
    references: buildShotReferences(params.shot, params.timeline),
    continuityBible: params.timeline.continuityBible,
    evalRubric: params.timeline.evalRubric ?? null,
    ...(params.overrides ?? {}),
    ...(params.blackboardShot && params.segmentBlackboard ? {
      blackboardSegmentId: params.segmentBlackboard.segmentId,
      promptPackage: params.blackboardShot.promptPackage,
      segmentAgentStates: params.segmentBlackboard.agentStates,
      segmentSoundPlan: params.segmentBlackboard.soundPlan,
      providerTaskPlan: params.blackboardShot.providerTask,
      controlPayload: blackboardControlPayload,
    } : {}),
  }
}

function buildEvaluationInput(params: {
  timeline: ParsedEditTimeline
  shot: ShotNode
  materializeStepKey: string
  blackboardShot?: EditTimelineBlackboardShot
}): Record<string, unknown> {
  return {
    editFirst: true,
    timelineId: params.timeline.id,
    timelineTitle: params.timeline.title,
    segmentId: params.shot.segmentId,
    shotId: params.shot.id,
    shotTitle: params.shot.title,
    shotGoal: params.shot.goal,
    referenceIds: params.shot.referenceIds,
    materializeStepKey: params.materializeStepKey,
    expectedDurationSeconds: durationSeconds(params.shot),
    controlPayload: params.blackboardShot
      ? buildBlackboardControlPayload({
          timeline: params.timeline,
          shot: params.shot,
          blackboardShot: params.blackboardShot,
        })
      : buildControlPayload(params.shot, params.timeline),
    references: buildShotReferences(params.shot, params.timeline),
    continuityBible: params.timeline.continuityBible,
    evalRubric: params.timeline.evalRubric ?? null,
  }
}

function buildBlackboardCompileContext(
  timeline: ParsedEditTimeline,
  inputBlackboard: EditTimelineBlackboard | undefined,
): BlackboardCompileContext | null {
  if (!inputBlackboard) return null

  const blackboard = editTimelineBlackboardSchema.parse(inputBlackboard)
  if (blackboard.timelineId !== timeline.id) {
    throw new Error(`EDIT_TIMELINE_BLACKBOARD_TIMELINE_MISMATCH:${blackboard.timelineId}:${timeline.id}`)
  }

  const timelineSegmentIds = new Set(timeline.segments.map((segment) => segment.id))
  const timelineShotIds = new Set(timeline.shots.map((shot) => shot.id))
  const macroSegmentIds = new Set(blackboard.macroScript.map((segment) => segment.segmentId))
  const segmentsById = new Map(blackboard.segmentBlackboards.map((segment) => [segment.segmentId, segment] as const))
  const shotsById = new Map(blackboard.shots.map((shot) => [shot.shotId, shot] as const))

  for (const segmentId of timelineSegmentIds) {
    if (!macroSegmentIds.has(segmentId)) {
      throw new Error(`EDIT_TIMELINE_BLACKBOARD_MACRO_SEGMENT_MISSING:${segmentId}`)
    }
    if (!segmentsById.has(segmentId)) {
      throw new Error(`EDIT_TIMELINE_BLACKBOARD_SEGMENT_COVERAGE_MISSING:${segmentId}`)
    }
  }
  for (const segment of blackboard.segmentBlackboards) {
    if (!timelineSegmentIds.has(segment.segmentId)) {
      throw new Error(`EDIT_TIMELINE_BLACKBOARD_UNKNOWN_SEGMENT:${segment.segmentId}`)
    }
    for (const dependency of segment.dependencies) {
      if (!timelineSegmentIds.has(dependency)) {
        throw new Error(`EDIT_TIMELINE_BLACKBOARD_UNKNOWN_SEGMENT_DEPENDENCY:${segment.segmentId}:${dependency}`)
      }
    }
    for (const shotId of segment.shotIds) {
      if (!timelineShotIds.has(shotId)) {
        throw new Error(`EDIT_TIMELINE_BLACKBOARD_UNKNOWN_SEGMENT_SHOT:${segment.segmentId}:${shotId}`)
      }
    }
  }
  for (const shotId of timelineShotIds) {
    if (!shotsById.has(shotId)) {
      throw new Error(`EDIT_TIMELINE_BLACKBOARD_SHOT_COVERAGE_MISSING:${shotId}`)
    }
  }
  for (const shot of blackboard.shots) {
    if (!timelineShotIds.has(shot.shotId)) {
      throw new Error(`EDIT_TIMELINE_BLACKBOARD_UNKNOWN_SHOT:${shot.shotId}`)
    }
    const timelineShot = timeline.shots.find((candidate) => candidate.id === shot.shotId)
    const segment = timelineShot ? segmentsById.get(timelineShot.segmentId) : null
    if (!segment?.shotIds.includes(shot.shotId)) {
      throw new Error(`EDIT_TIMELINE_BLACKBOARD_SHOT_SEGMENT_MISMATCH:${shot.shotId}:${timelineShot?.segmentId ?? 'missing-segment'}`)
    }
  }

  return {
    blackboard,
    shotsById,
    segmentsById,
  }
}

function validateCompileOptions(options: CompileEditTimelineOptions): void {
  if (!options.skillId.trim()) {
    throw new Error('EDIT_TIMELINE_INVALID_COMPILE_OPTIONS:skillId')
  }
  if (!options.materializeOperationId.trim()) {
    throw new Error('EDIT_TIMELINE_INVALID_COMPILE_OPTIONS:materializeOperationId')
  }
  if (options.evaluateOperationId !== undefined && options.evaluateOperationId !== null && !options.evaluateOperationId.trim()) {
    throw new Error('EDIT_TIMELINE_INVALID_COMPILE_OPTIONS:evaluateOperationId')
  }
}

function createShotStepKeys(params: {
  shots: ShotNode[]
  includeEvaluation: boolean
}): Map<string, ShotStepKeys> {
  const reservedStepKeys = new Set<string>()
  const stepKeysByShotId = new Map<string, ShotStepKeys>()

  for (const shot of params.shots) {
    const baseKey = `shot_${sanitizeStepToken(shot.id)}`
    const materialize = reserveStepKey(`${baseKey}_materialize`, reservedStepKeys)
    const evaluate = params.includeEvaluation
      ? reserveStepKey(`${baseKey}_evaluate`, reservedStepKeys)
      : null
    stepKeysByShotId.set(shot.id, { materialize, evaluate })
  }

  return stepKeysByShotId
}

function materializeDependencies(params: {
  shot: ShotNode
  stepKeysByShotId: Map<string, ShotStepKeys>
}): string[] {
  return params.shot.dependsOn.map((dependency) => {
    const keys = params.stepKeysByShotId.get(dependency)
    if (!keys) {
      throw new Error(`EDIT_TIMELINE_UNKNOWN_SHOT_DEPENDENCY:${params.shot.id}:${dependency}`)
    }
    return keys.materialize
  })
}

export function compileEditTimelineToExecutablePlan(
  input: unknown,
  options: CompileEditTimelineOptions,
): ExecutablePlanInput {
  validateCompileOptions(options)

  const timeline = parseEditTimeline(input)
  const blackboardContext = buildBlackboardCompileContext(timeline, options.blackboard)
  const orderedShots = [...timeline.shots].sort(sortShotsByTimelineOrder)
  const evaluateOperationId = options.evaluateOperationId?.trim() || null
  const stepKeysByShotId = createShotStepKeys({
    shots: orderedShots,
    includeEvaluation: !!evaluateOperationId,
  })
  const outputArtifactType = options.outputArtifactType ?? ARTIFACT_TYPES.PANEL_VIDEO
  const evaluationOutputArtifactType = options.evaluationOutputArtifactType ?? ARTIFACT_TYPES.SHOT_PLAN
  const steps: ExecutablePlanStep[] = []

  for (const shot of orderedShots) {
    const keys = stepKeysByShotId.get(shot.id)
    if (!keys) {
      throw new Error(`EDIT_TIMELINE_MISSING_STEP_KEY:${shot.id}`)
    }
    const blackboardShot = blackboardContext?.shotsById.get(shot.id)
    const segmentBlackboard = blackboardContext?.segmentsById.get(shot.segmentId)

    steps.push({
      stepKey: keys.materialize,
      skillId: options.skillId,
      operationId: options.materializeOperationId,
      inputArtifacts: shot.inputArtifacts,
      outputArtifacts: shot.outputArtifacts.length ? shot.outputArtifacts : [outputArtifactType],
      dependsOn: materializeDependencies({ shot, stepKeysByShotId }),
      input: buildMaterializeInput({
        timeline,
        shot,
        blackboardShot,
        segmentBlackboard,
        overrides: {
          ...(options.materializeInput?.common ?? {}),
          ...(options.materializeInput?.byShotId?.[shot.id] ?? {}),
        },
      }),
    })

    if (evaluateOperationId && keys.evaluate) {
      steps.push({
        stepKey: keys.evaluate,
        skillId: options.skillId,
        operationId: evaluateOperationId,
        inputArtifacts: [outputArtifactType],
        outputArtifacts: [evaluationOutputArtifactType],
        dependsOn: [keys.materialize],
        input: buildEvaluationInput({
          timeline,
          shot,
          materializeStepKey: keys.materialize,
          blackboardShot,
        }),
      })
    }
  }

  return {
    goal: `Edit-first timeline: ${timeline.title}`,
    steps,
  }
}
