import { getPlanRunTraceSummary } from '@/lib/plan-run-runtime/service'
import {
  gradeEditFirstPlanRunTraceRound,
  type EditFirstPlanRunTraceRoundGrade,
} from './scorecard'
import type { CampaignIssuePriority, CampaignScoreInput } from './types'

export interface PersistedEditFirstPlanRunTraceRoundInput {
  userId: string
  initialPlanRunId: string
  resumePlanRunId: string
  expectedOperationId: string
  expectedMessageIncludes?: string
  eventLimit?: number
  before: CampaignScoreInput
  after: CampaignScoreInput
  fixedPriority?: CampaignIssuePriority | null
  capturedNewIssue?: boolean
}

export async function gradePersistedEditFirstPlanRunTraceRound(
  input: PersistedEditFirstPlanRunTraceRoundInput,
): Promise<EditFirstPlanRunTraceRoundGrade> {
  const [initialSummary, resumeSummary] = await Promise.all([
    getPlanRunTraceSummary({
      planRunId: input.initialPlanRunId,
      userId: input.userId,
      ...(input.eventLimit === undefined ? {} : { limit: input.eventLimit }),
    }),
    getPlanRunTraceSummary({
      planRunId: input.resumePlanRunId,
      userId: input.userId,
      ...(input.eventLimit === undefined ? {} : { limit: input.eventLimit }),
    }),
  ])

  return gradeEditFirstPlanRunTraceRound({
    initial: {
      summary: initialSummary,
      expectedOperationId: input.expectedOperationId,
      expectedMessageIncludes: input.expectedMessageIncludes,
    },
    resume: {
      summary: resumeSummary,
      expectedOperationId: input.expectedOperationId,
      expectedMessageIncludes: input.expectedMessageIncludes,
    },
    before: input.before,
    after: input.after,
    fixedPriority: input.fixedPriority,
    capturedNewIssue: input.capturedNewIssue,
  })
}
