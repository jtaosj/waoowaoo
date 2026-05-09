import type { UIMessage } from 'ai'
import type {
  EditTimelineBlackboard,
  EditTimelineConfirmationSummary,
  ParsedEditTimeline,
} from '@/lib/edit-timeline'
import type { ProjectContextSnapshot } from '@/lib/project-context/types'
import type { ProjectPhase, ProjectPhaseSnapshot } from './project-phase'
import type { PlanValidationIssue } from '@/lib/agent-skills/types'

export type UnknownObject = { [key: string]: unknown }

export type ProjectAssistantId = 'workspace-command'

export type ProjectAgentInteractionMode = 'auto' | 'plan' | 'fast'

export interface ProjectAgentContext {
  locale?: string
  episodeId?: string | null
  currentStage?: string | null
  selectedScopeRef?: string | null
  selectedPanelId?: string | null
  selectedClipId?: string | null
  selectedAssetId?: string | null
  interactionMode?: ProjectAgentInteractionMode
}

export interface ProjectContextPartData {
  context: ProjectAssistantContextSnapshot
}

export interface ProjectPhasePartData {
  phase: ProjectPhase
  snapshot: ProjectPhaseSnapshot
}

export interface ProjectAgentStopPartData {
  reason: 'step_cap'
  stepCount: number
  maxSteps: number
}

export interface AgentPlanPartData {
  draftPlanId: string
  goal: string
  summary: string
  requiresApproval: boolean
  validation: {
    ok: boolean
    issues: PlanValidationIssue[]
  }
  steps: Array<{
    stepKey: string
    skillId: string
    reason: string
    operationId: string
    inputArtifacts: string[]
    outputArtifacts: string[]
    dependsOn: string[]
    requiresApproval: boolean
  }>
}

export interface AgentDebugPartData {
  requestId: string
  interactionMode: ProjectAgentInteractionMode
  routedIntent: 'query' | 'plan' | 'act'
  effectiveIntent: 'query' | 'plan' | 'act'
  requestedGroups: string[][]
  alwaysOnOperationIds: string[]
  operationIds: string[]
}

export interface EditTimelineCreativeBrief {
  theme: string
  protagonist: string
  setting: string
  mood: string
  twist: string
  targetDurationMs: number
  aspectRatio: string
  missingInfo: string[]
  assumptions: string[]
}

export type EditTimelineAgentRole =
  | 'main-director'
  | 'visual-director'
  | 'story-editor'
  | 'sound-designer'
  | 'subtitle-writer'
  | 'screenplay-agent'
  | 'cinematography-agent'
  | 'continuity-agent'
  | 'prompt-engineer-agent'
  | 'sound-agent'

export interface EditTimelineAgentOutput {
  shotId: string
  text: string
}

export interface EditTimelineAgentContribution {
  agentId: string
  role: EditTimelineAgentRole
  title: string
  mission: string
  summary: string
  shotIds: string[]
  outputs: EditTimelineAgentOutput[]
  status: 'drafted' | 'needs-review'
}

export interface EditTimelineAgentCrew {
  director: EditTimelineAgentContribution
  subagents: EditTimelineAgentContribution[]
  synthesis: string
}

export type ProjectAgentWorkflowIntent =
  | 'story-generation'
  | 'storyboard-generation'
  | 'video-generation'
  | 'asset-planning'
  | 'edit-timeline'
  | 'voice-subtitle'
  | 'failure-recovery'
  | 'continue-project'

export type ProjectAgentWorkflowStatus =
  | 'planned'
  | 'blocked'
  | 'submitted'
  | 'running'
  | 'succeeded'
  | 'failed'

export interface ProjectAgentWorkflowShot {
  shotId: string
  segmentId: string
  title: string
  goal: string
  startMs: number
  durationMs: number
}

export interface ProjectAgentWorkflowAsset {
  id: string
  kind: 'character' | 'location' | 'style' | 'prop' | 'reference' | 'source-frame'
  label: string
  status: 'available' | 'missing' | 'planned'
  source: 'user-reference' | 'timeline-reference' | 'text-only'
  artifactRef?: string | null
}

export interface ProjectAgentWorkflowProviderTaskTarget {
  panelId?: string
  storyboardId?: string
  panelIndex?: number
}

export type ProjectAgentWorkflowGenerationOptionValue = string | number | boolean

export interface ProjectAgentWorkflowProviderTask {
  id: string
  shotId: string
  operationId: string
  skillId: string
  status: ProjectAgentWorkflowStatus
  requiredModelType: 'video' | 'image' | 'audio' | 'music' | 'voice' | 'analysis'
  providerModel?: string | null
  outputUrl?: string | null
  generationOptions?: Record<string, ProjectAgentWorkflowGenerationOptionValue>
  target: ProjectAgentWorkflowProviderTaskTarget | null
  assetPolicy: 'text-to-video' | 'image-to-video' | 'first-last-frame' | 'requires-asset'
  blockers: string[]
}

export interface ProjectAgentWorkflowTrace {
  stage: string
  status: 'planned' | 'passed' | 'blocked'
  message: string
  refs: string[]
}

export interface ProjectAgentWorkflowEvalCheck {
  code: string
  status: 'passed' | 'warning' | 'blocked'
  message: string
}

export interface ProjectAgentWorkflowEval {
  id: string
  checks: ProjectAgentWorkflowEvalCheck[]
}

export interface ProjectAgentWorkflowArtifact {
  id: string
  kind: 'timeline' | 'shot' | 'plan-run' | 'provider-task' | 'video' | 'diagnostic'
  status: ProjectAgentWorkflowStatus
  ref?: string | null
}

export interface ProjectAgentWorkflowSnapshot {
  intent: ProjectAgentWorkflowIntent
  skillIds: string[]
  timelineId: string
  blackboard?: EditTimelineBlackboard
  shots: ProjectAgentWorkflowShot[]
  assets: ProjectAgentWorkflowAsset[]
  providerTasks: ProjectAgentWorkflowProviderTask[]
  traces: ProjectAgentWorkflowTrace[]
  evals: ProjectAgentWorkflowEval[]
  artifacts: ProjectAgentWorkflowArtifact[]
}

export interface EditTimelinePartData {
  projectId?: string
  episodeId?: string | null
  timeline: ParsedEditTimeline
  sourceStory?: string
  creativeBrief?: EditTimelineCreativeBrief
  agentCrew?: EditTimelineAgentCrew
  blackboard?: EditTimelineBlackboard
  workflow?: ProjectAgentWorkflowSnapshot
  unresolvedRefs: string[]
  risks: Array<{
    code: string
    message: string
  }>
  estimatedTaskCount: number
  validation?: {
    ok: boolean
    issues: Array<{
      code: string
      message: string
    }>
  }
  plan?: {
    goal: string
    estimatedStepCount: number
  }
  confirmationSummary?: EditTimelineConfirmationSummary
}

export interface AgentRuntimeContextPartData {
  requestId: string
  modelKey: string
  locale: string
  projectId: string
  episodeId?: string | null
  interactionMode: ProjectAgentInteractionMode
  systemPrompt: string
  rawMessages: unknown
  runtimeMessages: unknown
  modelMessages: unknown
  projectContext: ProjectAgentContext
  projectPhase: unknown
  route: unknown
  selectedTools: Array<{
    operationId: string
    description: string
  }>
}

export interface ConfirmationRequestPartData {
  operationId: string
  summary: string
  argsHint?: UnknownObject | null
  budget?: {
    key?: string
    estimatedCostUnits?: number
  } | null
}

export interface TaskSubmittedPartData {
  operationId: string
  taskId: string
  status: string
  runId?: string | null
  deduped?: boolean
  mutationBatchId?: string | null
}

export interface TaskBatchSubmittedPartData {
  operationId: string
  total: number
  taskIds: string[]
  results?: Array<{
    refId: string
    taskId: string
  }>
  mutationBatchId?: string | null
}

export interface PlanRunSubmittedPartData {
  operationId: string
  planRunId: string
  status: string
  executedStepKeys: string[]
  waitingTaskId?: string | null
}

export interface ProjectAssistantContextSnapshot {
  projectId: string
  projectName: string
  episodeId?: string | null
  episodeName?: string | null
  currentStage?: string | null
  selectedScopeRef?: string | null
  selectedPanelId?: string | null
  selectedClipId?: string | null
  selectedAssetId?: string | null
  activePlanRuns: ProjectContextSnapshot['activePlanRuns']
  activeOperationTasks: ProjectContextSnapshot['activeOperationTasks']
  recentOperationResults: ProjectContextSnapshot['recentOperationResults']
  latestArtifacts: ProjectContextSnapshot['latestArtifacts']
  config: {
    analysisModel?: string | null
    videoModel?: string | null
    artStyle: string
    videoRatio: string
  }
}

export interface ProjectAssistantThreadSnapshot {
  id: string
  assistantId: ProjectAssistantId
  projectId: string
  episodeId?: string | null
  scopeRef: string
  messages: UIMessage[]
  createdAt: string
  updatedAt: string
}

export type WorkspaceAssistantPartType =
  | 'data-agent-debug'
  | 'data-agent-runtime-context'
  | 'data-agent-stop'
  | 'data-project-phase'
  | 'data-confirmation-request'
  | 'data-task-submitted'
  | 'data-task-batch-submitted'
  | 'data-plan-run-submitted'
  | 'data-edit-timeline'
  | 'data-plan'
  | 'data-project-context'
