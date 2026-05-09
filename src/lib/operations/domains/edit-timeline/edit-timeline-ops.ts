import { z } from 'zod'
import { getAgentSkillManifest } from '@/lib/agent-skills/registry'
import { getProjectModelConfig } from '@/lib/config-service'
import { prisma } from '@/lib/prisma'
import {
  buildEditTimelineBlackboard,
  buildTimelineVideoEditorProject,
  buildEditTimelineConfirmationSummary,
  compileEditTimelineToExecutablePlan,
  continuityBibleSchema,
  controlPayloadSchema,
  EDIT_TIMELINE_BLACKBOARD_ARTIFACT_TYPE,
  EDIT_TIMELINE_WORKFLOW_ARTIFACT_TYPE,
  editTimelineSchema,
  editTimelineBlackboardSchema,
  editTimelineConfirmationSummarySchema,
  parseEditTimeline,
  referenceAssetSchema,
  resolveTimelinePanelVideoRef,
  gradePersistedEditFirstPlanRunTraceRound,
  campaignScoreInputSchema,
  mapControlPayloadToVideoProviderInput,
  type EditTimelineBlackboard,
  type EditTimelinePromptPackage,
  type EditTimelineSegmentBlackboard,
  type EditTimeline,
  type ParsedEditTimeline,
  type ShotNode,
  type TimelinePanelVideoSource,
} from '@/lib/edit-timeline'
import type {
  ConfirmationRequestPartData,
  EditTimelineAgentContribution,
  EditTimelineAgentCrew,
  EditTimelineAgentRole,
  EditTimelinePartData,
  PlanRunSubmittedPartData,
  ProjectAgentWorkflowSnapshot,
  ProjectAgentWorkflowStatus,
} from '@/lib/project-agent/types'
import {
  persistEditTimelineProviderEvidence,
  readEditTimelineBlackboardFromSnapshot,
  readEditTimelineWorkflowFromSnapshot,
  type EditTimelinePlanRunSnapshot,
} from '@/lib/edit-timeline/runtime-artifact-writer'
import { executeAgentPlan, type ExecutablePlanInput } from '@/lib/plan-run-runtime/executor'
import { createPlanArtifact, getPlanRunSnapshot, getPlanRunTraceSummary } from '@/lib/plan-run-runtime/service'
import type { PlanRunTraceSummary } from '@/lib/plan-run-runtime/trace-summary'
import { isConfirmedOperationInput, shouldRequireAssistantConfirmation } from '@/lib/operations/confirmation'
import { defineOperation } from '@/lib/operations/define-operation'
import { createProjectAgentOperationRegistryForApi } from '@/lib/operations/registry'
import { parseModelKeyStrict } from '@/lib/ai-registry/selection'
import {
  writeOperationDataPart,
  type ProjectAgentOperationContext,
  type ProjectAgentOperationRegistryDraft,
  type ProjectAgentToolResult,
} from '@/lib/operations/types'
import { renderVideoEditorProjectToStorage } from '@/lib/video-editor/render-video-editor-project'

const EFFECTS_NONE = {
  writes: false,
  billable: false,
  destructive: false,
  overwrite: false,
  bulk: false,
  externalSideEffects: false,
  longRunning: false,
} as const

const EFFECTS_WRITE = {
  writes: true,
  billable: false,
  destructive: false,
  overwrite: false,
  bulk: false,
  externalSideEffects: false,
  longRunning: false,
} as const

const EFFECTS_ASSEMBLE_FINAL_VIDEO = {
  writes: true,
  billable: false,
  destructive: false,
  overwrite: true,
  bulk: false,
  externalSideEffects: true,
  longRunning: true,
} as const

const EFFECTS_PRODUCTION_RUN = {
  writes: true,
  billable: true,
  destructive: false,
  overwrite: true,
  bulk: false,
  externalSideEffects: true,
  longRunning: true,
} as const

const START_EDIT_TIMELINE_VIDEO_RUN_OPERATION_ID = 'start_edit_timeline_video_run'
const START_EDIT_TIMELINE_PRODUCTION_RUN_OPERATION_ID = 'start_edit_timeline_production_run'
const START_EDIT_TIMELINE_RUN_OPERATION_IDS = new Set<string>([
  START_EDIT_TIMELINE_VIDEO_RUN_OPERATION_ID,
  START_EDIT_TIMELINE_PRODUCTION_RUN_OPERATION_ID,
])

const nonEmptyStringSchema = z.string().trim().min(1)

const editTimelineRiskSchema = z.object({
  code: nonEmptyStringSchema,
  message: nonEmptyStringSchema,
}).strict()

const editTimelineIssueSchema = z.object({
  code: nonEmptyStringSchema,
  message: nonEmptyStringSchema,
}).strict()

const creativeBriefSchema = z.object({
  theme: nonEmptyStringSchema,
  protagonist: nonEmptyStringSchema,
  setting: nonEmptyStringSchema,
  mood: nonEmptyStringSchema,
  twist: nonEmptyStringSchema,
  targetDurationMs: z.number().int().positive(),
  aspectRatio: nonEmptyStringSchema,
  missingInfo: z.array(nonEmptyStringSchema),
  assumptions: z.array(nonEmptyStringSchema),
}).strict()

const editTimelineAgentRoleSchema = z.enum([
  'main-director',
  'visual-director',
  'story-editor',
  'sound-designer',
  'subtitle-writer',
  'screenplay-agent',
  'cinematography-agent',
  'continuity-agent',
  'prompt-engineer-agent',
  'sound-agent',
])

const editTimelineAgentOutputSchema = z.object({
  shotId: nonEmptyStringSchema,
  text: nonEmptyStringSchema,
}).strict()

const editTimelineAgentContributionSchema = z.object({
  agentId: nonEmptyStringSchema,
  role: editTimelineAgentRoleSchema,
  title: nonEmptyStringSchema,
  mission: nonEmptyStringSchema,
  summary: nonEmptyStringSchema,
  shotIds: z.array(nonEmptyStringSchema),
  outputs: z.array(editTimelineAgentOutputSchema),
  status: z.enum(['drafted', 'needs-review']),
}).strict()

const editTimelineAgentCrewSchema = z.object({
  director: editTimelineAgentContributionSchema,
  subagents: z.array(editTimelineAgentContributionSchema),
  synthesis: nonEmptyStringSchema,
}).strict()

const projectAgentWorkflowIntentSchema = z.enum([
  'story-generation',
  'storyboard-generation',
  'video-generation',
  'asset-planning',
  'edit-timeline',
  'voice-subtitle',
  'failure-recovery',
  'continue-project',
])

const projectAgentWorkflowStatusSchema = z.enum([
  'planned',
  'blocked',
  'submitted',
  'running',
  'succeeded',
  'failed',
])

const generationOptionValueSchema = z.union([z.string(), z.number(), z.boolean()])

const projectAgentWorkflowSchema = z.object({
  intent: projectAgentWorkflowIntentSchema,
  skillIds: z.array(nonEmptyStringSchema),
  timelineId: nonEmptyStringSchema,
  blackboard: editTimelineBlackboardSchema.optional(),
  shots: z.array(z.object({
    shotId: nonEmptyStringSchema,
    segmentId: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
    goal: nonEmptyStringSchema,
    startMs: z.number().int().min(0),
    durationMs: z.number().int().positive(),
  }).strict()),
  assets: z.array(z.object({
    id: nonEmptyStringSchema,
    kind: z.enum(['character', 'location', 'style', 'prop', 'reference', 'source-frame']),
    label: nonEmptyStringSchema,
    status: z.enum(['available', 'missing', 'planned']),
    source: z.enum(['user-reference', 'timeline-reference', 'text-only']),
    artifactRef: nonEmptyStringSchema.nullable().optional(),
  }).strict()),
  providerTasks: z.array(z.object({
    id: nonEmptyStringSchema,
    shotId: nonEmptyStringSchema,
    operationId: nonEmptyStringSchema,
    skillId: nonEmptyStringSchema,
    status: projectAgentWorkflowStatusSchema,
    requiredModelType: z.enum(['video', 'image', 'audio', 'music', 'voice', 'analysis']),
    providerModel: nonEmptyStringSchema.nullable().optional(),
    outputUrl: nonEmptyStringSchema.nullable().optional(),
    generationOptions: z.record(generationOptionValueSchema).optional(),
    target: z.object({
      panelId: nonEmptyStringSchema.optional(),
      storyboardId: nonEmptyStringSchema.optional(),
      panelIndex: z.number().int().min(0).optional(),
    }).strict().nullable(),
    assetPolicy: z.enum(['text-to-video', 'image-to-video', 'first-last-frame', 'requires-asset']),
    blockers: z.array(nonEmptyStringSchema),
  }).strict()),
  traces: z.array(z.object({
    stage: nonEmptyStringSchema,
    status: z.enum(['planned', 'passed', 'blocked']),
    message: nonEmptyStringSchema,
    refs: z.array(nonEmptyStringSchema),
  }).strict()),
  evals: z.array(z.object({
    id: nonEmptyStringSchema,
    checks: z.array(z.object({
      code: nonEmptyStringSchema,
      status: z.enum(['passed', 'warning', 'blocked']),
      message: nonEmptyStringSchema,
    }).strict()),
  }).strict()),
  artifacts: z.array(z.object({
    id: nonEmptyStringSchema,
    kind: z.enum(['timeline', 'shot', 'plan-run', 'provider-task', 'video', 'diagnostic']),
    status: projectAgentWorkflowStatusSchema,
    ref: nonEmptyStringSchema.nullable().optional(),
  }).strict()),
}).strict()

const createEditTimelinePlanInputSchema = z.object({
  goal: nonEmptyStringSchema,
  timelineId: nonEmptyStringSchema.optional(),
  title: nonEmptyStringSchema.optional(),
  aspectRatio: nonEmptyStringSchema.optional(),
  fps: z.number().positive().optional(),
  duration: z.number().positive().optional(),
  targetDurationMs: z.number().int().positive().optional(),
  shotCount: z.number().int().min(1).max(6).optional(),
  style: nonEmptyStringSchema.optional(),
  hasAudio: z.boolean().optional(),
  hasSubtitle: z.boolean().optional(),
  outline: z.string().trim().optional(),
  references: z.array(referenceAssetSchema).optional(),
  continuityBible: continuityBibleSchema.optional(),
}).strict()

const createEditTimelinePlanOutputSchema = z.object({
  timeline: editTimelineSchema,
  sourceStory: nonEmptyStringSchema,
  creativeBrief: creativeBriefSchema,
  agentCrew: editTimelineAgentCrewSchema,
  blackboard: editTimelineBlackboardSchema,
  unresolvedRefs: z.array(nonEmptyStringSchema),
  risks: z.array(editTimelineRiskSchema),
  estimatedTaskCount: z.number().int().min(0),
  workflow: projectAgentWorkflowSchema,
}).strict()

const validateEditTimelineInputSchema = z.object({
  timeline: z.unknown(),
}).strict()

const validateEditTimelineOutputSchema = z.object({
  ok: z.boolean(),
  issues: z.array(editTimelineIssueSchema),
  timeline: editTimelineSchema.optional(),
}).strict()

const compileEditTimelineInputSchema = z.object({
  timeline: z.unknown(),
  blackboard: editTimelineBlackboardSchema.optional(),
  materializeSkillId: nonEmptyStringSchema,
  materializeOperationId: nonEmptyStringSchema,
  evaluateOperationId: nonEmptyStringSchema.nullable().optional(),
  videoModel: nonEmptyStringSchema.optional(),
  firstLastFrameModel: nonEmptyStringSchema.optional(),
  storyboardId: nonEmptyStringSchema.optional(),
  startPanelIndex: z.number().int().min(0).optional(),
  panelIdsByShotId: z.record(nonEmptyStringSchema).optional(),
  sourceFrameRefByShotId: z.record(nonEmptyStringSchema).optional(),
  mediaRefs: z.record(nonEmptyStringSchema).optional(),
  generationOptions: z.record(generationOptionValueSchema).optional(),
  assembleFinalVideo: z.boolean().optional(),
  assemblySkillId: nonEmptyStringSchema.optional(),
  assemblyOperationId: nonEmptyStringSchema.optional(),
  renderFinalVideo: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  const hasProviderTargetInput = hasProviderExecutionInput(value)
  const hasFinalAssemblyInput = Boolean(value.assembleFinalVideo || value.assemblySkillId || value.assemblyOperationId || value.renderFinalVideo)
  if (!hasProviderTargetInput && !hasFinalAssemblyInput) return
  if (!value.videoModel) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['videoModel'],
      message: 'EDIT_TIMELINE_PROVIDER_VIDEO_MODEL_REQUIRED',
    })
  }
  if (!value.panelIdsByShotId && !(value.storyboardId && value.startPanelIndex !== undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['panelIdsByShotId'],
      message: 'EDIT_TIMELINE_PROVIDER_TARGET_REQUIRED',
    })
  }
})

const materializeEditTimelineStoryboardInputSchema = z.object({
  confirmed: z.boolean().optional(),
  timeline: z.unknown(),
  blackboard: editTimelineBlackboardSchema.optional(),
  episodeId: nonEmptyStringSchema.optional(),
}).strict()

const materializeEditTimelineStoryboardOutputSchema = z.object({
  clipId: nonEmptyStringSchema,
  storyboardId: nonEmptyStringSchema,
  panelIdsByShotId: z.record(nonEmptyStringSchema),
  panels: z.array(z.object({
    shotId: nonEmptyStringSchema,
    panelId: nonEmptyStringSchema,
    panelIndex: z.number().int().min(0),
  }).strict()),
}).strict()

const assembleTimelineVideoInputSchema = z.object({
  confirmed: z.boolean().optional(),
  timeline: z.unknown(),
  episodeId: nonEmptyStringSchema.optional(),
  storyboardId: nonEmptyStringSchema.optional(),
  panelIdsByShotId: z.record(nonEmptyStringSchema).optional(),
  renderFinalVideo: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.storyboardId && !value.panelIdsByShotId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['panelIdsByShotId'],
      message: 'EDIT_TIMELINE_FINAL_VIDEO_PANEL_TARGET_REQUIRED',
    })
  }
})

const assembleTimelineVideoOutputSchema = z.object({
  editorProjectId: nonEmptyStringSchema,
  episodeId: nonEmptyStringSchema,
  storyboardId: nonEmptyStringSchema.nullable(),
  panelIdsByShotId: z.record(nonEmptyStringSchema),
  clipCount: z.number().int().min(0),
  renderStatus: z.enum(['completed']),
  outputUrl: nonEmptyStringSchema,
  finalVideoUrl: nonEmptyStringSchema,
  storageKey: nonEmptyStringSchema,
  blockers: z.array(nonEmptyStringSchema),
}).strict()

const productionRunResultSchema = z.object({
  success: z.boolean(),
  planRunId: nonEmptyStringSchema,
  status: nonEmptyStringSchema.optional(),
  executedStepKeys: z.array(nonEmptyStringSchema).optional(),
  waitingTaskId: nonEmptyStringSchema.nullable().optional(),
  failedStepKey: nonEmptyStringSchema.optional(),
  error: z.unknown().optional(),
  snapshot: z.unknown(),
}).strict()

const startEditTimelineVideoRunInputSchema = z.object({
  confirmed: z.boolean().optional(),
  story: nonEmptyStringSchema.optional(),
  goal: nonEmptyStringSchema.optional(),
  projectId: nonEmptyStringSchema.optional(),
  episodeId: nonEmptyStringSchema.optional(),
  timelineId: nonEmptyStringSchema.optional(),
  title: nonEmptyStringSchema.optional(),
  aspectRatio: nonEmptyStringSchema.optional(),
  fps: z.number().positive().optional(),
  duration: z.number().positive().optional(),
  maxDurationSeconds: z.number().positive().optional(),
  targetDurationMs: z.number().int().positive().optional(),
  shotCount: z.number().int().min(1).max(6).optional(),
  style: nonEmptyStringSchema.optional(),
  hasAudio: z.boolean().optional(),
  hasSubtitle: z.boolean().optional(),
  outline: z.string().trim().optional(),
  providerProfile: nonEmptyStringSchema.optional(),
  videoModel: nonEmptyStringSchema.optional(),
  firstLastFrameModel: nonEmptyStringSchema.optional(),
  mediaRefs: z.record(nonEmptyStringSchema).optional(),
  generationOptions: z.record(generationOptionValueSchema).optional(),
  renderFinalVideo: z.boolean().optional(),
  references: z.array(referenceAssetSchema).optional(),
  continuityBible: continuityBibleSchema.optional(),
}).strict().superRefine((value, ctx) => {
  const story = value.story?.trim()
  const goal = value.goal?.trim()
  if (!story && !goal) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['story'],
      message: 'EDIT_TIMELINE_VIDEO_RUN_STORY_REQUIRED',
    })
  }
  if (story && goal && story.replace(/\s+/g, ' ') !== goal.replace(/\s+/g, ' ')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['goal'],
      message: 'EDIT_TIMELINE_VIDEO_RUN_STORY_AMBIGUOUS',
    })
  }
  if (value.duration !== undefined && value.maxDurationSeconds !== undefined) {
    const durationMs = Math.round(value.duration * 1000)
    const maxDurationMs = Math.round(value.maxDurationSeconds * 1000)
    if (durationMs !== maxDurationMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxDurationSeconds'],
        message: 'EDIT_TIMELINE_VIDEO_RUN_DURATION_AMBIGUOUS',
      })
    }
  }
  const explicitDurationSeconds = value.duration ?? value.maxDurationSeconds
  if (explicitDurationSeconds !== undefined && value.targetDurationMs !== undefined) {
    const explicitDurationMs = Math.round(explicitDurationSeconds * 1000)
    if (explicitDurationMs !== value.targetDurationMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetDurationMs'],
        message: 'EDIT_TIMELINE_VIDEO_RUN_DURATION_AMBIGUOUS',
      })
    }
  }
})

const startEditTimelineProductionRunInputSchema = z.object({
  confirmed: z.boolean().optional(),
  timeline: z.unknown(),
  blackboard: editTimelineBlackboardSchema,
  episodeId: nonEmptyStringSchema.optional(),
  videoModel: nonEmptyStringSchema.optional(),
  firstLastFrameModel: nonEmptyStringSchema.optional(),
  mediaRefs: z.record(nonEmptyStringSchema).optional(),
  generationOptions: z.record(generationOptionValueSchema).optional(),
  renderFinalVideo: z.boolean().optional(),
}).strict()

interface ProviderExecutionInputShape {
  videoModel?: string
  firstLastFrameModel?: string
  storyboardId?: string
  startPanelIndex?: number
  panelIdsByShotId?: Record<string, string>
  sourceFrameRefByShotId?: Record<string, string>
  mediaRefs?: Record<string, string>
  generationOptions?: Record<string, z.output<typeof generationOptionValueSchema>>
}

function hasProviderExecutionInput(value: ProviderExecutionInputShape): boolean {
  return Boolean(
    value.videoModel
    || value.firstLastFrameModel
    || value.storyboardId
    || value.startPanelIndex !== undefined
    || value.panelIdsByShotId
    || value.sourceFrameRefByShotId
    || value.mediaRefs
    || value.generationOptions,
  )
}

const scoreEditTimelineSinglePlanRunInputSchema = z.object({
  planRunId: nonEmptyStringSchema,
  eventLimit: z.number().int().positive().optional(),
}).strict()

const scoreEditTimelineTraceRoundInputSchema = z.object({
  initialPlanRunId: nonEmptyStringSchema,
  resumePlanRunId: nonEmptyStringSchema,
  expectedOperationId: nonEmptyStringSchema,
  expectedMessageIncludes: nonEmptyStringSchema.optional(),
  eventLimit: z.number().int().positive().optional(),
  before: campaignScoreInputSchema,
  after: campaignScoreInputSchema,
  fixedPriority: z.enum(['P0', 'P1', 'P2', 'P3']).nullable().optional(),
  capturedNewIssue: z.boolean().optional(),
}).strict()

const scoreEditTimelineTraceInputSchema = z.union([
  scoreEditTimelineSinglePlanRunInputSchema,
  scoreEditTimelineTraceRoundInputSchema,
])

const scoreEditTimelineDimensionSchema = z.object({
  code: nonEmptyStringSchema,
  status: z.enum(['passed', 'warning', 'blocked']),
  message: nonEmptyStringSchema,
  score: z.number().min(0),
  maxScore: z.number().positive(),
}).strict()

const scoreEditTimelineTraceOutputSchema = z.object({
  traceEvalPassRate: z.number().min(0).max(100),
  passed: z.boolean(),
  blockers: z.array(nonEmptyStringSchema),
  grade: z.unknown(),
  score: z.number().min(0).max(100).optional(),
  failures: z.array(nonEmptyStringSchema).optional(),
  nextOptimizationTarget: nonEmptyStringSchema.optional(),
  dimensions: z.array(scoreEditTimelineDimensionSchema).optional(),
}).strict()

const redoTimelineShotInputSchema = z.object({
  timeline: z.unknown(),
  shotId: nonEmptyStringSchema,
  redoReason: nonEmptyStringSchema,
  sourceTraceId: nonEmptyStringSchema.optional(),
  controlPatch: controlPayloadSchema.partial().strict().optional(),
}).strict()

const redoTimelineShotOutputSchema = z.object({
  timeline: editTimelineSchema,
  redoPlan: z.object({
    targetShotId: nonEmptyStringSchema,
    affectedShotIds: z.array(nonEmptyStringSchema),
    skippedShotIds: z.array(nonEmptyStringSchema),
    revisionId: nonEmptyStringSchema,
    revision: z.object({
      parentShotId: nonEmptyStringSchema,
      sourceTraceId: nonEmptyStringSchema.optional(),
      redoReason: nonEmptyStringSchema,
      affectedDependencies: z.array(nonEmptyStringSchema),
    }).strict(),
    providerTaskPlan: z.object({
      id: nonEmptyStringSchema,
      shotId: nonEmptyStringSchema,
      operationId: z.literal('generate_panel_video'),
      status: z.literal('planned'),
      revisionId: nonEmptyStringSchema,
      redoReason: nonEmptyStringSchema,
      affectedShotIds: z.array(nonEmptyStringSchema),
    }).strict(),
  }).strict(),
}).strict()

const executablePlanStepSchema = z.object({
  stepKey: nonEmptyStringSchema,
  skillId: nonEmptyStringSchema,
  operationId: nonEmptyStringSchema,
  inputArtifacts: z.array(nonEmptyStringSchema).optional(),
  outputArtifacts: z.array(nonEmptyStringSchema).optional(),
  dependsOn: z.array(nonEmptyStringSchema).optional(),
  input: z.record(z.unknown()).nullable().optional(),
}).strict()

const executablePlanOutputSchema = z.object({
  goal: nonEmptyStringSchema,
  steps: z.array(executablePlanStepSchema),
}).strict()

const compileEditTimelineOutputSchema = z.object({
  plan: executablePlanOutputSchema,
  estimatedStepCount: z.number().int().min(0),
  confirmationSummary: editTimelineConfirmationSummarySchema,
  workflow: projectAgentWorkflowSchema,
  blackboard: editTimelineBlackboardSchema.optional(),
}).strict()

const startEditTimelineProductionRunOutputSchema = z.object({
  clipId: nonEmptyStringSchema,
  storyboardId: nonEmptyStringSchema,
  panelIdsByShotId: z.record(nonEmptyStringSchema),
  panels: z.array(z.object({
    shotId: nonEmptyStringSchema,
    panelId: nonEmptyStringSchema,
    panelIndex: z.number().int().min(0),
  }).strict()),
  plan: executablePlanOutputSchema,
  estimatedStepCount: z.number().int().min(0),
  planRun: productionRunResultSchema,
  workflow: projectAgentWorkflowSchema,
  blackboard: editTimelineBlackboardSchema,
}).strict()

const startEditTimelineRunProfileSchema = z.object({
  story: nonEmptyStringSchema,
  aspectRatio: nonEmptyStringSchema,
  targetDurationMs: z.number().int().positive(),
  shotCount: z.number().int().min(1),
  providerProfile: nonEmptyStringSchema.nullable(),
  videoModel: nonEmptyStringSchema,
}).strict()

const startEditTimelineCostPreflightSchema = z.object({
  providerTaskCount: z.number().int().min(0),
  finalAssemblyCount: z.number().int().min(0),
  billable: z.boolean(),
  confirmationRequired: z.boolean(),
  estimateLabel: nonEmptyStringSchema,
}).strict()

const startEditTimelineVideoRunOutputSchema = startEditTimelineProductionRunOutputSchema.extend({
  runProfile: startEditTimelineRunProfileSchema,
  costPreflight: startEditTimelineCostPreflightSchema,
  nextRequiredAction: z.enum(['monitor_plan_run', 'inspect_failed_plan_run']),
}).strict()

type CreateEditTimelinePlanInput = z.output<typeof createEditTimelinePlanInputSchema>
type CreativeBrief = z.output<typeof creativeBriefSchema>
type EditTimelineRisk = z.output<typeof editTimelineRiskSchema>
type EditTimelineIssue = z.output<typeof editTimelineIssueSchema>

const REQUIRED_SUBAGENT_ROLES = [
  'screenplay-agent',
  'cinematography-agent',
  'continuity-agent',
  'prompt-engineer-agent',
  'sound-agent',
] as const satisfies readonly EditTimelineAgentRole[]

function issueFromError(error: unknown): EditTimelineIssue {
  const message = error instanceof Error && error.message.trim()
    ? error.message.trim()
    : 'EDIT_TIMELINE_VALIDATION_FAILED'
  const code = message.split(':')[0]?.trim() || 'EDIT_TIMELINE_VALIDATION_FAILED'
  return { code, message }
}

function risk(code: string, message: string): EditTimelineRisk {
  return { code, message }
}

function missingShotIds(expectedShotIds: readonly string[], actualShotIds: readonly string[]): string[] {
  const actual = new Set(actualShotIds)
  return expectedShotIds.filter((shotId) => !actual.has(shotId))
}

function reviewAgentCrewCoverage(params: {
  agentCrew: EditTimelineAgentCrew
  timeline: ParsedEditTimeline
  blackboard?: EditTimelineBlackboard
}): {
  agentCrew: EditTimelineAgentCrew
  risks: EditTimelineRisk[]
} {
  const risks: EditTimelineRisk[] = []
  const needsReviewAgentIds = new Set<string>()
  const shotIds = params.timeline.shots.map((shot) => shot.id)
  const subagentsByRole = new Map(params.agentCrew.subagents.map((contribution) => [contribution.role, contribution]))
  const directorMissingShotIds = missingShotIds(shotIds, params.agentCrew.director.shotIds)

  if (directorMissingShotIds.length > 0) {
    needsReviewAgentIds.add(params.agentCrew.director.agentId)
    risks.push(risk(
      'EDIT_TIMELINE_AGENT_DIRECTOR_COVERAGE_MISSING',
      `EDIT_TIMELINE_AGENT_DIRECTOR_COVERAGE_MISSING:${directorMissingShotIds.join(',')}`,
    ))
  }

  for (const role of REQUIRED_SUBAGENT_ROLES) {
    const contribution = subagentsByRole.get(role)
    if (!contribution) {
      risks.push(risk(
        'EDIT_TIMELINE_AGENT_ROLE_MISSING',
        `EDIT_TIMELINE_AGENT_ROLE_MISSING:${role}`,
      ))
      continue
    }

    const missingAssignedShotIds = missingShotIds(shotIds, contribution.shotIds)
    const missingOutputShotIds = missingShotIds(shotIds, contribution.outputs.map((output) => output.shotId))
    const missingBlackboardOutputShotIds = params.blackboard
      ? params.timeline.shots
          .filter((shot) => {
            const blackboardShot = params.blackboard?.shots.find((candidate) => candidate.shotId === shot.id)
            return !(blackboardShot?.promptPackage.providerPrompt.trim())
          })
          .map((shot) => shot.id)
      : []

    if (missingAssignedShotIds.length > 0) {
      needsReviewAgentIds.add(contribution.agentId)
      risks.push(risk(
        'EDIT_TIMELINE_AGENT_SHOT_COVERAGE_MISSING',
        `EDIT_TIMELINE_AGENT_SHOT_COVERAGE_MISSING:${role}:${missingAssignedShotIds.join(',')}`,
      ))
    }
    if (missingOutputShotIds.length > 0) {
      needsReviewAgentIds.add(contribution.agentId)
      risks.push(risk(
        'EDIT_TIMELINE_AGENT_OUTPUT_COVERAGE_MISSING',
        `EDIT_TIMELINE_AGENT_OUTPUT_COVERAGE_MISSING:${role}:${missingOutputShotIds.join(',')}`,
      ))
    }
    if (missingBlackboardOutputShotIds.length > 0) {
      needsReviewAgentIds.add(contribution.agentId)
      risks.push(risk(
        'EDIT_TIMELINE_AGENT_BLACKBOARD_OUTPUT_MISSING',
        `EDIT_TIMELINE_AGENT_BLACKBOARD_OUTPUT_MISSING:${role}:${missingBlackboardOutputShotIds.join(',')}`,
      ))
    }
  }

  return {
    agentCrew: {
      ...params.agentCrew,
      director: {
        ...params.agentCrew.director,
        status: needsReviewAgentIds.has(params.agentCrew.director.agentId) ? 'needs-review' : params.agentCrew.director.status,
      },
      subagents: params.agentCrew.subagents.map((contribution) => ({
        ...contribution,
        status: needsReviewAgentIds.has(contribution.agentId) ? 'needs-review' : contribution.status,
      })),
    },
    risks,
  }
}

function buildPrompt(input: CreateEditTimelinePlanInput): string {
  const outline = input.outline?.trim()
  if (!outline) return input.goal
  return `${input.goal}\n\nOutline: ${outline}`
}

function hasChineseText(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text)
}

function includesAny(text: string, markers: readonly string[]): boolean {
  return markers.some((marker) => text.includes(marker))
}

function inferAspectRatioFromText(text: string): string | null {
  const compactText = text.replace(/\s+/g, '').toLowerCase()
  if (includesAny(compactText, ['9:16', '9：16', '竖屏', 'vertical', 'shorts', 'reels', 'tiktok'])) {
    return '9:16'
  }
  if (includesAny(compactText, ['16:9', '16：9', '横屏', 'landscape', 'youtube'])) {
    return '16:9'
  }
  if (includesAny(compactText, ['1:1', '1：1', '方形', 'square'])) {
    return '1:1'
  }
  return null
}

function inferTargetDurationMsFromText(text: string): number | null {
  const durationMatch = /(\d{1,3}(?:\.\d+)?)\s*(秒|s|sec|secs|second|seconds)/i.exec(text)
  if (!durationMatch) return null
  const seconds = Number(durationMatch[1])
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return Math.round(seconds * 1000)
}

function normalizeDurationSecondsToMs(durationSeconds: number | undefined): number | null {
  if (durationSeconds === undefined) return null
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null
  return Math.round(durationSeconds * 1000)
}

function normalizeRequestedShotCount(count: number): number | null {
  if (!Number.isInteger(count) || count < 1 || count > 6) return null
  return count
}

function inferRequestedShotCountFromText(text: string): number | null {
  const directMatch = /(\d{1,2})\s*(?:个|段|支|组)?\s*(?:镜头|shots?|panels?)/i.exec(text)
  if (directMatch?.[1]) {
    return normalizeRequestedShotCount(Number(directMatch[1]))
  }

  const reverseMatch = /(?:镜头|shots?|panels?)\s*(?:数量|数|count)?\s*[:：]?\s*(\d{1,2})/i.exec(text)
  if (reverseMatch?.[1]) {
    return normalizeRequestedShotCount(Number(reverseMatch[1]))
  }

  const zhNumeralMatch = /([一二三四五六])\s*(?:个|段|支|组)?\s*镜头/.exec(text)
  if (!zhNumeralMatch?.[1]) return null
  const zhCounts: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
  }
  return normalizeRequestedShotCount(zhCounts[zhNumeralMatch[1]] ?? 0)
}

function inferProtagonist(text: string, locale: 'zh' | 'en'): string {
  if (locale === 'zh') {
    const zhSubjectMatch = /一个([^，。,.；;\n]{1,24})/.exec(text)
    if (zhSubjectMatch?.[1]?.trim()) return zhSubjectMatch[1].trim()
    const roleMatch = /(女生|男生|女孩|男孩|学生|创作者|设计师|用户|主角)/.exec(text)
    if (roleMatch?.[1]) return roleMatch[1]
  }
  const leadingActorMatch = /^\s*(?:a|an|the)\s+([a-z][a-z\s-]{1,40}?)(?:\s+(?:finds?|discovers?|locks?|walks?|enters?|sees?|opens?|starts?|begins?|looks?|runs?|arrives?|returns?|stands?|sits?|holds?|carries?|steps?|notices?|turns?|follows?|watches?)\b|[,.])/i.exec(text)
  if (leadingActorMatch?.[1]?.trim()) return leadingActorMatch[1].trim()
  const englishSubjectMatch = /\b(?:a|an)\s+([a-z][a-z\s-]{2,40}?)(?:\s+(?:in|at|with|who|that)|[,.])/i.exec(text)
  if (englishSubjectMatch?.[1]?.trim()) return englishSubjectMatch[1].trim()
  return locale === 'zh' ? '主角' : 'lead character'
}

function inferSetting(text: string, locale: 'zh' | 'en'): string {
  if (locale === 'zh') {
    const settingMatch = /(?:在|于|发生在)([^，。,.；;\n]{2,24})/.exec(text)
    if (settingMatch?.[1]?.trim()) return settingMatch[1].trim()
    const sceneMatch = /(办公室|便利店|校园|厨房|街道|卧室|工作室|工厂|咖啡店|产品台|展厅|宇宙|城市|森林)/.exec(text)
    if (sceneMatch?.[1]) return sceneMatch[1]
  }
  const lockupSettingMatch = /\blocks? up\s+(?:a|an|the)?\s*([a-z][a-z\s-]{2,40}?)(?:[,.]|$)/i.exec(text)
  if (lockupSettingMatch?.[1]?.trim()) return lockupSettingMatch[1].trim()
  const englishSettingMatch = /\b(?:in|at|inside|into)\s+(?:a|an|the)?\s*([a-z][a-z\s-]{2,40}?)(?:\s+(?:with|where|as|and)|[,.])/i.exec(text)
  if (englishSettingMatch?.[1]?.trim()) return englishSettingMatch[1].trim()
  return locale === 'zh' ? '故事主要场景' : 'primary story location'
}

function inferMood(text: string, locale: 'zh' | 'en'): string {
  if (locale === 'zh') {
    const transitionMatch = /前半段([^，。,.；;\n]{1,18})，?后半段([^，。,.；;\n]{1,18})/.exec(text)
    if (transitionMatch?.[1] && transitionMatch[2]) return `${transitionMatch[1].trim()}到${transitionMatch[2].trim()}`
    const styleMatch = /(压抑|明亮|干净|悬疑|温暖|治愈|紧张|轻松|科幻|抽象|高级|真实|梦幻)/g
    const styles = Array.from(text.matchAll(styleMatch), (match) => match[1]).filter(Boolean)
    if (styles.length > 0) return Array.from(new Set(styles)).slice(0, 3).join('、')
  }
  const lower = text.toLowerCase()
  if (includesAny(lower, ['suspense', 'twist', 'thriller'])) return 'suspense progression'
  if (includesAny(lower, ['bright', 'clean', 'warm', 'cinematic', 'minimal'])) return 'described visual mood'
  return locale === 'zh' ? '剧情推进' : 'visible story progression'
}

function inferTwist(text: string, locale: 'zh' | 'en'): string {
  if (locale === 'zh') {
    const finalMatch = /(?:最后|结尾|最终)([^。,.；;\n]{2,32})/.exec(text)
    if (finalMatch?.[1]?.trim()) return finalMatch[1].trim()
    if (text.includes('反转')) return '结尾反转'
  }
  if (includesAny(text.toLowerCase(), ['future', 'twist', 'reveal'])) return 'the ending reveals the requested turn'
  return locale === 'zh' ? '按用户描述完成结尾落点' : 'final visible turn'
}

function inferTheme(text: string, locale: 'zh' | 'en'): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.slice(0, locale === 'zh' ? 24 : 48) || (locale === 'zh' ? '短剧故事' : 'short drama story')
}

function buildCreativeBrief(
  input: CreateEditTimelinePlanInput,
  params: {
    aspectRatio: string
    durationMs: number
    aspectRatioWasProvided: boolean
    durationWasProvided: boolean
    fpsWasProvided: boolean
  },
): CreativeBrief {
  const sourceText = buildPrompt(input)
  const locale = hasChineseText(sourceText) ? 'zh' : 'en'
  const assumptions: string[] = [
    locale === 'zh'
      ? 'Project Agent 将自然语言需求拆成可执行镜头，并分发给剧本、摄影、连续性、提示词、声音 Agent。'
      : 'The Project Agent will split the natural-language request into executable shots and dispatch screenplay, cinematography, continuity, prompt, and sound agents.',
  ]
  const missingInfo: string[] = []

  if (!params.aspectRatioWasProvided) {
    assumptions.push(locale === 'zh'
      ? `未指定画幅，规划阶段按 ${params.aspectRatio} 处理。`
      : `No aspect ratio was specified; planning uses ${params.aspectRatio}.`)
  }
  if (!params.durationWasProvided) {
    assumptions.push(locale === 'zh'
      ? `未指定目标时长，规划阶段按 ${String(params.durationMs / 1000)} 秒处理。`
      : `No target duration was specified; planning uses ${String(params.durationMs / 1000)} seconds.`)
  }
  if (!params.fpsWasProvided) {
    assumptions.push(locale === 'zh'
      ? '未指定帧率，规划阶段按 24 fps 处理。'
      : 'No frame rate was specified; planning uses 24 fps.')
  }
  if (!input.references || input.references.length === 0) {
    missingInfo.push(locale === 'zh'
      ? '缺少角色或场景参考素材；真实生成前需要用户确认是否仅使用文字提示。'
      : 'Character or location references are missing; real generation needs confirmation before using text-only prompts.')
  }

  return {
    theme: inferTheme(sourceText, locale),
    protagonist: inferProtagonist(sourceText, locale),
    setting: inferSetting(sourceText, locale),
    mood: inferMood(sourceText, locale),
    twist: inferTwist(sourceText, locale),
    targetDurationMs: params.durationMs,
    aspectRatio: params.aspectRatio,
    missingInfo,
    assumptions,
  }
}

function allocateDurations(totalDurationMs: number, count: number): number[] {
  if (count === 4) {
    const first = Math.floor(totalDurationMs * 0.2)
    const second = Math.floor(totalDurationMs * 0.2)
    const third = Math.floor(totalDurationMs * 0.2666666667)
    return [
      first,
      second,
      third,
      totalDurationMs - first - second - third,
    ]
  }
  const base = Math.floor(totalDurationMs / count)
  const durations = Array.from({ length: count }, () => base)
  const remainder = totalDurationMs - (base * count)
  if (remainder > 0) {
    durations[durations.length - 1] += remainder
  }
  return durations
}

function isInstructionLikeBeat(text: string): boolean {
  const lower = text.toLowerCase()
  return includesAny(lower, [
    'create_edit_timeline_plan',
    'edittimelineblackboard',
    'planrun',
    'provider',
    'subagent',
    'final.video',
    'silent video',
    'load_skill',
    'invoke_operation',
    '请做成',
    '请使用',
    '必须',
    '不要',
    '至少',
    '无声音',
    '无字幕',
  ])
}

function mergeShortIntroBeat(beats: readonly string[], locale: 'zh' | 'en'): string[] {
  if (beats.length < 2) return [...beats]
  const minLength = locale === 'zh' ? 8 : 20
  const first = beats[0]
  const second = beats[1]
  if (first.length >= minLength) return [...beats]
  return [`${first}${locale === 'zh' ? '：' : ': '}${second}`, ...beats.slice(2)]
}

function extractNarrativeBeatsFromText(text: string, locale: 'zh' | 'en'): string[] {
  const sentenceSplitPattern = locale === 'zh'
    ? /[。！？!?；;\n]+/
    : /(?<!\d)[.!?]+(?!\d)|[；;\n]+/
  const candidates = text
    .split(sentenceSplitPattern)
    .map((beat) => beat.trim())
    .filter((beat) => beat.length > 0)
    .filter((beat) => !isInstructionLikeBeat(beat))
    .slice(0, 8)

  return mergeShortIntroBeat(candidates, locale)
}

function selectBeatCount(beats: readonly string[], count: number): string[] {
  if (beats.length <= count) return [...beats]
  if (count === 1) return [beats[0]]
  const selected: string[] = []
  const seenIndexes = new Set<number>()
  for (let index = 0; index < count; index += 1) {
    const beatIndex = index === count - 1
      ? beats.length - 1
      : Math.floor((index * (beats.length - 1)) / (count - 1))
    if (seenIndexes.has(beatIndex)) continue
    seenIndexes.add(beatIndex)
    selected.push(beats[beatIndex])
  }
  return selected
}

function fillBeatCount(beats: readonly string[], fallbackBeats: readonly string[], count: number): string[] {
  if (beats.length >= count) return [...beats]
  const output = [...beats]
  for (const fallbackBeat of fallbackBeats) {
    if (output.length >= count) break
    if (output.includes(fallbackBeat)) continue
    output.push(fallbackBeat)
  }
  return output
}

function buildStoryBeatTemplates(params: {
  input: CreateEditTimelinePlanInput
  brief: CreativeBrief
  aspectRatio: string
}): Array<{
  segmentId: string
  shotId: string
  label: string
  title: string
  goal: string
  visual: string
  story: string
  sound: string
  caption: string
  prompt: string
}> {
  const sourceText = buildPrompt(params.input)
  const locale = hasChineseText(sourceText) ? 'zh' : 'en'
  const requestedShotCount = params.input.shotCount ?? inferRequestedShotCountFromText(sourceText)
  const mediaConstraints = [
    params.input.style ? (locale === 'zh' ? `视觉风格：${params.input.style}` : `visual style: ${params.input.style}`) : null,
    params.input.hasAudio === false ? (locale === 'zh' ? 'silent video, no voiceover, music, or generated audio' : 'silent video, no voiceover, music, or generated audio') : null,
    params.input.hasSubtitle === false ? (locale === 'zh' ? 'no subtitles or burned-in text' : 'no subtitles or burned-in text') : null,
  ].filter((constraint): constraint is string => constraint !== null)
  const mediaConstraintText = mediaConstraints.join(locale === 'zh' ? '；' : '; ')
  const outlineBeats = (params.input.outline ?? '')
    .split(/[；;\n]+/)
    .map((beat) => beat.replace(/^\s*\d+(?:\.\d+)?\s*[-~至到]\s*\d+(?:\.\d+)?\s*(?:s|秒)?\s*/i, '').trim())
    .filter((beat) => beat.length > 0)
    .slice(0, 6)
  const defaultBeats = locale === 'zh'
    ? [
        `起始动作：${params.brief.protagonist}在${params.brief.setting}里完成第一个可见动作`,
        `关键变化：${params.brief.protagonist}围绕核心物件或线索做出明确互动`,
        `收束画面：${params.brief.twist}`,
      ]
    : [
        `Opening action: ${params.brief.protagonist} performs the first visible action in ${params.brief.setting}`,
        `Key change: ${params.brief.protagonist} interacts with the central object or clue in ${params.brief.setting}`,
        `Closing image: ${params.brief.twist}`,
      ]
  const narrativeBeats = extractNarrativeBeatsFromText(sourceText, locale)
  const beatSource = outlineBeats.length > 0
    ? outlineBeats
    : (narrativeBeats.length > 0 ? narrativeBeats : defaultBeats)
  const targetBeatCount = outlineBeats.length > 0
    ? outlineBeats.length
    : (requestedShotCount ?? Math.min(6, Math.max(3, beatSource.length)))
  const beats = outlineBeats.length > 0
    ? beatSource
    : fillBeatCount(selectBeatCount(beatSource, targetBeatCount), defaultBeats, targetBeatCount)

  return beats.map((beat, index) => {
    const ordinal = index + 1
    const label = locale === 'zh' ? `镜头 ${String(ordinal)}` : `Shot ${String(ordinal)}`
    const title = beat.slice(0, locale === 'zh' ? 18 : 42) || label
    const segmentId = `seg-${String(ordinal).padStart(2, '0')}`
    const shotId = `shot-${String(ordinal).padStart(2, '0')}`
    const visual = locale === 'zh'
      ? `构图呈现“${beat}”。画面中必须清楚看到${params.brief.protagonist}、${params.brief.setting}和一个可执行动作，使用${params.aspectRatio}稳定构图。`
      : `Frame "${beat}". Keep ${params.brief.protagonist} visible in ${params.brief.setting}, with one clear physical action in stable ${params.aspectRatio} framing.`
    const story = locale === 'zh'
      ? `${beat}。承接上一段动作，并为下一段留下清楚的动作钩子。`
      : `${beat}. Connect from the previous action and leave a clear physical hook for the next segment.`
    const sound = params.input.hasAudio === false
      ? 'silent video, no voiceover, music, or generated audio'
      : (locale === 'zh'
          ? `声音围绕“${beat}”设计环境声、节奏和情绪变化，不替代画面信息。`
          : `Sound supports "${beat}" with ambience, pacing, and mood changes without replacing visual information.`)
    const caption = params.input.hasSubtitle === false
      ? 'no subtitles or burned-in text'
      : (locale === 'zh'
          ? beat.replace(/^.+?[：:]/, '').trim().slice(0, 28) || `第 ${String(ordinal)} 个画面`
          : beat.replace(/^.+?:/, '').trim().slice(0, 64) || `Shot ${String(ordinal)}`)
    const prompt = locale === 'zh'
      ? `${params.aspectRatio}视频镜头。时间块动作：${beat}。主体：${params.brief.protagonist}。场景：${params.brief.setting}。要求：主体清楚、单一动作、前后场景连续、适合真实视频生成。${mediaConstraintText ? `约束：${mediaConstraintText}。` : ''}`
      : `${params.aspectRatio} video shot. Segment action: ${beat}. Subject: ${params.brief.protagonist}. Setting: ${params.brief.setting}. Requirements: visible subject, one physical action, continuous setting, suitable for real video generation.${mediaConstraintText ? ` Constraints: ${mediaConstraintText}.` : ''}`

    return {
      segmentId,
      shotId,
      label,
      title,
      goal: beat,
      visual,
      story,
      sound,
      caption,
      prompt,
    }
  })
}

function buildDraftTimeline(input: CreateEditTimelinePlanInput): {
  timeline: EditTimeline
  creativeBrief: CreativeBrief
  agentCrew: EditTimelineAgentCrew
  blackboard: EditTimelineBlackboard
  risks: EditTimelineRisk[]
} {
  const risks: EditTimelineRisk[] = []
  const sourceText = buildPrompt(input)
  const locale = hasChineseText(sourceText) ? 'zh' : 'en'
  const inferredAspectRatio = inferAspectRatioFromText(sourceText)
  const inferredDurationMs = inferTargetDurationMsFromText(sourceText)
  const durationInputMs = normalizeDurationSecondsToMs(input.duration)
  const aspectRatio = input.aspectRatio ?? inferredAspectRatio ?? '9:16'
  const fps = input.fps ?? 24
  const durationMs = input.targetDurationMs ?? durationInputMs ?? inferredDurationMs ?? 15_000
  const aspectRatioWasProvided = input.aspectRatio !== undefined || inferredAspectRatio !== null
  const durationWasProvided = input.targetDurationMs !== undefined || durationInputMs !== null || inferredDurationMs !== null

  if (!aspectRatioWasProvided) {
    risks.push(risk(
      'EDIT_TIMELINE_ASSUMED_ASPECT_RATIO',
      'No aspect ratio was provided; the draft marks 9:16 as an explicit planning assumption.',
    ))
  }
  if (!durationWasProvided) {
    risks.push(risk(
      'EDIT_TIMELINE_ASSUMED_DURATION',
      'No target duration was provided; the draft marks 15 seconds as an explicit planning assumption.',
    ))
  }

  const referenceIds = (input.references ?? []).map((reference) => reference.id)
  const creativeBrief = buildCreativeBrief(input, {
    aspectRatio,
    durationMs,
    aspectRatioWasProvided,
    durationWasProvided,
    fpsWasProvided: input.fps !== undefined,
  })
  const beatTemplates = buildStoryBeatTemplates({
    input,
    brief: creativeBrief,
    aspectRatio,
  })
  const durations = allocateDurations(durationMs, beatTemplates.length)
  let cursorMs = 0
  const segments: EditTimeline['segments'] = []
  const shots: EditTimeline['shots'] = []
  const visualLabel = locale === 'zh' ? '画面' : 'Visual'
  const storyLabel = locale === 'zh' ? '剧情' : 'Story'
  const soundLabel = locale === 'zh' ? '声音' : 'Sound'
  const captionLabel = locale === 'zh' ? '字幕' : 'Caption'

  beatTemplates.forEach((beat, index) => {
    const beatDurationMs = durations[index]
    const dependsOn = index === 0 ? [] : [beatTemplates[index - 1].shotId]
    segments.push({
      id: beat.segmentId,
      label: beat.label,
      startMs: cursorMs,
      durationMs: beatDurationMs,
      intent: beat.goal,
      shotIds: [beat.shotId],
    })
    shots.push({
      id: beat.shotId,
      segmentId: beat.segmentId,
      title: beat.title,
      goal: beat.goal,
      track: 'video',
      order: index + 1,
      startMs: cursorMs,
      durationMs: beatDurationMs,
      dependsOn,
      inputArtifacts: [],
      outputArtifacts: [],
      referenceIds,
      editorial: {
        visual: beat.visual,
        story: beat.story,
        sound: beat.sound,
        caption: beat.caption,
      },
      control: {
        prompt: `${beat.prompt}\n${visualLabel}: ${beat.visual}\n${storyLabel}: ${beat.story}\n${soundLabel}: ${beat.sound}\n${captionLabel}: ${beat.caption}`,
        durationSeconds: Number((beatDurationMs / 1000).toFixed(3)),
        aspectRatio,
        referenceImageRefs: [],
        characterRefIds: referenceIds,
        performanceRefIds: [],
      },
    })
    cursorMs += beatDurationMs
  })

  const timeline: EditTimeline = {
    id: input.timelineId ?? `edit_timeline_${crypto.randomUUID()}`,
    title: input.title ?? input.goal.slice(0, 80),
    aspectRatio,
    fps,
    segments,
    shots,
    references: input.references ?? [],
    continuityBible: input.continuityBible ?? {},
    evalRubric: {
      objective: input.goal,
      dimensions: [
        'timeline structure matches the requested duration',
        'shot references are explicit and resolvable',
        'visual continuity can be checked at shot level',
      ],
    },
  }

  const parsedTimeline = parseEditTimeline(timeline)
  const blackboard = buildEditTimelineBlackboard({
    timeline: parsedTimeline,
    sourceStory: sourceText,
    creativeBrief,
    risks,
  })
  const agentCrewReview = reviewAgentCrewCoverage({
    agentCrew: buildAgentCrewFromBlackboard({
      timeline: parsedTimeline,
      blackboard,
      sourceText,
      creativeBrief,
    }),
    timeline: parsedTimeline,
    blackboard,
  })
  const reviewedRisks = [...risks, ...agentCrewReview.risks]

  return {
    timeline: parsedTimeline,
    creativeBrief,
    agentCrew: agentCrewReview.agentCrew,
    blackboard,
    risks: reviewedRisks,
  }
}

function formatAgentCrewSeconds(ms: number): string {
  const seconds = ms / 1000
  return Number.isInteger(seconds) ? `${String(seconds)}s` : `${seconds.toFixed(1)}s`
}

function segmentByShotId(segments: readonly EditTimelineSegmentBlackboard[]): Map<string, EditTimelineSegmentBlackboard> {
  const result = new Map<string, EditTimelineSegmentBlackboard>()
  for (const segment of segments) {
    for (const shotId of segment.shotIds) {
      result.set(shotId, segment)
    }
  }
  return result
}

function buildBlackboardAgentOutputs(params: {
  timeline: ParsedEditTimeline
  segmentsByShotId: ReadonlyMap<string, EditTimelineSegmentBlackboard>
  selectText: (segment: EditTimelineSegmentBlackboard, shot: ShotNode) => string
}): EditTimelineAgentContribution['outputs'] {
  return params.timeline.shots.map((shot) => {
    const segment = params.segmentsByShotId.get(shot.id)
    return {
      shotId: shot.id,
      text: segment ? params.selectText(segment, shot).trim() : shot.goal,
    }
  })
}

function firstOutputText(outputs: readonly { text: string }[], fallback: string): string {
  return outputs.find((output) => output.text.trim().length > 0)?.text ?? fallback
}

function buildAgentCrewFromBlackboard(params: {
  timeline: ParsedEditTimeline
  blackboard: EditTimelineBlackboard
  sourceText: string
  creativeBrief: CreativeBrief
}): EditTimelineAgentCrew {
  const locale = hasChineseText(params.sourceText) ? 'zh' : 'en'
  const shotIds = params.timeline.shots.map((shot) => shot.id)
  const timelineRange = locale === 'zh'
    ? `${String(Math.round(params.creativeBrief.targetDurationMs / 1000))} 秒`
    : `${String(Math.round(params.creativeBrief.targetDurationMs / 1000))} seconds`
  const segmentsByShot = segmentByShotId(params.blackboard.segmentBlackboards)
  const timelineSegmentsById = new Map(params.timeline.segments.map((segment) => [segment.id, segment] as const))

  const directorOutputs = params.blackboard.macroScript.map((segment) => ({
    shotId: timelineSegmentsById.get(segment.segmentId)?.shotIds[0] ?? segment.segmentId,
    text: locale === 'zh'
      ? `${formatAgentCrewSeconds(segment.startMs)}-${formatAgentCrewSeconds(segment.endMs)}：${segment.storyFunction}，${segment.beatGoal}`
      : `${formatAgentCrewSeconds(segment.startMs)}-${formatAgentCrewSeconds(segment.endMs)}: ${segment.storyFunction}, ${segment.beatGoal}`,
  }))
  const screenplayOutputs = buildBlackboardAgentOutputs({
    timeline: params.timeline,
    segmentsByShotId: segmentsByShot,
    selectText: (segment) => segment.screenplay.visibleAction,
  })
  const cinematographyOutputs = buildBlackboardAgentOutputs({
    timeline: params.timeline,
    segmentsByShotId: segmentsByShot,
    selectText: (segment) => [
      segment.cinematography.camera,
      segment.cinematography.motion,
      segment.cinematography.composition,
      segment.cinematography.lighting,
    ].join(' · '),
  })
  const continuityOutputs = buildBlackboardAgentOutputs({
    timeline: params.timeline,
    segmentsByShotId: segmentsByShot,
    selectText: (segment) => [
      segment.continuity.characterContinuity,
      segment.continuity.locationContinuity,
      segment.continuity.propContinuity,
      segment.continuity.styleContinuity,
    ].join(' · '),
  })
  const soundOutputs = buildBlackboardAgentOutputs({
    timeline: params.timeline,
    segmentsByShotId: segmentsByShot,
    selectText: (segment) => segment.soundPlan.cues.join(' / '),
  })
  const promptOutputs = buildBlackboardAgentOutputs({
    timeline: params.timeline,
    segmentsByShotId: segmentsByShot,
    selectText: (segment) => segment.promptPackage.providerPrompt,
  })

  const director: EditTimelineAgentContribution = {
    agentId: 'main-director',
    role: 'main-director',
    title: locale === 'zh' ? '主导演 Agent' : 'Main Director Agent',
    mission: locale === 'zh'
      ? '只负责时间线切分、节奏、镜头目标和依赖图，所有专业产物从 blackboard 派生。'
      : 'Own the timeline split, pacing, shot goals, and dependency graph, with specialist outputs projected from the blackboard.',
    summary: locale === 'zh'
      ? `主导演从 Macro Script 派生 ${String(params.blackboard.macroScript.length)} 个段落、${String(shotIds.length)} 个镜头，目标时长 ${timelineRange}。`
      : `The main director projected ${String(params.blackboard.macroScript.length)} macro segments and ${String(shotIds.length)} shots from the blackboard for a ${timelineRange} timeline.`,
    shotIds,
    outputs: directorOutputs,
    status: 'drafted',
  }

  return {
    director,
    subagents: [
      {
        agentId: 'screenplay-agent',
        role: 'screenplay-agent',
        title: locale === 'zh' ? '剧本 Agent' : 'Screenplay Agent',
        mission: locale === 'zh'
          ? '内容来自 blackboard.screenplay.visibleAction，只负责可见动作。'
          : 'Projected from blackboard.screenplay.visibleAction and owns visible action only.',
        summary: locale === 'zh'
          ? `剧本 Agent 已从黑板投影 ${String(screenplayOutputs.length)} 条可见动作，首条为：${firstOutputText(screenplayOutputs, params.creativeBrief.mood)}`
          : `The screenplay agent projected ${String(screenplayOutputs.length)} visible actions from the blackboard, starting with: ${firstOutputText(screenplayOutputs, params.creativeBrief.mood)}.`,
        shotIds,
        outputs: screenplayOutputs,
        status: 'drafted',
      },
      {
        agentId: 'cinematography-agent',
        role: 'cinematography-agent',
        title: locale === 'zh' ? '摄影 Agent' : 'Cinematography Agent',
        mission: locale === 'zh'
          ? '内容来自 blackboard.cinematography，只负责机位、构图、运镜和灯光。'
          : 'Projected from blackboard.cinematography and owns camera, composition, motion, and lighting.',
        summary: locale === 'zh'
          ? `摄影 Agent 已从黑板投影 ${String(cinematographyOutputs.length)} 条镜头语言，首条为：${firstOutputText(cinematographyOutputs, params.creativeBrief.setting)}`
          : `The cinematography agent projected ${String(cinematographyOutputs.length)} camera plans from the blackboard, starting with: ${firstOutputText(cinematographyOutputs, params.creativeBrief.setting)}.`,
        shotIds,
        outputs: cinematographyOutputs,
        status: 'drafted',
      },
      {
        agentId: 'continuity-agent',
        role: 'continuity-agent',
        title: locale === 'zh' ? '连续性 Agent' : 'Continuity Agent',
        mission: locale === 'zh'
          ? '内容来自 blackboard.continuity，只负责角色、地点、道具和风格锚点。'
          : 'Projected from blackboard.continuity and owns character, location, prop, and style anchors.',
        summary: locale === 'zh'
          ? `连续性 Agent 已从黑板投影 ${String(continuityOutputs.length)} 条连续性锚点，首条为：${firstOutputText(continuityOutputs, params.creativeBrief.protagonist)}`
          : `The continuity agent projected ${String(continuityOutputs.length)} continuity anchors from the blackboard, starting with: ${firstOutputText(continuityOutputs, params.creativeBrief.protagonist)}.`,
        shotIds,
        outputs: continuityOutputs,
        status: 'drafted',
      },
      {
        agentId: 'prompt-engineer-agent',
        role: 'prompt-engineer-agent',
        title: locale === 'zh' ? '提示词 Agent' : 'Prompt Engineer Agent',
        mission: locale === 'zh'
          ? '内容来自 blackboard.promptPackage.providerPrompt，是 provider prompt 的唯一 UI 投影。'
          : 'Projected from blackboard.promptPackage.providerPrompt and is the sole UI projection of provider prompts.',
        summary: locale === 'zh'
          ? `提示词 Agent 已从黑板投影 ${String(promptOutputs.length)} 条 providerPrompt，首条为：${firstOutputText(promptOutputs, params.creativeBrief.twist)}`
          : `The prompt engineer projected ${String(promptOutputs.length)} provider prompts from the blackboard, starting with: ${firstOutputText(promptOutputs, params.creativeBrief.twist)}.`,
        shotIds,
        outputs: promptOutputs,
        status: 'drafted',
      },
      {
        agentId: 'sound-agent',
        role: 'sound-agent',
        title: locale === 'zh' ? '声音 Agent' : 'Sound Agent',
        mission: locale === 'zh'
          ? '内容来自 blackboard.soundPlan，v1 只记录非阻塞声音计划。'
          : 'Projected from blackboard.soundPlan and records non-blocking sound plans for v1.',
        summary: locale === 'zh'
          ? `声音 Agent 已从黑板记录非阻塞声音计划：${soundOutputs.map((output) => output.text).slice(0, 2).join(' / ')}。`
          : `The sound agent projected non-blocking sound plans from the blackboard: ${soundOutputs.map((output) => output.text).slice(0, 2).join(' / ')}.`,
        shotIds,
        outputs: soundOutputs,
        status: 'drafted',
      },
    ],
    synthesis: locale === 'zh'
      ? `agentCrew 是 blackboard 的 UI 兼容投影；真实源为 ${String(params.blackboard.segmentBlackboards.length)} 个 Segment Blackboard 和 ${String(params.blackboard.shots.length)} 个 providerPrompt。`
      : `agentCrew is a UI compatibility projection of the blackboard; the source of truth is ${String(params.blackboard.segmentBlackboards.length)} Segment Blackboards and ${String(params.blackboard.shots.length)} provider prompts.`,
  }
}

function classifyProjectAgentWorkflowIntent(text: string): ProjectAgentWorkflowSnapshot['intent'] {
  const compact = text.toLowerCase()
  if (includesAny(compact, ['失败', '恢复', '报错', 'debug', 'recover', 'fix failed'])) return 'failure-recovery'
  if (includesAny(compact, ['继续', '已有项目', '当前项目', 'continue', 'existing project'])) return 'continue-project'
  if (includesAny(compact, ['分镜', 'storyboard'])) return 'storyboard-generation'
  if (includesAny(compact, ['视频', '短片', '动画', 'film', 'video', 'animation'])) return 'video-generation'
  if (includesAny(compact, ['素材', '资产', '角色', '场景', 'asset', 'character', 'scene'])) return 'asset-planning'
  if (includesAny(compact, ['字幕', '配音', '声音', '音效', 'voice', 'subtitle', 'caption', 'sound'])) return 'voice-subtitle'
  if (includesAny(compact, ['故事', '剧情', 'story', 'script'])) return 'story-generation'
  return 'edit-timeline'
}

function resolveProjectAgentWorkflowIntent(params: {
  goalText: string
  materializeOperationId?: string
}): ProjectAgentWorkflowSnapshot['intent'] {
  if (params.materializeOperationId === 'generate_panel_video') return 'video-generation'
  return classifyProjectAgentWorkflowIntent(params.goalText)
}

function workflowAssetKind(kind: ParsedEditTimeline['references'][number]['kind']): ProjectAgentWorkflowSnapshot['assets'][number]['kind'] {
  if (kind === 'first_frame' || kind === 'last_frame') return 'source-frame'
  if (kind === 'performance') return 'reference'
  return kind
}

function buildWorkflowAssets(timeline: ParsedEditTimeline): ProjectAgentWorkflowSnapshot['assets'] {
  if (timeline.references.length === 0) {
    return [{
      id: 'asset-text-only-brief',
      kind: 'style',
      label: 'Text-only creative brief',
      status: 'planned',
      source: 'text-only',
      artifactRef: null,
    }]
  }
  return timeline.references.map((reference) => ({
    id: reference.id,
    kind: workflowAssetKind(reference.kind),
    label: reference.label,
    status: reference.artifactRef.trim() ? 'available' : 'missing',
    source: 'user-reference',
    artifactRef: reference.artifactRef,
  }))
}

function providerAssetPolicyForShot(shot: ShotNode): ProjectAgentWorkflowSnapshot['providerTasks'][number]['assetPolicy'] {
  if (shot.control.firstFrameRef && shot.control.lastFrameRef) return 'first-last-frame'
  if (shot.control.firstFrameRef || shot.control.lastFrameRef || shot.control.referenceImageRefs.length > 0) return 'image-to-video'
  return 'text-to-video'
}

function workflowStatusFromBlackboardProviderStatus(
  status: EditTimelineBlackboard['shots'][number]['providerTask']['status'],
): ProjectAgentWorkflowStatus {
  if (status === 'succeeded') return 'succeeded'
  if (status === 'failed') return 'failed'
  if (status === 'blocked') return 'blocked'
  if (status === 'running') return 'running'
  if (status === 'submitted') return 'submitted'
  return 'planned'
}

function workflowStatusFromBlackboardProviderTask(
  task: EditTimelineBlackboard['shots'][number]['providerTask'],
): ProjectAgentWorkflowStatus {
  if (task.status === 'succeeded' && !task.outputUrl) return 'running'
  if ((task.status === 'submitted' || task.status === 'running') && !task.taskId) return 'planned'
  return workflowStatusFromBlackboardProviderStatus(task.status)
}

function isFinalVideoWorkflowRef(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return normalized.endsWith('.mp4')
    || normalized.includes('final-video')
    || normalized.includes('final-videos/')
    || normalized.includes('/video-editor/')
}

function finalVideoArtifactProjection(blackboard?: EditTimelineBlackboard): {
  status: ProjectAgentWorkflowStatus
  ref: string | null
} {
  if (!blackboard) return { status: 'planned', ref: null }
  const ref = blackboard.finalCritic.evidenceRefs.find(isFinalVideoWorkflowRef) ?? null
  if (blackboard.finalCritic.status === 'scored' && ref) {
    return { status: 'succeeded', ref }
  }
  if (blackboard.finalCritic.status === 'blocked') {
    return { status: 'blocked', ref }
  }
  return { status: 'planned', ref }
}

function buildProviderTaskTarget(params: {
  shot: ShotNode
  orderedShotIndex: number
  panelIdsByShotId?: Readonly<Record<string, string>>
  storyboardId?: string
  startPanelIndex?: number
}): ProjectAgentWorkflowSnapshot['providerTasks'][number]['target'] {
  const panelId = params.panelIdsByShotId?.[params.shot.id]
  if (panelId) return { panelId }
  if (params.storyboardId && params.startPanelIndex !== undefined) {
    return {
      storyboardId: params.storyboardId,
      panelIndex: params.startPanelIndex + params.orderedShotIndex,
    }
  }
  return null
}

function buildWorkflowEval(params: {
  timeline: ParsedEditTimeline
  agentCrew?: EditTimelineAgentCrew
  blackboard?: EditTimelineBlackboard
  risks: readonly EditTimelineRisk[]
}): ProjectAgentWorkflowSnapshot['evals'] {
  const shotIds = params.timeline.shots.map((shot) => shot.id)
  const subagentRoles = new Set(params.agentCrew?.subagents.map((agent) => agent.role) ?? [])
  const missingRoles = REQUIRED_SUBAGENT_ROLES.filter((role) => !subagentRoles.has(role))
  const requiredBlackboardRoles = [
    'main-director',
    'screenplay-agent',
    'cinematography-agent',
    'continuity-agent',
    'prompt-engineer-agent',
    'sound-agent',
    'provider-production-agent',
    'film-critic-agent',
  ] as const
  const blackboardRoles = new Set(params.blackboard?.agents.map((agent) => agent.role) ?? [])
  const missingBlackboardRoles = params.blackboard
    ? requiredBlackboardRoles.filter((role) => !blackboardRoles.has(role))
    : []
  const missingPromptPackageShotIds = params.blackboard
    ? shotIds.filter((shotId) => !params.blackboard?.shots.some((shot) => (
      shot.shotId === shotId
      && shot.promptPackage.providerPrompt.trim().length > 0
      && shot.ownerAgentId.trim().length > 0
    )))
    : []
  const missingMacroSegmentIds = params.blackboard
    ? params.timeline.segments
      .filter((segment) => !params.blackboard?.macroScript.some((macroSegment) => macroSegment.segmentId === segment.id))
      .map((segment) => segment.id)
    : []
  const missingSegmentBlackboardIds = params.blackboard
    ? params.timeline.segments
      .filter((segment) => !params.blackboard?.segmentBlackboards.some((segmentBlackboard) => segmentBlackboard.segmentId === segment.id))
      .map((segment) => segment.id)
    : []
  const missingSegmentAgentSlots = params.blackboard
    ? params.blackboard.segmentBlackboards.flatMap((segment) => {
      const roles = new Set(segment.agentStates.map((agent) => agent.role))
      return requiredBlackboardRoles
        .filter((role) => role !== 'main-director')
        .filter((role) => !roles.has(role))
        .map((role) => `${segment.segmentId}:${role}`)
    })
    : []
  const missingOutputBindings = params.agentCrew?.subagents.flatMap((agent) => {
    const outputShotIds = new Set(agent.outputs.map((output) => output.shotId))
    return shotIds.filter((shotId) => !outputShotIds.has(shotId)).map((shotId) => `${agent.role}:${shotId}`)
  }) ?? []
  return [{
    id: 'workflow-coverage',
    checks: [
      {
        code: 'required-subagents-present',
        status: missingRoles.length === 0 ? 'passed' : 'blocked',
        message: missingRoles.length === 0
          ? 'All required subagent roles are present.'
          : `Missing subagent roles: ${missingRoles.join(',')}`,
      },
      {
        code: 'shot-output-binding',
        status: missingOutputBindings.length === 0 ? 'passed' : 'blocked',
        message: missingOutputBindings.length === 0
          ? 'Subagent outputs are bound to timeline shotIds.'
          : `Missing shot output bindings: ${missingOutputBindings.join(',')}`,
      },
      {
        code: 'risk-review',
        status: params.risks.length === 0 ? 'passed' : 'warning',
        message: params.risks.length === 0
          ? 'No unresolved workflow risks were reported.'
          : `Workflow risks: ${params.risks.map((item) => item.code).join(',')}`,
      },
      {
        code: 'blackboard-required-roles',
        status: !params.blackboard || missingBlackboardRoles.length === 0 ? 'passed' : 'blocked',
        message: !params.blackboard
          ? 'No blackboard is attached to this workflow snapshot.'
          : missingBlackboardRoles.length === 0
            ? 'All required blackboard subagent roles are present.'
            : `Missing blackboard roles: ${missingBlackboardRoles.join(',')}`,
      },
      {
        code: 'blackboard-shot-prompt-packages',
        status: !params.blackboard || missingPromptPackageShotIds.length === 0 ? 'passed' : 'blocked',
        message: !params.blackboard
          ? 'No blackboard prompt package check was required for this snapshot.'
          : missingPromptPackageShotIds.length === 0
            ? 'Every timeline shot has a blackboard prompt package and owner.'
            : `Missing blackboard prompt packages: ${missingPromptPackageShotIds.join(',')}`,
      },
      {
        code: 'blackboard-macro-script-segments',
        status: !params.blackboard || missingMacroSegmentIds.length === 0 ? 'passed' : 'blocked',
        message: !params.blackboard
          ? 'No blackboard macro script check was required for this snapshot.'
          : missingMacroSegmentIds.length === 0
            ? 'Every timeline segment has a Main Director macro script entry.'
            : `Missing blackboard macro script segments: ${missingMacroSegmentIds.join(',')}`,
      },
      {
        code: 'blackboard-segment-agent-states',
        status: !params.blackboard || (missingSegmentBlackboardIds.length === 0 && missingSegmentAgentSlots.length === 0) ? 'passed' : 'blocked',
        message: !params.blackboard
          ? 'No segment blackboard check was required for this snapshot.'
          : missingSegmentBlackboardIds.length === 0 && missingSegmentAgentSlots.length === 0
            ? 'Every timeline segment has a segment blackboard and specialist agent states.'
            : `Missing segment blackboard coverage: ${[...missingSegmentBlackboardIds, ...missingSegmentAgentSlots].join(',')}`,
      },
    ],
  }]
}

function buildProjectAgentWorkflowSnapshot(params: {
  goalText: string
  timeline: ParsedEditTimeline
  agentCrew?: EditTimelineAgentCrew
  blackboard?: EditTimelineBlackboard
  risks: readonly EditTimelineRisk[]
  materializeSkillId?: string
  materializeOperationId?: string
  videoModel?: string
  generationOptions?: ProjectAgentWorkflowSnapshot['providerTasks'][number]['generationOptions']
  panelIdsByShotId?: Readonly<Record<string, string>>
  storyboardId?: string
  startPanelIndex?: number
  planRunRef?: string | null
  includeFinalVideoArtifact?: boolean
}): ProjectAgentWorkflowSnapshot {
  const orderedShots = [...params.timeline.shots].sort((left, right) => {
    if (left.startMs !== right.startMs) return left.startMs - right.startMs
    if (left.order !== right.order) return left.order - right.order
    return left.id.localeCompare(right.id)
  })
  const materializeSkillId = params.materializeSkillId ?? 'edit-first-video-director'
  const materializeOperationId = params.materializeOperationId ?? 'generate_panel_video'
  const skillIds = Array.from(new Set(['edit-first-video-director', materializeSkillId]))
  const blackboardShotsById = new Map((params.blackboard?.shots ?? []).map((shot) => [shot.shotId, shot] as const))
  const finalVideoArtifact = finalVideoArtifactProjection(params.blackboard)

  return {
    intent: resolveProjectAgentWorkflowIntent({
      goalText: params.goalText,
      materializeOperationId: params.materializeOperationId,
    }),
    skillIds,
    timelineId: params.timeline.id,
    ...(params.blackboard ? { blackboard: params.blackboard } : {}),
    shots: orderedShots.map((shot) => ({
      shotId: shot.id,
      segmentId: shot.segmentId,
      title: shot.title,
      goal: shot.goal,
      startMs: shot.startMs,
      durationMs: shot.durationMs,
    })),
    assets: buildWorkflowAssets(params.timeline),
    providerTasks: orderedShots.map((shot, index) => {
      const blackboardTask = blackboardShotsById.get(shot.id)?.providerTask ?? null
      return {
        id: blackboardTask?.taskId ?? `provider-task-${shot.id}`,
        shotId: shot.id,
        operationId: materializeOperationId,
        skillId: materializeSkillId,
        status: blackboardTask ? workflowStatusFromBlackboardProviderTask(blackboardTask) : 'planned',
        requiredModelType: 'video',
        providerModel: blackboardTask?.model ?? params.videoModel ?? null,
        outputUrl: blackboardTask?.outputUrl ?? null,
        generationOptions: params.generationOptions ? { ...params.generationOptions } : undefined,
        target: buildProviderTaskTarget({
          shot,
          orderedShotIndex: index,
          panelIdsByShotId: params.panelIdsByShotId,
          storyboardId: params.storyboardId,
          startPanelIndex: params.startPanelIndex,
        }),
        assetPolicy: providerAssetPolicyForShot(shot),
        blockers: blackboardTask?.blocker ? [blackboardTask.blocker] : [],
      }
    }),
    traces: [
      {
        stage: 'intent-classification',
        status: 'passed',
        message: 'Project Agent classified the request before selecting a skill.',
        refs: [params.timeline.id],
      },
      {
        stage: 'skill-selection',
        status: 'passed',
        message: `Selected skills: ${skillIds.join(',')}.`,
        refs: skillIds,
      },
      {
        stage: 'subagent-dispatch',
        status: params.agentCrew ? 'passed' : 'planned',
        message: params.agentCrew
          ? 'Main Agent dispatched screenplay, cinematography, continuity, prompt, and sound agents.'
          : 'Compiled timeline is ready for downstream provider execution.',
        refs: orderedShots.map((shot) => shot.id),
      },
      {
        stage: 'blackboard-subagent-orchestration',
        status: params.blackboard
          ? params.blackboard.status === 'blocked' ? 'blocked' : 'passed'
          : 'planned',
        message: params.blackboard
          ? `EditTimelineBlackboard is tracking ${String(params.blackboard.agents.length)} film-production agents, ${String(params.blackboard.macroScript.length)} macro segment(s), and ${String(params.blackboard.shots.length)} shot package(s).`
          : 'EditTimelineBlackboard is not attached to this compiled-only snapshot.',
        refs: params.blackboard
          ? params.blackboard.agents.map((agent) => agent.agentId)
          : orderedShots.map((shot) => shot.id),
      },
      {
        stage: 'provider-task-planning',
        status: 'passed',
        message: `Prepared ${String(orderedShots.length)} provider task draft(s).`,
        refs: orderedShots.map((shot) => `provider-task-${shot.id}`),
      },
    ],
    evals: buildWorkflowEval({
      timeline: params.timeline,
      agentCrew: params.agentCrew,
      blackboard: params.blackboard,
      risks: params.risks,
    }),
    artifacts: [
      {
        id: `artifact-timeline-${params.timeline.id}`,
        kind: 'timeline',
        status: 'planned',
        ref: params.timeline.id,
      },
      ...orderedShots.map((shot) => ({
        id: `artifact-shot-${shot.id}`,
        kind: 'shot' as const,
        status: 'planned' as const,
        ref: shot.id,
      })),
      ...(params.planRunRef
        ? [{
            id: 'artifact-plan-run',
            kind: 'plan-run' as const,
            status: 'planned' as const,
            ref: params.planRunRef,
          }]
        : []),
      ...orderedShots.flatMap((shot) => {
        const providerTask = blackboardShotsById.get(shot.id)?.providerTask ?? null
        if (!providerTask?.taskId) return []
        return [{
          id: `artifact-provider-task-${shot.id}`,
          kind: 'provider-task' as const,
          status: workflowStatusFromBlackboardProviderTask(providerTask),
          ref: providerTask.taskId,
        }]
      }),
      ...(params.includeFinalVideoArtifact
        ? [{
            id: `artifact-final-video-${params.timeline.id}`,
            kind: 'video' as const,
            status: finalVideoArtifact.status,
            ref: finalVideoArtifact.ref,
          }]
        : []),
    ],
  }
}

function assertMaterializeTarget(params: {
  skillId: string
  operationId: string
}): void {
  const manifest = getAgentSkillManifest(params.skillId)
  if (!manifest) {
    throw new Error(`EDIT_TIMELINE_UNKNOWN_MATERIALIZE_SKILL:${params.skillId}`)
  }
  if (!manifest.allowedOperationIds.includes(params.operationId)) {
    throw new Error(`EDIT_TIMELINE_MATERIALIZE_OPERATION_NOT_ALLOWED:${params.skillId}:${params.operationId}`)
  }
}

function stripUndefinedValues(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) output[key] = value
  }
  return output
}

function assertKnownShotMapKeys(params: {
  label: string
  shotIds: ReadonlySet<string>
  values: Readonly<Record<string, string>> | undefined
}): void {
  for (const shotId of Object.keys(params.values ?? {})) {
    if (!params.shotIds.has(shotId)) {
      throw new Error(`EDIT_TIMELINE_PROVIDER_${params.label}_UNKNOWN_SHOT:${shotId}`)
    }
  }
}

function buildProviderMaterializeInput(
  input: z.output<typeof compileEditTimelineInputSchema>,
  timeline: ParsedEditTimeline,
): {
  common: Readonly<Record<string, unknown>>
  byShotId: Readonly<Record<string, Readonly<Record<string, unknown>>>>
} | undefined {
  if (!input.videoModel) return undefined

  const shotIds = new Set(timeline.shots.map((shot) => shot.id))
  assertKnownShotMapKeys({
    label: 'TARGET',
    shotIds,
    values: input.panelIdsByShotId,
  })
  assertKnownShotMapKeys({
    label: 'SOURCE_FRAME',
    shotIds,
    values: input.sourceFrameRefByShotId,
  })

  const common: Record<string, unknown> = {
    videoModel: input.videoModel,
  }
  if (input.firstLastFrameModel) common.firstLastFrameModel = input.firstLastFrameModel
  if (input.mediaRefs) common.mediaRefs = input.mediaRefs
  if (input.generationOptions) common.generationOptions = input.generationOptions

  const orderedShots = [...timeline.shots].sort((left, right) => {
    if (left.startMs !== right.startMs) return left.startMs - right.startMs
    if (left.order !== right.order) return left.order - right.order
    return left.id.localeCompare(right.id)
  })
  const byShotId: Record<string, Record<string, unknown>> = {}
  orderedShots.forEach((shot, index) => {
    const shotInput: Record<string, unknown> = {}
    const panelId = input.panelIdsByShotId?.[shot.id]
    if (panelId) {
      shotInput.panelId = panelId
    } else if (input.storyboardId && input.startPanelIndex !== undefined) {
      shotInput.storyboardId = input.storyboardId
      shotInput.panelIndex = input.startPanelIndex + index
    } else {
      throw new Error(`EDIT_TIMELINE_PROVIDER_TARGET_MISSING:${shot.id}`)
    }
    const sourceFrameRef = input.sourceFrameRefByShotId?.[shot.id]
    if (sourceFrameRef) shotInput.sourceFrameRef = sourceFrameRef
    byShotId[shot.id] = shotInput
  })

  return { common, byShotId }
}

function compileTimeline(input: z.output<typeof compileEditTimelineInputSchema>): ExecutablePlanInput {
  assertMaterializeTarget({
    skillId: input.materializeSkillId,
    operationId: input.materializeOperationId,
  })
  if (input.evaluateOperationId) {
    assertMaterializeTarget({
      skillId: input.materializeSkillId,
      operationId: input.evaluateOperationId,
    })
  }
  const timeline = parseEditTimeline(input.timeline)
  if (input.blackboard && hasProviderExecutionInput(input)) {
    assertBlackboardPromptCoverage({
      timeline,
      blackboard: input.blackboard,
    })
  }
  const plan = compileEditTimelineToExecutablePlan(input.timeline, {
    skillId: input.materializeSkillId,
    materializeOperationId: input.materializeOperationId,
    evaluateOperationId: input.evaluateOperationId,
    blackboard: input.blackboard,
    materializeInput: buildProviderMaterializeInput(input, timeline),
  })
  if (!input.assembleFinalVideo) return plan

  const assemblySkillId = input.assemblySkillId ?? 'edit-first-video-director'
  const assemblyOperationId = input.assemblyOperationId ?? 'assemble_timeline_video'
  assertMaterializeTarget({
    skillId: assemblySkillId,
    operationId: assemblyOperationId,
  })

  const materializeStepKeys = new Set(plan.steps
    .filter((step) => step.operationId === input.materializeOperationId)
    .map((step) => step.stepKey))
  const evaluateDependencies = input.evaluateOperationId
    ? plan.steps
      .filter((step) => step.operationId === input.evaluateOperationId)
      .map((step) => step.stepKey)
    : []
  const dependsOn = evaluateDependencies.length > 0
    ? evaluateDependencies
    : plan.steps
      .filter((step) => materializeStepKeys.has(step.stepKey))
      .map((step) => step.stepKey)

  return {
    ...plan,
    steps: [
      ...plan.steps,
      {
        stepKey: 'assemble_final_video',
        skillId: assemblySkillId,
        operationId: assemblyOperationId,
        inputArtifacts: ['panel.video'],
        outputArtifacts: ['final.video'],
        dependsOn,
        input: stripUndefinedValues({
          timeline,
          storyboardId: input.storyboardId,
          panelIdsByShotId: input.panelIdsByShotId,
          renderFinalVideo: input.renderFinalVideo ?? true,
        }),
      },
    ],
  }
}

function resolveRequiredEpisodeId(
  ctx: Parameters<ProjectAgentOperationRegistryDraft[string]['execute']>[0],
  inputEpisodeId?: string,
): string {
  const episodeId = inputEpisodeId?.trim() || ctx.context.episodeId?.trim()
  if (!episodeId) throw new Error('EDIT_TIMELINE_EPISODE_REQUIRED')
  return episodeId
}

async function assertEpisodeBelongsToProject(params: {
  episodeId: string
  projectId: string
}): Promise<void> {
  const episode = await prisma.projectEpisode.findFirst({
    where: {
      id: params.episodeId,
      projectId: params.projectId,
    },
    select: { id: true },
  })
  if (!episode) {
    throw new Error(`EDIT_TIMELINE_EPISODE_NOT_FOUND:${params.episodeId}`)
  }
}

function orderedTimelineShots(timeline: ParsedEditTimeline): ShotNode[] {
  return [...timeline.shots].sort((left, right) => {
    if (left.startMs !== right.startMs) return left.startMs - right.startMs
    if (left.order !== right.order) return left.order - right.order
    return left.id.localeCompare(right.id)
  })
}

const CINEMATIC_PROMPT_PACKAGE_REQUIREMENTS = [
  'subject',
  'action',
  'scene',
  'camera-angle',
  'camera-movement',
  'lighting-tone',
  'time-change',
  'first-last-frame-relation',
] as const

type CinematicPromptPackageRequirement = typeof CINEMATIC_PROMPT_PACKAGE_REQUIREMENTS[number]

function normalizePromptText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function missingCinematicPromptPackageRequirements(
  promptPackage: EditTimelinePromptPackage,
): CinematicPromptPackageRequirement[] {
  const promptText = normalizePromptText(`${promptPackage.imagePrompt}\n${promptPackage.providerPrompt}`)
  const missing: CinematicPromptPackageRequirement[] = []

  if (!promptPackage.subject.trim()) missing.push('subject')
  if (!promptPackage.action.trim()) missing.push('action')
  if (!promptPackage.scene.trim()) missing.push('scene')
  if (!promptPackage.camera.trim() || !promptText.includes('camera')) {
    missing.push('camera-angle')
  }
  if (!promptPackage.motion.trim() || !promptText.includes('middle motion:')) {
    missing.push('camera-movement')
  }
  if (!promptText.includes('lighting:')) {
    missing.push('lighting-tone')
  }
  if (!/\babout\s+\d+(?:\.\d+)?\s*s\b/.test(promptText) && !promptText.includes('duration')) {
    missing.push('time-change')
  }
  if (!promptText.includes('opening frame:') || !promptText.includes('ending frame:')) {
    missing.push('first-last-frame-relation')
  }

  return missing
}

function assertCinematicPromptPackageReady(params: {
  shotId: string
  promptPackage: EditTimelinePromptPackage
}): void {
  const missing = missingCinematicPromptPackageRequirements(params.promptPackage)
  if (missing.length > 0) {
    throw new Error(`EDIT_TIMELINE_PRODUCTION_PROMPT_PACKAGE_INCOMPLETE:${params.shotId}:${missing.join(',')}`)
  }
}

function assertBlackboardPromptCoverage(params: {
  timeline: ParsedEditTimeline
  blackboard: EditTimelineBlackboard
}): Map<string, EditTimelinePromptPackage> {
  if (params.blackboard.timelineId !== params.timeline.id) {
    throw new Error(`EDIT_TIMELINE_PRODUCTION_BLACKBOARD_TIMELINE_MISMATCH:${params.blackboard.timelineId}:${params.timeline.id}`)
  }

  const macroSegmentIds = new Set(params.blackboard.macroScript.map((segment) => segment.segmentId))
  const segmentBlackboardIds = new Set(params.blackboard.segmentBlackboards.map((segment) => segment.segmentId))
  for (const segment of params.timeline.segments) {
    if (!macroSegmentIds.has(segment.id)) {
      throw new Error(`EDIT_TIMELINE_PRODUCTION_MACRO_SEGMENT_MISSING:${segment.id}`)
    }
    if (!segmentBlackboardIds.has(segment.id)) {
      throw new Error(`EDIT_TIMELINE_PRODUCTION_SEGMENT_BLACKBOARD_MISSING:${segment.id}`)
    }
  }

  const promptPackagesByShotId = new Map<string, EditTimelinePromptPackage>()
  for (const shot of params.timeline.shots) {
    const blackboardShot = params.blackboard.shots.find((candidate) => candidate.shotId === shot.id)
    if (!blackboardShot) {
      throw new Error(`EDIT_TIMELINE_PRODUCTION_BLACKBOARD_SHOT_MISSING:${shot.id}`)
    }
    if (blackboardShot.readiness === 'blocked' || blackboardShot.blocker) {
      throw new Error(`EDIT_TIMELINE_PRODUCTION_BLACKBOARD_SHOT_BLOCKED:${shot.id}:${blackboardShot.blocker ?? 'blocked'}`)
    }
    if (blackboardShot.providerTask.blocker) {
      throw new Error(`EDIT_TIMELINE_PRODUCTION_PROVIDER_TASK_BLOCKED:${shot.id}:${blackboardShot.providerTask.blocker}`)
    }
    if (blackboardShot.promptPackage.imagePrompt.trim().length === 0) {
      throw new Error(`EDIT_TIMELINE_PRODUCTION_IMAGE_PROMPT_MISSING:${shot.id}`)
    }
    if (blackboardShot.promptPackage.providerPrompt.trim().length === 0) {
      throw new Error(`EDIT_TIMELINE_PRODUCTION_VIDEO_PROMPT_MISSING:${shot.id}`)
    }
    assertCinematicPromptPackageReady({
      shotId: shot.id,
      promptPackage: blackboardShot.promptPackage,
    })
    promptPackagesByShotId.set(shot.id, blackboardShot.promptPackage)
  }

  return promptPackagesByShotId
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecordProperty(params: {
  object: Record<string, unknown>
  key: string
  context: string
}): Record<string, unknown> {
  const value = params.object[params.key]
  if (!isRecord(value)) {
    throw new Error(`${params.context}_${params.key.toUpperCase()}_REQUIRED`)
  }
  return value
}

function requireStringProperty(params: {
  object: Record<string, unknown>
  key: string
  context: string
}): string {
  const value = params.object[params.key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${params.context}_${params.key.toUpperCase()}_REQUIRED`)
  }
  return value
}

function assertProductionPlanUsesBlackboardPrompts(params: {
  plan: ExecutablePlanInput
  timeline: ParsedEditTimeline
  blackboard: EditTimelineBlackboard
}): void {
  const promptPackagesByShotId = assertBlackboardPromptCoverage({
    timeline: params.timeline,
    blackboard: params.blackboard,
  })
  const requiredShotIds = new Set(params.timeline.shots.map((shot) => shot.id))
  const seenShotIds = new Set<string>()

  for (const step of params.plan.steps) {
    if (step.operationId !== 'generate_panel_video') continue
    if (!isRecord(step.input)) {
      throw new Error(`EDIT_TIMELINE_PRODUCTION_STEP_INPUT_INVALID:${step.stepKey}`)
    }

    const shotId = requireStringProperty({
      object: step.input,
      key: 'shotId',
      context: `EDIT_TIMELINE_PRODUCTION_STEP_${step.stepKey}`,
    })
    const expectedPromptPackage = promptPackagesByShotId.get(shotId)
    if (!expectedPromptPackage) {
      throw new Error(`EDIT_TIMELINE_PRODUCTION_STEP_UNKNOWN_SHOT:${shotId}`)
    }

    const promptPackage = requireRecordProperty({
      object: step.input,
      key: 'promptPackage',
      context: `EDIT_TIMELINE_PRODUCTION_STEP_${step.stepKey}`,
    })
    const controlPayload = requireRecordProperty({
      object: step.input,
      key: 'controlPayload',
      context: `EDIT_TIMELINE_PRODUCTION_STEP_${step.stepKey}`,
    })

    const actualProviderPrompt = requireStringProperty({
      object: promptPackage,
      key: 'providerPrompt',
      context: `EDIT_TIMELINE_PRODUCTION_STEP_${step.stepKey}_PROMPT_PACKAGE`,
    })
    const actualImagePrompt = requireStringProperty({
      object: promptPackage,
      key: 'imagePrompt',
      context: `EDIT_TIMELINE_PRODUCTION_STEP_${step.stepKey}_PROMPT_PACKAGE`,
    })
    const actualControlPrompt = requireStringProperty({
      object: controlPayload,
      key: 'prompt',
      context: `EDIT_TIMELINE_PRODUCTION_STEP_${step.stepKey}_CONTROL_PAYLOAD`,
    })

    if (actualProviderPrompt !== expectedPromptPackage.providerPrompt) {
      throw new Error(`EDIT_TIMELINE_PRODUCTION_STEP_PROVIDER_PROMPT_MISMATCH:${shotId}`)
    }
    if (actualImagePrompt !== expectedPromptPackage.imagePrompt) {
      throw new Error(`EDIT_TIMELINE_PRODUCTION_STEP_IMAGE_PROMPT_MISMATCH:${shotId}`)
    }
    if (actualControlPrompt !== expectedPromptPackage.providerPrompt) {
      throw new Error(`EDIT_TIMELINE_PRODUCTION_STEP_CONTROL_PROMPT_MISMATCH:${shotId}`)
    }
    seenShotIds.add(shotId)
  }

  for (const shotId of requiredShotIds) {
    if (!seenShotIds.has(shotId)) {
      throw new Error(`EDIT_TIMELINE_PRODUCTION_STEP_MISSING_FOR_SHOT:${shotId}`)
    }
  }
}

type ScoreEditTimelineDimension = z.output<typeof scoreEditTimelineDimensionSchema>

function buildTraceScoreDimension(params: {
  code: string
  passed: boolean
  blockedMessage: string
  passedMessage: string
}): ScoreEditTimelineDimension {
  return {
    code: params.code,
    status: params.passed ? 'passed' : 'blocked',
    message: params.passed ? params.passedMessage : params.blockedMessage,
    score: params.passed ? 1 : 0,
    maxScore: 1,
  }
}

function readRecordPropertyOrNull(object: Record<string, unknown> | null | undefined, key: string): Record<string, unknown> | null {
  if (!object) return null
  const value = object[key]
  return isRecord(value) ? value : null
}

function readNonEmptyStringProperty(object: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!object) return null
  const value = object[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function hasPlayableFinalVideoRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase()
  return normalized.endsWith('.mp4')
    || normalized.endsWith('.mov')
    || normalized.endsWith('.webm')
    || normalized.includes('final-video')
    || normalized.includes('final-videos/')
    || normalized.includes('/video-editor/')
}

function readWorkflowFinalVideoRefs(workflow: ProjectAgentWorkflowSnapshot | null): string[] {
  if (!workflow) return []
  return workflow.artifacts
    .filter((artifact) => artifact.kind === 'video' && artifact.status === 'succeeded' && artifact.ref)
    .map((artifact) => artifact.ref)
    .filter((ref): ref is string => typeof ref === 'string' && ref.trim().length > 0)
}

function readPlanArtifactFinalVideoRefs(snapshot: EditTimelinePlanRunSnapshot): string[] {
  const refs: string[] = []
  for (const artifact of snapshot.artifacts) {
    if (artifact.artifactType !== 'final.video') continue
    if (artifact.refId.trim()) refs.push(artifact.refId.trim())

    const payload = isRecord(artifact.payload) ? artifact.payload : null
    for (const key of ['storageKey', 'finalVideoUrl', 'outputUrl', 'url', 'editorProjectId'] as const) {
      const ref = readNonEmptyStringProperty(payload, key)
      if (ref) refs.push(ref)
    }
  }
  return [...new Set(refs)]
}

function scoreProviderPayloadSteps(snapshot: EditTimelinePlanRunSnapshot): boolean {
  const providerSteps = snapshot.steps.filter((step) => step.operationId === 'generate_panel_video')
  if (providerSteps.length === 0) return false
  return providerSteps.every((step) => {
    const promptPackage = readRecordPropertyOrNull(step.input, 'promptPackage')
    const controlPayload = readRecordPropertyOrNull(step.input, 'controlPayload')
    const providerPrompt = readNonEmptyStringProperty(promptPackage, 'providerPrompt')
    const imagePrompt = readNonEmptyStringProperty(promptPackage, 'imagePrompt')
    const controlPrompt = readNonEmptyStringProperty(controlPayload, 'prompt')
    return Boolean(providerPrompt && imagePrompt && controlPrompt && providerPrompt === controlPrompt)
  })
}

function scoreBlackboardCoverage(blackboard: EditTimelineBlackboard | null): boolean {
  if (!blackboard) return false
  if (blackboard.macroScript.length === 0 || blackboard.segmentBlackboards.length === 0 || blackboard.shots.length === 0) {
    return false
  }
  return blackboard.shots.every((shot) => (
    shot.promptPackage.imagePrompt.trim().length > 0
    && shot.promptPackage.providerPrompt.trim().length > 0
    && missingCinematicPromptPackageRequirements(shot.promptPackage).length === 0
  ))
}

function scoreProviderTaskCompletion(blackboard: EditTimelineBlackboard | null, snapshot: EditTimelinePlanRunSnapshot): boolean {
  if (blackboard && blackboard.shots.length > 0) {
    return blackboard.shots.every((shot) => (
      shot.providerTask.status === 'succeeded'
      && typeof shot.providerTask.outputUrl === 'string'
      && shot.providerTask.outputUrl.trim().length > 0
    ))
  }
  const providerSteps = snapshot.steps.filter((step) => step.operationId === 'generate_panel_video')
  return providerSteps.length > 0 && providerSteps.every((step) => step.status === 'completed')
}

function scoreSingleFilmCriticTarget(blackboard: EditTimelineBlackboard | null): boolean {
  const target = blackboard?.finalCritic.nextOptimizationTarget.trim()
  if (!target) return false
  return !target.includes('\n') && !target.includes(',') && !target.includes('|')
}

function scoreFinalVideoPlaybackEvidence(params: {
  blackboard: EditTimelineBlackboard | null
  workflow: ProjectAgentWorkflowSnapshot | null
  snapshot: EditTimelinePlanRunSnapshot
}): boolean {
  const evidenceRefs = [
    ...(params.blackboard?.finalCritic.evidenceRefs ?? []),
    ...readWorkflowFinalVideoRefs(params.workflow),
    ...readPlanArtifactFinalVideoRefs(params.snapshot),
  ]
  return evidenceRefs.some(hasPlayableFinalVideoRef)
}

function scorePlanRunRouting(snapshot: EditTimelinePlanRunSnapshot, traceSummary: PlanRunTraceSummary): boolean {
  const operations = new Set([
    ...snapshot.steps.map((step) => step.operationId),
    ...traceSummary.operationOrder,
  ])
  return operations.has('generate_panel_video') && operations.has('assemble_timeline_video')
}

function scoreEditTimelineSinglePlanRunTrace(params: {
  planRunId: string
  snapshot: EditTimelinePlanRunSnapshot
  traceSummary: PlanRunTraceSummary
}): z.output<typeof scoreEditTimelineTraceOutputSchema> {
  const blackboard = readEditTimelineBlackboardFromSnapshot(params.snapshot)
  const workflowPayload = readEditTimelineWorkflowFromSnapshot(params.snapshot)
  const workflowParse = workflowPayload ? projectAgentWorkflowSchema.safeParse(workflowPayload) : null
  const workflow = workflowParse?.success ? workflowParse.data : null
  const nextOptimizationTarget = blackboard?.finalCritic.nextOptimizationTarget.trim()
    || params.traceSummary.firstError?.message
    || 'browser-playback-acceptance'
  const dimensions = [
    buildTraceScoreDimension({
      code: 'routing',
      passed: scorePlanRunRouting(params.snapshot, params.traceSummary),
      passedMessage: 'PlanRun selected edit-first provider steps and final.video assembly.',
      blockedMessage: 'PlanRun did not include both generate_panel_video and assemble_timeline_video.',
    }),
    buildTraceScoreDimension({
      code: 'blackboardCoverage',
      passed: scoreBlackboardCoverage(blackboard),
      passedMessage: 'EditTimelineBlackboard covers macro script, segment boards, and provider-ready shot prompt packages.',
      blockedMessage: 'EditTimelineBlackboard is missing coverage or cinematic prompt package requirements.',
    }),
    buildTraceScoreDimension({
      code: 'providerPayload',
      passed: scoreProviderPayloadSteps(params.snapshot),
      passedMessage: 'Provider steps carry blackboard promptPackage and matching controlPayload prompt.',
      blockedMessage: 'At least one provider step is missing a promptPackage or matching controlPayload prompt.',
    }),
    buildTraceScoreDimension({
      code: 'taskCompletion',
      passed: scoreProviderTaskCompletion(blackboard, params.snapshot),
      passedMessage: 'All provider panel video tasks have completed output evidence.',
      blockedMessage: 'Provider panel video tasks are not all completed with output URLs.',
    }),
    buildTraceScoreDimension({
      code: 'finalVideoPlayback',
      passed: scoreFinalVideoPlaybackEvidence({ blackboard, workflow, snapshot: params.snapshot }),
      passedMessage: 'final.video playback evidence is present.',
      blockedMessage: 'No playable final.video evidence ref is present.',
    }),
    buildTraceScoreDimension({
      code: 'filmCriticNextTarget',
      passed: scoreSingleFilmCriticTarget(blackboard),
      passedMessage: 'Film Critic selected one next optimization target.',
      blockedMessage: 'Film Critic has not selected one concrete next optimization target.',
    }),
  ]
  const earned = dimensions.reduce((sum, dimension) => sum + dimension.score, 0)
  const total = dimensions.reduce((sum, dimension) => sum + dimension.maxScore, 0)
  const score = total > 0 ? Math.round((earned / total) * 100) : 0
  const blockers = dimensions
    .filter((dimension) => dimension.status === 'blocked')
    .map((dimension) => dimension.code)
  const malformedTraceBlockers = params.traceSummary.malformedErrorEvents.length > 0
    ? ['malformed-trace-error-event']
    : []
  const failures = [...blockers, ...malformedTraceBlockers]
  const grade = {
    planRunId: params.planRunId,
    score,
    dimensions,
    failures,
    nextOptimizationTarget,
    traceSummary: {
      eventCount: params.traceSummary.eventCount,
      stepOrder: params.traceSummary.stepOrder,
      operationOrder: params.traceSummary.operationOrder,
      firstError: params.traceSummary.firstError,
      hasInputBuildFailure: params.traceSummary.hasInputBuildFailure,
      malformedErrorEventCount: params.traceSummary.malformedErrorEvents.length,
    },
  }

  return {
    traceEvalPassRate: score,
    passed: failures.length === 0,
    blockers: failures,
    grade,
    score,
    failures,
    nextOptimizationTarget,
    dimensions,
  }
}

function timelineTotalDurationMs(timeline: ParsedEditTimeline): number {
  return timeline.segments.reduce((total, segment) => {
    const segmentEnd = segment.startMs + segment.durationMs
    return Math.max(total, segmentEnd)
  }, 0)
}

async function materializeTimelineStoryboard(
  ctx: Parameters<ProjectAgentOperationRegistryDraft[string]['execute']>[0],
  input: z.output<typeof materializeEditTimelineStoryboardInputSchema>,
): Promise<z.output<typeof materializeEditTimelineStoryboardOutputSchema>> {
  const timeline = parseEditTimeline(input.timeline)
  const promptPackagesByShotId = input.blackboard
    ? assertBlackboardPromptCoverage({ timeline, blackboard: input.blackboard })
    : new Map<string, EditTimelinePromptPackage>()
  const episodeId = resolveRequiredEpisodeId(ctx, input.episodeId)
  await assertEpisodeBelongsToProject({
    episodeId,
    projectId: ctx.projectId,
  })

  const shots = orderedTimelineShots(timeline)
  return prisma.$transaction(async (tx) => {
    const clip = await tx.projectClip.create({
      data: {
        episodeId,
        start: 0,
        end: timelineTotalDurationMs(timeline),
        duration: Math.ceil(timelineTotalDurationMs(timeline) / 1000),
        summary: timeline.title,
        content: JSON.stringify({
          timelineId: timeline.id,
          title: timeline.title,
          aspectRatio: timeline.aspectRatio,
        }),
        shotCount: shots.length,
        screenplay: JSON.stringify({
          timelineId: timeline.id,
          shotIds: shots.map((shot) => shot.id),
        }),
      },
      select: { id: true },
    })
    const storyboard = await tx.projectStoryboard.create({
      data: {
        episodeId,
        clipId: clip.id,
        panelCount: shots.length,
        storyboardTextJson: JSON.stringify({
          timelineId: timeline.id,
          title: timeline.title,
          shotIds: shots.map((shot) => shot.id),
        }),
      },
      select: { id: true },
    })

    const panels: z.output<typeof materializeEditTimelineStoryboardOutputSchema>['panels'] = []
    for (let index = 0; index < shots.length; index += 1) {
      const shot = shots[index]
      if (!shot) throw new Error(`EDIT_TIMELINE_MATERIALIZE_SHOT_MISSING:${String(index)}`)
      const promptPackage = promptPackagesByShotId.get(shot.id)
      const panelPrompts = (() => {
        if (!input.blackboard) {
          return {
            imagePrompt: shot.control.prompt,
            videoPrompt: shot.control.prompt,
          }
        }
        if (!promptPackage) {
          throw new Error(`EDIT_TIMELINE_MATERIALIZE_BLACKBOARD_PROMPT_MISSING:${shot.id}`)
        }
        return {
          imagePrompt: promptPackage.imagePrompt,
          videoPrompt: promptPackage.providerPrompt,
        }
      })()
      const panel = await tx.projectPanel.create({
        data: {
          storyboardId: storyboard.id,
          panelIndex: index,
          panelNumber: index + 1,
          shotType: shot.track,
          cameraMove: shot.control.cameraMotion ?? null,
          description: shot.goal,
          srtSegment: shot.editorial?.caption ?? shot.title,
          srtStart: shot.startMs / 1000,
          srtEnd: (shot.startMs + shot.durationMs) / 1000,
          duration: shot.durationMs / 1000,
          imagePrompt: panelPrompts.imagePrompt,
          videoPrompt: panelPrompts.videoPrompt,
        },
        select: { id: true, panelIndex: true },
      })
      panels.push({
        shotId: shot.id,
        panelId: panel.id,
        panelIndex: panel.panelIndex,
      })
    }

    return {
      clipId: clip.id,
      storyboardId: storyboard.id,
      panelIdsByShotId: Object.fromEntries(panels.map((panel) => [panel.shotId, panel.panelId])),
      panels,
    }
  })
}

function assertKnownFinalPanelMapKeys(params: {
  shotIds: ReadonlySet<string>
  values: Readonly<Record<string, string>>
}): void {
  for (const shotId of Object.keys(params.values)) {
    if (!params.shotIds.has(shotId)) {
      throw new Error(`EDIT_TIMELINE_FINAL_VIDEO_PANEL_TARGET_UNKNOWN_SHOT:${shotId}`)
    }
  }
}

async function collectPanelVideosFromShotMap(params: {
  episodeId: string
  timeline: ParsedEditTimeline
  panelIdsByShotId: Readonly<Record<string, string>>
}): Promise<TimelinePanelVideoSource[]> {
  const shots = orderedTimelineShots(params.timeline)
  const shotIds = new Set(shots.map((shot) => shot.id))
  assertKnownFinalPanelMapKeys({
    shotIds,
    values: params.panelIdsByShotId,
  })
  const panelIds = shots.map((shot) => {
    const panelId = params.panelIdsByShotId[shot.id]?.trim()
    if (!panelId) {
      throw new Error(`EDIT_TIMELINE_FINAL_VIDEO_PANEL_MAPPING_MISSING:${shot.id}`)
    }
    return panelId
  })
  const panels = await prisma.projectPanel.findMany({
    where: {
      id: { in: panelIds },
      storyboard: { episodeId: params.episodeId },
    },
    include: {
      storyboard: true,
      videoMedia: { select: { storageKey: true } },
    },
  })
  const panelsById = new Map(panels.map((panel) => [panel.id, panel]))

  return shots.map((shot) => {
    const panelId = params.panelIdsByShotId[shot.id]
    const panel = panelsById.get(panelId)
    if (!panel) {
      throw new Error(`EDIT_TIMELINE_FINAL_VIDEO_PANEL_MISSING:${shot.id}:${panelId}`)
    }
    const source: TimelinePanelVideoSource = {
      shotId: shot.id,
      panelId: panel.id,
      storyboardId: panel.storyboardId,
      panelIndex: panel.panelIndex,
      videoUrl: panel.videoUrl,
      videoMediaId: panel.videoMediaId,
      videoMediaStorageKey: panel.videoMedia?.storageKey ?? null,
      durationSeconds: panel.duration,
      caption: panel.srtSegment,
      description: panel.description,
    }
    if (!resolveTimelinePanelVideoRef(source)) {
      throw new Error(`EDIT_TIMELINE_FINAL_VIDEO_PANEL_VIDEO_MISSING:${shot.id}:${panel.id}`)
    }
    return source
  })
}

async function collectPanelVideosFromStoryboard(params: {
  episodeId: string
  timeline: ParsedEditTimeline
  storyboardId: string
}): Promise<TimelinePanelVideoSource[]> {
  const storyboard = await prisma.projectStoryboard.findFirst({
    where: {
      id: params.storyboardId,
      episodeId: params.episodeId,
    },
    include: {
      panels: {
        orderBy: { panelIndex: 'asc' },
        include: {
          videoMedia: { select: { storageKey: true } },
        },
      },
    },
  })
  if (!storyboard) {
    throw new Error(`EDIT_TIMELINE_FINAL_VIDEO_STORYBOARD_MISSING:${params.storyboardId}`)
  }
  const shots = orderedTimelineShots(params.timeline)
  return shots.map((shot, index) => {
    const panel = storyboard.panels[index]
    if (!panel) {
      throw new Error(`EDIT_TIMELINE_FINAL_VIDEO_PANEL_MISSING:${shot.id}:index-${String(index)}`)
    }
    const source: TimelinePanelVideoSource = {
      shotId: shot.id,
      panelId: panel.id,
      storyboardId: storyboard.id,
      panelIndex: panel.panelIndex,
      videoUrl: panel.videoUrl,
      videoMediaId: panel.videoMediaId,
      videoMediaStorageKey: panel.videoMedia?.storageKey ?? null,
      durationSeconds: panel.duration,
      caption: panel.srtSegment,
      description: panel.description,
    }
    if (!resolveTimelinePanelVideoRef(source)) {
      throw new Error(`EDIT_TIMELINE_FINAL_VIDEO_PANEL_VIDEO_MISSING:${shot.id}:${panel.id}`)
    }
    return source
  })
}

async function collectTimelinePanelVideoSources(params: {
  episodeId: string
  timeline: ParsedEditTimeline
  input: z.output<typeof assembleTimelineVideoInputSchema>
}): Promise<TimelinePanelVideoSource[]> {
  if (params.input.panelIdsByShotId) {
    return collectPanelVideosFromShotMap({
      episodeId: params.episodeId,
      timeline: params.timeline,
      panelIdsByShotId: params.input.panelIdsByShotId,
    })
  }
  if (params.input.storyboardId) {
    return collectPanelVideosFromStoryboard({
      episodeId: params.episodeId,
      timeline: params.timeline,
      storyboardId: params.input.storyboardId,
    })
  }
  throw new Error('EDIT_TIMELINE_FINAL_VIDEO_PANEL_TARGET_REQUIRED')
}

async function upsertVideoEditorProject(params: {
  episodeId: string
  project: ReturnType<typeof buildTimelineVideoEditorProject>
  renderStatus: 'rendering' | 'completed' | 'failed'
  outputUrl?: string | null
}): Promise<{ id: string }> {
  return prisma.videoEditorProject.upsert({
    where: { episodeId: params.episodeId },
    create: {
      id: params.project.id,
      episodeId: params.episodeId,
      projectData: JSON.stringify(params.project),
      renderStatus: params.renderStatus,
      outputUrl: params.outputUrl ?? null,
    },
    update: {
      projectData: JSON.stringify(params.project),
      renderStatus: params.renderStatus,
      outputUrl: params.outputUrl ?? null,
    },
    select: { id: true },
  })
}

async function assembleTimelineVideo(
  ctx: Parameters<ProjectAgentOperationRegistryDraft[string]['execute']>[0],
  input: z.output<typeof assembleTimelineVideoInputSchema>,
): Promise<z.output<typeof assembleTimelineVideoOutputSchema>> {
  if (input.renderFinalVideo === false) {
    throw new Error('EDIT_TIMELINE_FINAL_VIDEO_RENDER_NOT_REQUESTED')
  }
  const timeline = parseEditTimeline(input.timeline)
  const episodeId = resolveRequiredEpisodeId(ctx, input.episodeId)
  await assertEpisodeBelongsToProject({
    episodeId,
    projectId: ctx.projectId,
  })
  const existingProject = await prisma.videoEditorProject.findUnique({
    where: { episodeId },
    select: { id: true },
  })
  const panelVideos = await collectTimelinePanelVideoSources({
    episodeId,
    timeline,
    input,
  })
  const editorProject = buildTimelineVideoEditorProject({
    episodeId,
    timeline,
    panelVideos,
    editorProjectId: existingProject?.id,
  })
  const renderingProject = await upsertVideoEditorProject({
    episodeId,
    project: editorProject,
    renderStatus: 'rendering',
  })

  try {
    const renderResult = await renderVideoEditorProjectToStorage({
      project: {
        ...editorProject,
        id: renderingProject.id,
      },
      outputKey: `final-videos/${episodeId}/${renderingProject.id}-${String(Date.now())}.mp4`,
    })
    await upsertVideoEditorProject({
      episodeId,
      project: {
        ...editorProject,
        id: renderingProject.id,
      },
      renderStatus: 'completed',
      outputUrl: renderResult.outputUrl,
    })
    return {
      editorProjectId: renderingProject.id,
      episodeId,
      storyboardId: panelVideos[0]?.storyboardId ?? input.storyboardId ?? null,
      panelIdsByShotId: Object.fromEntries(panelVideos.map((source) => [source.shotId, source.panelId])),
      clipCount: panelVideos.length,
      renderStatus: 'completed',
      outputUrl: renderResult.outputUrl,
      finalVideoUrl: renderResult.outputUrl,
      storageKey: renderResult.storageKey,
      blockers: [],
    }
  } catch (error) {
    await upsertVideoEditorProject({
      episodeId,
      project: {
        ...editorProject,
        id: renderingProject.id,
      },
      renderStatus: 'failed',
    })
    const message = error instanceof Error && error.message.trim()
      ? error.message.trim()
      : 'VIDEO_EDITOR_RENDER_FAILED'
    throw new Error(`EDIT_TIMELINE_FINAL_VIDEO_RENDER_FAILED:${message}`)
  }
}

function productionOperationRequiresConfirmation(
  operation: ReturnType<typeof createProjectAgentOperationRegistryForApi>[string],
): boolean {
  return shouldRequireAssistantConfirmation(operation.confirmation)
}

function buildProductionToolResultError(params: {
  code: 'OPERATION_NOT_FOUND' | 'OPERATION_NOT_ALLOWED' | 'CONFIRMATION_REQUIRED' | 'OPERATION_INPUT_INVALID' | 'OPERATION_EXECUTION_FAILED' | 'OPERATION_OUTPUT_INVALID' | 'OPERATION_PREREQUISITE_MISSING'
  message: string
  operationId: string
  details?: Record<string, unknown> | null
  issues?: unknown
}): ProjectAgentToolResult<unknown> {
  return {
    ok: false,
    ...(params.code === 'CONFIRMATION_REQUIRED' ? { confirmationRequired: true } : {}),
    error: {
      code: params.code,
      message: params.message,
      operationId: params.operationId,
      details: params.details ?? null,
      ...(params.issues !== undefined ? { issues: params.issues } : {}),
    },
  }
}

function productionErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.trim() || 'OPERATION_EXECUTION_FAILED'
  if (typeof error === 'string' && error.trim()) return error.trim()
  if (isRecord(error)) {
    const message = error.message
    if (typeof message === 'string' && message.trim()) return message.trim()
  }
  return 'OPERATION_EXECUTION_FAILED'
}

function readEpisodeIdFromOperationInput(
  context: ProjectAgentOperationContext['context'],
  input: unknown,
): string {
  const contextEpisodeId = typeof context.episodeId === 'string' ? context.episodeId.trim() : ''
  if (contextEpisodeId) return contextEpisodeId
  if (!input || typeof input !== 'object' || Array.isArray(input)) return ''
  const value = (input as Record<string, unknown>).episodeId
  return typeof value === 'string' ? value.trim() : ''
}

async function invokeProductionPlanStep(params: {
  ctx: ProjectAgentOperationContext
  skillId: string
  operationId: string
  input: Record<string, unknown>
}): Promise<ProjectAgentToolResult<unknown>> {
  const manifest = getAgentSkillManifest(params.skillId)
  if (!manifest) {
    return buildProductionToolResultError({
      code: 'OPERATION_NOT_ALLOWED',
      message: `unknown skill: ${params.skillId}`,
      operationId: params.operationId,
    })
  }
  if (!manifest.allowedOperationIds.includes(params.operationId)) {
    return buildProductionToolResultError({
      code: 'OPERATION_NOT_ALLOWED',
      message: `operation ${params.operationId} is not allowed by skill ${params.skillId}`,
      operationId: params.operationId,
    })
  }

  const registry = createProjectAgentOperationRegistryForApi()
  const operation = registry[params.operationId]
  if (!operation) {
    return buildProductionToolResultError({
      code: 'OPERATION_NOT_FOUND',
      message: `operation not found: ${params.operationId}`,
      operationId: params.operationId,
    })
  }
  if (START_EDIT_TIMELINE_RUN_OPERATION_IDS.has(operation.id)) {
    return buildProductionToolResultError({
      code: 'OPERATION_NOT_ALLOWED',
      message: `${operation.id} cannot call itself`,
      operationId: params.operationId,
    })
  }

  const parsed = operation.inputSchema.safeParse(params.input)
  if (!parsed.success) {
    return buildProductionToolResultError({
      code: 'OPERATION_INPUT_INVALID',
      message: 'PROJECT_AGENT_INVALID_OPERATION_INPUT',
      operationId: params.operationId,
      issues: parsed.error.issues,
    })
  }

  const episodeId = readEpisodeIdFromOperationInput(params.ctx.context, parsed.data)
  if (operation.prerequisites.episodeId === 'required' && !episodeId) {
    return buildProductionToolResultError({
      code: 'OPERATION_PREREQUISITE_MISSING',
      message: 'PROJECT_AGENT_OPERATION_PREREQUISITE_EPISODE_REQUIRED',
      operationId: params.operationId,
    })
  }
  if (operation.prerequisites.episodeId === 'forbidden' && episodeId) {
    return buildProductionToolResultError({
      code: 'OPERATION_PREREQUISITE_MISSING',
      message: 'PROJECT_AGENT_OPERATION_PREREQUISITE_EPISODE_FORBIDDEN',
      operationId: params.operationId,
    })
  }
  if (productionOperationRequiresConfirmation(operation) && !isConfirmedOperationInput(params.input)) {
    const summary = operation.confirmation.summary
      || `Operation ${params.operationId} requires confirmation.`
    writeOperationDataPart<ConfirmationRequestPartData>(params.ctx.writer, 'data-confirmation-request', {
      operationId: START_EDIT_TIMELINE_VIDEO_RUN_OPERATION_ID,
      summary,
      argsHint: {
        skillId: params.skillId,
        operationId: params.operationId,
        input: {
          ...params.input,
          confirmed: true,
        },
      },
      ...(operation.confirmation.budget ? { budget: operation.confirmation.budget } : {}),
    })
    return buildProductionToolResultError({
      code: 'CONFIRMATION_REQUIRED',
      message: summary,
      operationId: params.operationId,
      details: { skillId: params.skillId },
    })
  }

  try {
    const result = await operation.execute(params.ctx, parsed.data)
    const outputParsed = operation.outputSchema.safeParse(result)
    if (!outputParsed.success) {
      return buildProductionToolResultError({
        code: 'OPERATION_OUTPUT_INVALID',
        message: 'PROJECT_AGENT_OPERATION_OUTPUT_INVALID',
        operationId: params.operationId,
        issues: outputParsed.error.issues,
      })
    }
    return {
      ok: true,
      data: outputParsed.data,
    }
  } catch (error) {
    return buildProductionToolResultError({
      code: 'OPERATION_EXECUTION_FAILED',
      message: productionErrorMessage(error),
      operationId: params.operationId,
    })
  }
}

async function resolveProductionVideoModel(params: {
  ctx: ProjectAgentOperationContext
  explicitVideoModel?: string
}): Promise<string> {
  const explicit = params.explicitVideoModel?.trim()
  if (explicit) return explicit

  const modelConfig = await getProjectModelConfig(params.ctx.projectId, params.ctx.userId)
  const configured = modelConfig.videoModel?.trim()
  if (!configured) {
    throw new Error('EDIT_TIMELINE_VIDEO_MODEL_NOT_CONFIGURED')
  }
  return configured
}

function assertProductionVideoModelKey(videoModel: string): void {
  if (!parseModelKeyStrict(videoModel)) {
    throw new Error(`EDIT_TIMELINE_VIDEO_MODEL_INVALID:${videoModel}`)
  }
}

function assertProductionFirstLastFrameModelKey(firstLastFrameModel: string | undefined): void {
  const model = firstLastFrameModel?.trim()
  if (!model) return
  if (!parseModelKeyStrict(model)) {
    throw new Error(`EDIT_TIMELINE_FIRST_LAST_FRAME_MODEL_INVALID:${model}`)
  }
}

function assertProductionProviderControls(timeline: ParsedEditTimeline): void {
  for (const shot of timeline.shots) {
    mapControlPayloadToVideoProviderInput({
      ...shot.control,
      durationSeconds: shot.control.durationSeconds ?? Number((shot.durationMs / 1000).toFixed(3)),
      aspectRatio: shot.control.aspectRatio ?? timeline.aspectRatio,
    })
  }
}

async function startEditTimelineProductionRun(
  ctx: ProjectAgentOperationContext,
  input: z.output<typeof startEditTimelineProductionRunInputSchema>,
  options: { operationId: string } = { operationId: START_EDIT_TIMELINE_VIDEO_RUN_OPERATION_ID },
): Promise<z.output<typeof startEditTimelineProductionRunOutputSchema>> {
  const timeline = parseEditTimeline(input.timeline)
  assertBlackboardPromptCoverage({ timeline, blackboard: input.blackboard })
  const videoModel = await resolveProductionVideoModel({
    ctx,
    explicitVideoModel: input.videoModel,
  })
  assertProductionVideoModelKey(videoModel)
  assertProductionFirstLastFrameModelKey(input.firstLastFrameModel)
  assertProductionProviderControls(timeline)

  const materialized = await materializeTimelineStoryboard(ctx, {
    confirmed: true,
    timeline,
    blackboard: input.blackboard,
    episodeId: input.episodeId,
  })
  const compileInput = compileEditTimelineInputSchema.parse({
    timeline,
    blackboard: input.blackboard,
    materializeSkillId: 'media-generation',
    materializeOperationId: 'generate_panel_video',
    videoModel,
    firstLastFrameModel: input.firstLastFrameModel,
    panelIdsByShotId: materialized.panelIdsByShotId,
    mediaRefs: input.mediaRefs,
    generationOptions: input.generationOptions,
    assembleFinalVideo: true,
    renderFinalVideo: input.renderFinalVideo ?? true,
  })
  const plan = compileTimeline(compileInput)
  assertProductionPlanUsesBlackboardPrompts({
    plan,
    timeline,
    blackboard: input.blackboard,
  })
  const planRun = await executeAgentPlan({
    userId: ctx.userId,
    projectId: ctx.projectId,
    episodeId: input.episodeId || ctx.context.episodeId || null,
    planId: null,
    input: plan,
    initialArtifacts: [{
      artifactType: EDIT_TIMELINE_BLACKBOARD_ARTIFACT_TYPE,
      refId: input.blackboard.id,
      payload: { ...input.blackboard },
    }],
    invokeStep: async (step) => invokeProductionPlanStep({
      ctx,
      skillId: step.skillId,
      operationId: step.operationId,
      input: step.input,
    }),
  })
  let runtimeBlackboard: EditTimelineBlackboard = input.blackboard
  let workflow = buildProjectAgentWorkflowSnapshot({
    goalText: plan.goal,
    timeline,
    blackboard: runtimeBlackboard,
    risks: planRun.success ? [] : [risk(planRun.error?.code ?? 'PLAN_RUN_FAILED', planRun.error?.message ?? 'PlanRun failed before submitting provider work.')],
    materializeSkillId: 'media-generation',
    materializeOperationId: 'generate_panel_video',
    videoModel,
    generationOptions: input.generationOptions,
    panelIdsByShotId: materialized.panelIdsByShotId,
    planRunRef: planRun.planRunId,
    includeFinalVideoArtifact: true,
  })
  await createPlanArtifact({
    planRunId: planRun.planRunId,
    artifactType: EDIT_TIMELINE_WORKFLOW_ARTIFACT_TYPE,
    refId: workflow.timelineId,
    payload: { ...workflow },
  })
  let latestSnapshot = await getPlanRunSnapshot(planRun.planRunId)
  if (!latestSnapshot) {
    throw new Error(`PLAN_RUN_SNAPSHOT_MISSING:${planRun.planRunId}`)
  }

  const submittedProviderStep = latestSnapshot.steps.find((step) => (
    step.operationId === 'generate_panel_video'
      && step.status === 'waiting_task'
      && typeof step.taskId === 'string'
      && step.taskId.trim()
  ))
  if (submittedProviderStep) {
    const persisted = await persistEditTimelineProviderEvidence({
      planRunId: planRun.planRunId,
      snapshot: latestSnapshot,
      step: submittedProviderStep,
      status: 'submitted',
    })
    latestSnapshot = persisted.snapshot
    runtimeBlackboard = persisted.blackboard ?? runtimeBlackboard
    workflow = projectAgentWorkflowSchema.parse(persisted.workflow ?? workflow)
  }

  const failedProviderStep = !planRun.success
    ? latestSnapshot.steps.find((step) => (
        step.operationId === 'generate_panel_video'
          && step.stepKey === planRun.failedStepKey
      )) ?? null
    : null
  if (failedProviderStep) {
    const persisted = await persistEditTimelineProviderEvidence({
      planRunId: planRun.planRunId,
      snapshot: latestSnapshot,
      step: failedProviderStep,
      status: 'blocked',
      blocker: productionErrorMessage(planRun.error),
    })
    latestSnapshot = persisted.snapshot
    runtimeBlackboard = persisted.blackboard ?? runtimeBlackboard
    workflow = projectAgentWorkflowSchema.parse(persisted.workflow ?? workflow)
  }

  runtimeBlackboard = readEditTimelineBlackboardFromSnapshot(latestSnapshot) ?? runtimeBlackboard
  workflow = projectAgentWorkflowSchema.parse(readEditTimelineWorkflowFromSnapshot(latestSnapshot) ?? workflow)

  writeOperationDataPart<PlanRunSubmittedPartData>(ctx.writer, 'data-plan-run-submitted', {
    operationId: options.operationId,
    planRunId: planRun.planRunId,
    status: planRun.status || (planRun.success ? 'running' : 'failed'),
    executedStepKeys: planRun.executedStepKeys ?? [],
    waitingTaskId: planRun.waitingTaskId ?? null,
  })

  return {
    ...materialized,
    plan,
    estimatedStepCount: plan.steps.length,
    planRun,
    workflow,
    blackboard: runtimeBlackboard,
  }
}

function resolveVideoRunStory(input: z.output<typeof startEditTimelineVideoRunInputSchema>): string {
  const story = input.story?.trim() || input.goal?.trim()
  if (!story) {
    throw new Error('EDIT_TIMELINE_VIDEO_RUN_STORY_REQUIRED')
  }
  return story
}

function buildPlanInputFromVideoRun(
  input: z.output<typeof startEditTimelineVideoRunInputSchema>,
  story: string,
): CreateEditTimelinePlanInput {
  const duration = input.duration ?? input.maxDurationSeconds
  return {
    goal: story,
    ...(input.timelineId ? { timelineId: input.timelineId } : {}),
    ...(input.title ? { title: input.title } : {}),
    ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
    ...(input.fps !== undefined ? { fps: input.fps } : {}),
    ...(duration !== undefined ? { duration } : {}),
    ...(input.targetDurationMs !== undefined ? { targetDurationMs: input.targetDurationMs } : {}),
    ...(input.shotCount !== undefined ? { shotCount: input.shotCount } : {}),
    ...(input.style ? { style: input.style } : {}),
    ...(input.hasAudio !== undefined ? { hasAudio: input.hasAudio } : {}),
    ...(input.hasSubtitle !== undefined ? { hasSubtitle: input.hasSubtitle } : {}),
    ...(input.outline !== undefined ? { outline: input.outline } : {}),
    ...(input.references ? { references: input.references } : {}),
    ...(input.continuityBible ? { continuityBible: input.continuityBible } : {}),
  }
}

function buildVideoRunCostPreflight(params: {
  shotCount: number
  renderFinalVideo: boolean
}): z.output<typeof startEditTimelineCostPreflightSchema> {
  return {
    providerTaskCount: params.shotCount,
    finalAssemblyCount: params.renderFinalVideo ? 1 : 0,
    billable: true,
    confirmationRequired: true,
    estimateLabel: `provider-video-tasks:${String(params.shotCount)};final-assembly:${params.renderFinalVideo ? '1' : '0'};price:provider-configured`,
  }
}

async function startEditTimelineVideoRun(
  ctx: ProjectAgentOperationContext,
  input: z.output<typeof startEditTimelineVideoRunInputSchema>,
): Promise<z.output<typeof startEditTimelineVideoRunOutputSchema>> {
  if (input.projectId && input.projectId !== ctx.projectId) {
    throw new Error(`EDIT_TIMELINE_VIDEO_RUN_PROJECT_MISMATCH:${input.projectId}:${ctx.projectId}`)
  }

  const story = resolveVideoRunStory(input)
  const planInput = buildPlanInputFromVideoRun(input, story)
  const sourceStory = buildPrompt(planInput)
  const draft = buildDraftTimeline(planInput)
  const timeline = parseEditTimeline(draft.timeline)
  assertBlackboardPromptCoverage({ timeline, blackboard: draft.blackboard })
  const videoModel = await resolveProductionVideoModel({
    ctx,
    explicitVideoModel: input.videoModel,
  })
  assertProductionVideoModelKey(videoModel)
  assertProductionFirstLastFrameModelKey(input.firstLastFrameModel)

  const planningWorkflow = buildProjectAgentWorkflowSnapshot({
    goalText: sourceStory,
    timeline,
    agentCrew: draft.agentCrew,
    blackboard: draft.blackboard,
    risks: draft.risks,
    materializeSkillId: 'media-generation',
    materializeOperationId: 'generate_panel_video',
    videoModel,
    generationOptions: input.generationOptions,
    includeFinalVideoArtifact: true,
  })
  writeTimelinePart(ctx, {
    timeline,
    sourceStory,
    creativeBrief: draft.creativeBrief,
    agentCrew: draft.agentCrew,
    blackboard: draft.blackboard,
    unresolvedRefs: [],
    risks: draft.risks,
    estimatedTaskCount: timeline.shots.length,
    workflow: planningWorkflow,
  })

  const production = await startEditTimelineProductionRun(ctx, {
    confirmed: true,
    timeline,
    blackboard: draft.blackboard,
    episodeId: input.episodeId,
    videoModel,
    firstLastFrameModel: input.firstLastFrameModel,
    mediaRefs: input.mediaRefs,
    generationOptions: input.generationOptions,
    renderFinalVideo: input.renderFinalVideo,
  }, { operationId: START_EDIT_TIMELINE_VIDEO_RUN_OPERATION_ID })

  return {
    ...production,
    runProfile: {
      story,
      aspectRatio: timeline.aspectRatio,
      targetDurationMs: draft.creativeBrief.targetDurationMs,
      shotCount: timeline.shots.length,
      providerProfile: input.providerProfile ?? null,
      videoModel,
    },
    costPreflight: buildVideoRunCostPreflight({
      shotCount: timeline.shots.length,
      renderFinalVideo: input.renderFinalVideo ?? true,
    }),
    nextRequiredAction: production.planRun.success ? 'monitor_plan_run' : 'inspect_failed_plan_run',
  }
}

function writeTimelinePart(ctx: Parameters<ProjectAgentOperationRegistryDraft[string]['execute']>[0], data: EditTimelinePartData): void {
  writeOperationDataPart<EditTimelinePartData>(ctx.writer, 'data-edit-timeline', {
    ...data,
    projectId: ctx.projectId,
    episodeId: ctx.context.episodeId ?? null,
  })
}

function collectAffectedShotIds(timeline: ParsedEditTimeline, targetShotId: string): string[] {
  const affected = new Set<string>([targetShotId])
  let changed = true
  while (changed) {
    changed = false
    for (const shot of timeline.shots) {
      if (affected.has(shot.id)) continue
      if (!shot.dependsOn.some((dependency) => affected.has(dependency))) continue
      affected.add(shot.id)
      changed = true
    }
  }
  return timeline.shots
    .filter((shot) => affected.has(shot.id))
    .map((shot) => shot.id)
}

function stableIdToken(value: string): string {
  const token = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return token || 'manual'
}

function redoTimelineShot(input: z.output<typeof redoTimelineShotInputSchema>): z.output<typeof redoTimelineShotOutputSchema> {
  const timeline = parseEditTimeline(input.timeline)
  const targetShot = timeline.shots.find((shot) => shot.id === input.shotId)
  if (!targetShot) {
    throw new Error(`EDIT_TIMELINE_REDO_SHOT_NOT_FOUND:${input.shotId}`)
  }
  const affectedShotIds = collectAffectedShotIds(timeline, targetShot.id)
  const revision = {
    parentShotId: targetShot.id,
    ...(input.sourceTraceId ? { sourceTraceId: input.sourceTraceId } : {}),
    redoReason: input.redoReason,
    affectedDependencies: targetShot.dependsOn,
  }
  const revisedShots: ShotNode[] = timeline.shots.map((shot) => {
    if (shot.id !== targetShot.id) return shot
    return {
      ...shot,
      control: input.controlPatch
        ? {
            ...shot.control,
            ...input.controlPatch,
          }
        : shot.control,
      revision,
    }
  })
  const revisedTimeline = parseEditTimeline({
    ...timeline,
    shots: revisedShots,
  })
  const revisionToken = stableIdToken(input.sourceTraceId ?? input.redoReason)
  const revisionId = `shot-revision-${targetShot.id}-${revisionToken}`
  return {
    timeline: revisedTimeline,
    redoPlan: {
      targetShotId: targetShot.id,
      affectedShotIds,
      skippedShotIds: timeline.shots
        .map((shot) => shot.id)
        .filter((shotId) => !affectedShotIds.includes(shotId)),
      revisionId,
      revision,
      providerTaskPlan: {
        id: `provider-task-redo-${targetShot.id}-${revisionToken}`,
        shotId: targetShot.id,
        operationId: 'generate_panel_video',
        status: 'planned',
        revisionId,
        redoReason: input.redoReason,
        affectedShotIds,
      },
    },
  }
}

export function createEditTimelineOperations(): ProjectAgentOperationRegistryDraft {
  return {
    create_edit_timeline_plan: defineOperation({
      id: 'create_edit_timeline_plan',
      summary: 'Create an EditTimeline draft from a user goal and explicit planning inputs. Does not submit provider work.',
      intent: 'plan',
      effects: EFFECTS_NONE,
      inputSchema: createEditTimelinePlanInputSchema,
      outputSchema: createEditTimelinePlanOutputSchema,
      execute: async (ctx, input) => {
        const sourceStory = buildPrompt(input)
        const draft = buildDraftTimeline(input)
        const timeline = parseEditTimeline(draft.timeline)
        const workflow = buildProjectAgentWorkflowSnapshot({
          goalText: sourceStory,
          timeline,
          agentCrew: draft.agentCrew,
          blackboard: draft.blackboard,
          risks: draft.risks,
        })
        const result = {
          timeline,
          sourceStory,
          creativeBrief: draft.creativeBrief,
          agentCrew: draft.agentCrew,
          blackboard: draft.blackboard,
          unresolvedRefs: [],
          risks: draft.risks,
          estimatedTaskCount: timeline.shots.length,
          workflow,
        }
        writeTimelinePart(ctx, result)
        return result
      },
    }),
    validate_edit_timeline: defineOperation({
      id: 'validate_edit_timeline',
      summary: 'Validate an EditTimeline and return structured issues without submitting provider work.',
      intent: 'query',
      effects: EFFECTS_NONE,
      inputSchema: validateEditTimelineInputSchema,
      outputSchema: validateEditTimelineOutputSchema,
      execute: async (ctx, input) => {
        try {
          const timeline = parseEditTimeline(input.timeline)
          const result = {
            ok: true,
            issues: [],
            timeline,
          }
          writeTimelinePart(ctx, {
            timeline,
            unresolvedRefs: [],
            risks: [],
            estimatedTaskCount: timeline.shots.length,
            validation: {
              ok: true,
              issues: [],
            },
          })
          return result
        } catch (error) {
          return {
            ok: false,
            issues: [issueFromError(error)],
          }
        }
      },
    }),
    compile_edit_timeline: defineOperation({
      id: 'compile_edit_timeline',
      summary: 'Compile a validated EditTimeline into a PlanRun executable draft. Does not execute the draft.',
      intent: 'plan',
      effects: EFFECTS_NONE,
      inputSchema: compileEditTimelineInputSchema,
      outputSchema: compileEditTimelineOutputSchema,
      execute: async (ctx, input) => {
        const parsedInput = compileEditTimelineInputSchema.parse(input)
        const timeline = parseEditTimeline(parsedInput.timeline)
        const plan = compileTimeline(parsedInput)
        const confirmationSummary = buildEditTimelineConfirmationSummary({
          timeline,
          plan,
        })
        const workflow = buildProjectAgentWorkflowSnapshot({
          goalText: plan.goal,
          timeline,
          blackboard: parsedInput.blackboard,
          risks: confirmationSummary.blockers,
          materializeSkillId: parsedInput.materializeSkillId,
          materializeOperationId: parsedInput.materializeOperationId,
          videoModel: parsedInput.videoModel,
          generationOptions: parsedInput.generationOptions,
          panelIdsByShotId: parsedInput.panelIdsByShotId,
          storyboardId: parsedInput.storyboardId,
          startPanelIndex: parsedInput.startPanelIndex,
          planRunRef: plan.goal,
          includeFinalVideoArtifact: parsedInput.assembleFinalVideo === true,
        })
        const result = {
          plan,
          estimatedStepCount: plan.steps.length,
          confirmationSummary,
          workflow,
          ...(parsedInput.blackboard ? { blackboard: parsedInput.blackboard } : {}),
        }
        writeTimelinePart(ctx, {
          timeline,
          ...(parsedInput.blackboard ? { blackboard: parsedInput.blackboard } : {}),
          unresolvedRefs: confirmationSummary.unresolvedRefs,
          risks: confirmationSummary.blockers,
          estimatedTaskCount: confirmationSummary.providerTaskCount,
          plan: {
            goal: plan.goal,
            estimatedStepCount: plan.steps.length,
          },
          confirmationSummary,
          workflow,
        })
        return result
      },
    }),
    start_edit_timeline_video_run: defineOperation({
      id: START_EDIT_TIMELINE_VIDEO_RUN_OPERATION_ID,
      summary: 'Start the canonical edit-first video run from a natural-language story, then materialize blackboard prompts, submit provider panel videos, and assemble final.video through PlanRun.',
      intent: 'act',
      effects: EFFECTS_PRODUCTION_RUN,
      prerequisites: { episodeId: 'required' },
      confirmation: {
        required: true,
        summary: '将从自然语言故事生成剪辑先行黑板，创建 storyboard/panel，提交真实视频 provider 任务，并在任务完成后组装 final.video；可能消耗额度/产生计费。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: startEditTimelineVideoRunInputSchema,
      outputSchema: startEditTimelineVideoRunOutputSchema,
      execute: async (ctx, input) => startEditTimelineVideoRun(
        ctx,
        startEditTimelineVideoRunInputSchema.parse(input),
      ),
    }),
    start_edit_timeline_production_run: defineOperation({
      id: START_EDIT_TIMELINE_PRODUCTION_RUN_OPERATION_ID,
      summary: 'Materialize exact blackboard prompts into storyboard panels, compile provider video steps, and start the real edit-first PlanRun.',
      intent: 'act',
      effects: EFFECTS_PRODUCTION_RUN,
      prerequisites: { episodeId: 'required' },
      confirmation: {
        required: true,
        summary: '将用剪辑先行黑板创建 storyboard/panel，提交真实视频 provider 任务，并在任务完成后组装 final.video；可能消耗额度/产生计费。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: startEditTimelineProductionRunInputSchema,
      outputSchema: startEditTimelineProductionRunOutputSchema,
      execute: async (ctx, input) => startEditTimelineProductionRun(
        ctx,
        startEditTimelineProductionRunInputSchema.parse(input),
        { operationId: START_EDIT_TIMELINE_PRODUCTION_RUN_OPERATION_ID },
      ),
    }),
    materialize_edit_timeline_storyboard: defineOperation({
      id: 'materialize_edit_timeline_storyboard',
      summary: 'Materialize a generic EditTimeline into project clip, storyboard, and panel records before provider work.',
      intent: 'act',
      effects: EFFECTS_WRITE,
      prerequisites: { episodeId: 'required' },
      confirmation: { required: true },
      inputSchema: materializeEditTimelineStoryboardInputSchema,
      outputSchema: materializeEditTimelineStoryboardOutputSchema,
      execute: async (ctx, input) => materializeTimelineStoryboard(
        ctx,
        materializeEditTimelineStoryboardInputSchema.parse(input),
      ),
    }),
    assemble_timeline_video: defineOperation({
      id: 'assemble_timeline_video',
      summary: 'Assemble generated panel videos from an EditTimeline into a final video artifact and workspace editor project.',
      intent: 'act',
      effects: EFFECTS_ASSEMBLE_FINAL_VIDEO,
      prerequisites: { episodeId: 'required' },
      confirmation: { required: true },
      inputSchema: assembleTimelineVideoInputSchema,
      outputSchema: assembleTimelineVideoOutputSchema,
      execute: async (ctx, input) => assembleTimelineVideo(
        ctx,
        assembleTimelineVideoInputSchema.parse(input),
      ),
    }),
    score_edit_timeline_trace: defineOperation({
      id: 'score_edit_timeline_trace',
      summary: 'Score persisted edit-first PlanRun trace evidence without changing project data.',
      intent: 'query',
      effects: EFFECTS_NONE,
      inputSchema: scoreEditTimelineTraceInputSchema,
      outputSchema: scoreEditTimelineTraceOutputSchema,
      execute: async (ctx, input) => {
        if ('planRunId' in input) {
          const snapshot = await getPlanRunSnapshot(input.planRunId)
          if (!snapshot || snapshot.planRun.userId !== ctx.userId) {
            throw new Error(`PLAN_RUN_NOT_FOUND:${input.planRunId}`)
          }
          const traceSummary = await getPlanRunTraceSummary({
            userId: ctx.userId,
            planRunId: input.planRunId,
            limit: input.eventLimit,
          })
          return scoreEditTimelineSinglePlanRunTrace({
            planRunId: input.planRunId,
            snapshot,
            traceSummary,
          })
        }
        const grade = await gradePersistedEditFirstPlanRunTraceRound({
          userId: ctx.userId,
          initialPlanRunId: input.initialPlanRunId,
          resumePlanRunId: input.resumePlanRunId,
          expectedOperationId: input.expectedOperationId,
          expectedMessageIncludes: input.expectedMessageIncludes,
          eventLimit: input.eventLimit,
          before: input.before,
          after: input.after,
          fixedPriority: input.fixedPriority,
          capturedNewIssue: input.capturedNewIssue,
        })
        return {
          traceEvalPassRate: grade.traceEvalPassRate,
          passed: grade.comparison.effective,
          blockers: grade.comparison.blockers,
          grade,
        }
      },
    }),
    redo_timeline_shot: defineOperation({
      id: 'redo_timeline_shot',
      summary: 'Create a local redo plan for one EditTimeline shot, preserving revision metadata and affected dependencies. Does not submit provider work.',
      intent: 'plan',
      effects: EFFECTS_NONE,
      inputSchema: redoTimelineShotInputSchema,
      outputSchema: redoTimelineShotOutputSchema,
      execute: async (ctx, input) => {
        const result = redoTimelineShot(input)
        writeTimelinePart(ctx, {
          timeline: result.timeline,
          unresolvedRefs: [],
          risks: [],
          estimatedTaskCount: result.redoPlan.affectedShotIds.length,
          validation: {
            ok: true,
            issues: [],
          },
        })
        return result
      },
    }),
  }
}
