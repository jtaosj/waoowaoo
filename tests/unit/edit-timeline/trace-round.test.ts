import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gradePersistedEditFirstPlanRunTraceRound } from '@/lib/edit-timeline/trace-round'
import { buildPlanRunTraceSummary } from '@/lib/plan-run-runtime/trace-summary'
import { PLAN_RUN_EVENT_TYPE } from '@/lib/plan-run-runtime/types'

const serviceState = vi.hoisted(() => ({
  getPlanRunTraceSummary: vi.fn(),
}))

vi.mock('@/lib/plan-run-runtime/service', () => ({
  getPlanRunTraceSummary: serviceState.getPlanRunTraceSummary,
}))

describe('persisted edit-first PlanRun trace round grading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads persisted initial and resume trace summaries before grading the campaign round', async () => {
    const initialSummary = buildPlanRunTraceSummary([
      {
        id: 'event-initial-start',
        planRunId: 'run-initial',
        projectId: 'project-1',
        userId: 'user-1',
        seq: 1,
        eventType: PLAN_RUN_EVENT_TYPE.STEP_START,
        stepKey: 'video',
        payload: { operationId: 'generate_panel_video' },
        createdAt: '2026-05-08T01:00:00.000Z',
      },
      {
        id: 'event-initial-error',
        planRunId: 'run-initial',
        projectId: 'project-1',
        userId: 'user-1',
        seq: 2,
        eventType: PLAN_RUN_EVENT_TYPE.STEP_ERROR,
        stepKey: 'video',
        payload: {
          errorCode: 'PLAN_STEP_INPUT_BUILD_FAILED',
          message: 'EDIT_TIMELINE_GENERATE_PANEL_VIDEO_LAST_FRAME_UNRESOLVED:media:last-frame',
        },
        createdAt: '2026-05-08T01:00:01.000Z',
      },
    ])
    const resumeSummary = buildPlanRunTraceSummary([
      {
        id: 'event-resume-start',
        planRunId: 'run-resume',
        projectId: 'project-1',
        userId: 'user-1',
        seq: 1,
        eventType: PLAN_RUN_EVENT_TYPE.STEP_START,
        stepKey: 'video',
        payload: { operationId: 'generate_panel_video' },
        createdAt: '2026-05-08T01:10:00.000Z',
      },
      {
        id: 'event-resume-error',
        planRunId: 'run-resume',
        projectId: 'project-1',
        userId: 'user-1',
        seq: 2,
        eventType: PLAN_RUN_EVENT_TYPE.STEP_ERROR,
        stepKey: 'video',
        payload: {
          errorCode: 'PLAN_STEP_INPUT_BUILD_FAILED',
          message: 'EDIT_TIMELINE_GENERATE_PANEL_VIDEO_LAST_FRAME_UNRESOLVED:media:last-frame',
        },
        createdAt: '2026-05-08T01:10:01.000Z',
      },
    ])

    serviceState.getPlanRunTraceSummary
      .mockResolvedValueOnce(initialSummary)
      .mockResolvedValueOnce(resumeSummary)

    const grade = await gradePersistedEditFirstPlanRunTraceRound({
      userId: 'user-1',
      initialPlanRunId: 'run-initial',
      resumePlanRunId: 'run-resume',
      expectedOperationId: 'generate_panel_video',
      expectedMessageIncludes: 'media:last-frame',
      eventLimit: 50,
      before: {
        safetyGates: 20,
        timelineCorrectness: 20,
        planRunRuntime: 14,
        providerPayload: 15,
        evalQuality: 14,
        agentUxContract: 9,
        researchQuality: 5,
      },
      after: {
        safetyGates: 20,
        timelineCorrectness: 20,
        planRunRuntime: 15,
        providerPayload: 15,
        evalQuality: 15,
        agentUxContract: 10,
        researchQuality: 5,
      },
      capturedNewIssue: true,
    })

    expect(serviceState.getPlanRunTraceSummary).toHaveBeenNthCalledWith(1, {
      planRunId: 'run-initial',
      userId: 'user-1',
      limit: 50,
    })
    expect(serviceState.getPlanRunTraceSummary).toHaveBeenNthCalledWith(2, {
      planRunId: 'run-resume',
      userId: 'user-1',
      limit: 50,
    })
    expect(grade.traceEvalPassRate).toBe(100)
    expect(grade.initial.passed).toBe(true)
    expect(grade.resume.passed).toBe(true)
    expect(grade.comparison).toMatchObject({
      blockers: [],
      effective: true,
    })
  })
})
