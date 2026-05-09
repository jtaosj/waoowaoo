import {
  campaignScoreInputSchema,
  type CampaignIssuePriority,
  type CampaignScoreBlocker,
  type CampaignScoreDimensions,
  type CampaignScoreInput,
  type CampaignScoreMetrics,
} from './types'
import {
  evaluatePlanRunInputBuildFailureTrace,
  type PlanRunInputBuildFailureTraceEvaluation,
  type PlanRunInputBuildFailureTraceEvaluationInput,
} from '@/lib/plan-run-runtime/trace-summary'

export interface CampaignScoreResult {
  total: number
  dimensions: CampaignScoreDimensions
  blockers: CampaignScoreBlocker[]
  metrics: CampaignScoreMetrics
}

export interface CampaignScoreComparisonInput {
  before: CampaignScoreInput
  after: CampaignScoreInput
  fixedPriority?: CampaignIssuePriority | null
  capturedNewIssue?: boolean
}

export interface CampaignScoreComparison {
  beforeTotal: number
  afterTotal: number
  delta: number
  effective: boolean
  blockers: CampaignScoreBlocker[]
  reasons: string[]
  before: CampaignScoreResult
  after: CampaignScoreResult
}

export interface EditFirstPlanRunTraceRoundInput {
  initial: PlanRunInputBuildFailureTraceEvaluationInput
  resume: PlanRunInputBuildFailureTraceEvaluationInput
  before: CampaignScoreInput
  after: CampaignScoreInput
  fixedPriority?: CampaignIssuePriority | null
  capturedNewIssue?: boolean
}

export interface EditFirstPlanRunTraceRoundGrade {
  traceEvalPassRate: number
  initial: PlanRunInputBuildFailureTraceEvaluation
  resume: PlanRunInputBuildFailureTraceEvaluation
  comparison: CampaignScoreComparison
}

function parseCampaignScoreInput(input: CampaignScoreInput): CampaignScoreDimensions & {
  metrics?: CampaignScoreMetrics
} {
  const parsed = campaignScoreInputSchema.safeParse(input)
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.length ? issue.path.join('.') : 'root'}:${issue.message}`)
      .join('|')
    throw new Error(`CAMPAIGN_SCORE_INVALID:${details}`)
  }
  return parsed.data
}

function roundScore(value: number): number {
  return Number(value.toFixed(2))
}

function collectBlockers(metrics: CampaignScoreMetrics): CampaignScoreBlocker[] {
  const blockers: CampaignScoreBlocker[] = []
  if (metrics.targetedTestPassRate !== undefined && metrics.targetedTestPassRate < 100) {
    blockers.push('targeted_tests_not_passing')
  }
  if (metrics.traceEvalPassRate !== undefined && metrics.traceEvalPassRate < 100) {
    blockers.push('trace_eval_not_passing')
  }
  if ((metrics.hiddenFallbackCount ?? 0) > 0) {
    blockers.push('hidden_fallback_detected')
  }
  if ((metrics.bannedFixedWorkflowReferenceCount ?? 0) > 0) {
    blockers.push('banned_fixed_workflow_reference_detected')
  }
  if ((metrics.unresolvedP0Count ?? 0) > 0 || (metrics.unresolvedP1Count ?? 0) > 0) {
    blockers.push('unresolved_high_priority_issue')
  }
  return blockers
}

export function calculateCampaignScore(input: CampaignScoreInput): CampaignScoreResult {
  const parsed = parseCampaignScoreInput(input)
  const metrics = parsed.metrics ?? {}
  const dimensions: CampaignScoreDimensions = {
    safetyGates: parsed.safetyGates,
    timelineCorrectness: parsed.timelineCorrectness,
    planRunRuntime: parsed.planRunRuntime,
    providerPayload: parsed.providerPayload,
    evalQuality: parsed.evalQuality,
    agentUxContract: parsed.agentUxContract,
    researchQuality: parsed.researchQuality,
  }
  const total = roundScore(
    dimensions.safetyGates
      + dimensions.timelineCorrectness
      + dimensions.planRunRuntime
      + dimensions.providerPayload
      + dimensions.evalQuality
      + dimensions.agentUxContract
      + dimensions.researchQuality,
  )

  return {
    total,
    dimensions,
    blockers: collectBlockers(metrics),
    metrics,
  }
}

function isHighPriority(priority: CampaignIssuePriority | null | undefined): boolean {
  return priority === 'P0' || priority === 'P1'
}

export function compareCampaignScores(input: CampaignScoreComparisonInput): CampaignScoreComparison {
  const before = calculateCampaignScore(input.before)
  const after = calculateCampaignScore(input.after)
  const delta = roundScore(after.total - before.total)
  const reasons: string[] = []

  if (delta >= 5) reasons.push('score_delta_at_least_5')
  if (isHighPriority(input.fixedPriority)) reasons.push('fixed_high_priority_issue')
  if (input.capturedNewIssue) reasons.push('captured_new_issue')

  const blockers = after.blockers
  return {
    beforeTotal: before.total,
    afterTotal: after.total,
    delta,
    effective: blockers.length === 0 && reasons.length > 0,
    blockers,
    reasons,
    before,
    after,
  }
}

export function gradeEditFirstPlanRunTraceRound(
  input: EditFirstPlanRunTraceRoundInput,
): EditFirstPlanRunTraceRoundGrade {
  const initial = evaluatePlanRunInputBuildFailureTrace(input.initial)
  const resume = evaluatePlanRunInputBuildFailureTrace(input.resume)
  const earnedTraceScore = initial.score + resume.score
  const maxTraceScore = initial.maxScore + resume.maxScore
  const traceEvalPassRate = roundScore((earnedTraceScore / maxTraceScore) * 100)
  const afterWithTraceMetric: CampaignScoreInput = {
    ...input.after,
    metrics: {
      ...input.after.metrics,
      traceEvalPassRate,
    },
  }

  return {
    traceEvalPassRate,
    initial,
    resume,
    comparison: compareCampaignScores({
      before: input.before,
      after: afterWithTraceMetric,
      fixedPriority: input.fixedPriority,
      capturedNewIssue: input.capturedNewIssue,
    }),
  }
}
