import { describe, expect, it } from 'vitest'
import {
  calculateCampaignScore,
  compareCampaignScores,
  gradeEditFirstPlanRunTraceRound,
} from '@/lib/edit-timeline'
import { buildPlanRunTraceSummary } from '@/lib/plan-run-runtime/trace-summary'
import { PLAN_RUN_EVENT_TYPE } from '@/lib/plan-run-runtime/types'

describe('edit-first campaign scorecard', () => {
  it('calculates the weighted campaign score from measurable dimensions', () => {
    const result = calculateCampaignScore({
      safetyGates: 20,
      timelineCorrectness: 18,
      planRunRuntime: 14,
      providerPayload: 12,
      evalQuality: 10,
      agentUxContract: 8,
      researchQuality: 4,
      metrics: {
        targetedTestPassRate: 100,
        hiddenFallbackCount: 0,
        bannedFixedWorkflowReferenceCount: 0,
      },
    })

    expect(result).toEqual({
      total: 86,
      dimensions: {
        safetyGates: 20,
        timelineCorrectness: 18,
        planRunRuntime: 14,
        providerPayload: 12,
        evalQuality: 10,
        agentUxContract: 8,
        researchQuality: 4,
      },
      blockers: [],
      metrics: {
        targetedTestPassRate: 100,
        hiddenFallbackCount: 0,
        bannedFixedWorkflowReferenceCount: 0,
      },
    })
  })

  it('marks a round effective when it improves score by at least five points', () => {
    const comparison = compareCampaignScores({
      before: {
        safetyGates: 18,
        timelineCorrectness: 10,
        planRunRuntime: 8,
        providerPayload: 8,
        evalQuality: 6,
        agentUxContract: 6,
        researchQuality: 3,
      },
      after: {
        safetyGates: 20,
        timelineCorrectness: 16,
        planRunRuntime: 10,
        providerPayload: 9,
        evalQuality: 7,
        agentUxContract: 6,
        researchQuality: 3,
      },
    })

    expect(comparison).toMatchObject({
      beforeTotal: 59,
      afterTotal: 71,
      delta: 12,
      effective: true,
    })
    expect(comparison.reasons).toContain('score_delta_at_least_5')
  })

  it('blocks success when hidden fallback or fixed workflow references are detected', () => {
    const comparison = compareCampaignScores({
      before: {
        safetyGates: 10,
        timelineCorrectness: 10,
        planRunRuntime: 10,
        providerPayload: 10,
        evalQuality: 10,
        agentUxContract: 5,
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
        metrics: {
          hiddenFallbackCount: 1,
          bannedFixedWorkflowReferenceCount: 1,
          targetedTestPassRate: 100,
        },
      },
    })

    expect(comparison).toMatchObject({
      afterTotal: 100,
      effective: false,
      blockers: ['hidden_fallback_detected', 'banned_fixed_workflow_reference_detected'],
    })
  })

  it('accepts a lower score delta when a P0 or P1 issue was fixed', () => {
    const comparison = compareCampaignScores({
      before: {
        safetyGates: 20,
        timelineCorrectness: 15,
        planRunRuntime: 12,
        providerPayload: 12,
        evalQuality: 12,
        agentUxContract: 8,
        researchQuality: 4,
      },
      after: {
        safetyGates: 20,
        timelineCorrectness: 16,
        planRunRuntime: 12,
        providerPayload: 12,
        evalQuality: 12,
        agentUxContract: 8,
        researchQuality: 4,
      },
      fixedPriority: 'P1',
    })

    expect(comparison).toMatchObject({
      delta: 1,
      effective: true,
    })
    expect(comparison.reasons).toContain('fixed_high_priority_issue')
  })

  it('grades initial and resume input-build traces through the campaign scorecard', () => {
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

    const grade = gradeEditFirstPlanRunTraceRound({
      initial: {
        summary: initialSummary,
        expectedOperationId: 'generate_panel_video',
        expectedMessageIncludes: 'media:last-frame',
      },
      resume: {
        summary: resumeSummary,
        expectedOperationId: 'generate_panel_video',
        expectedMessageIncludes: 'media:last-frame',
      },
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

    expect(grade.traceEvalPassRate).toBe(100)
    expect(grade.initial.passed).toBe(true)
    expect(grade.resume.passed).toBe(true)
    expect(grade.comparison.after.metrics.traceEvalPassRate).toBe(100)
    expect(grade.comparison).toMatchObject({
      afterTotal: 100,
      blockers: [],
      effective: true,
    })
    expect(grade.comparison.reasons).toContain('captured_new_issue')
  })

  it('blocks campaign effectiveness when a resume trace hides the input-build failure', () => {
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
        },
        createdAt: '2026-05-08T01:10:01.000Z',
      },
    ])

    const grade = gradeEditFirstPlanRunTraceRound({
      initial: {
        summary: initialSummary,
        expectedOperationId: 'generate_panel_video',
        expectedMessageIncludes: 'media:last-frame',
      },
      resume: {
        summary: resumeSummary,
        expectedOperationId: 'generate_panel_video',
        expectedMessageIncludes: 'media:last-frame',
      },
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

    expect(grade.traceEvalPassRate).toBe(66.67)
    expect(grade.resume.issues).toEqual(['input_build_failure_not_visible', 'malformed_error_event'])
    expect(grade.comparison).toMatchObject({
      effective: false,
      blockers: ['trace_eval_not_passing'],
    })
  })
})
