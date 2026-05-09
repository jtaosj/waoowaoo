import { describe, expect, it } from 'vitest'
import { PLAN_RUN_EVENT_TYPE } from '@/lib/plan-run-runtime/types'
import {
  buildPlanRunTraceSummary,
  evaluatePlanRunInputBuildFailureTrace,
} from '@/lib/plan-run-runtime/trace-summary'

describe('plan run trace summary', () => {
  it('normalizes initial and resume input-build failures into the same eval signature', () => {
    const initialTrace = buildPlanRunTraceSummary([
      {
        id: 'event-1',
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
        id: 'event-2',
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

    const resumeTrace = buildPlanRunTraceSummary([
      {
        id: 'event-9',
        planRunId: 'run-resume',
        projectId: 'project-1',
        userId: 'user-1',
        seq: 9,
        eventType: PLAN_RUN_EVENT_TYPE.STEP_START,
        stepKey: 'video',
        payload: { operationId: 'generate_panel_video' },
        createdAt: '2026-05-08T01:05:00.000Z',
      },
      {
        id: 'event-10',
        planRunId: 'run-resume',
        projectId: 'project-1',
        userId: 'user-1',
        seq: 10,
        eventType: PLAN_RUN_EVENT_TYPE.STEP_ERROR,
        stepKey: 'video',
        payload: {
          errorCode: 'PLAN_STEP_INPUT_BUILD_FAILED',
          message: 'EDIT_TIMELINE_GENERATE_PANEL_VIDEO_LAST_FRAME_UNRESOLVED:media:last-frame',
        },
        createdAt: '2026-05-08T01:05:01.000Z',
      },
    ])

    expect(initialTrace.inputBuildFailures).toEqual([
      {
        stepKey: 'video',
        operationId: 'generate_panel_video',
        errorCode: 'PLAN_STEP_INPUT_BUILD_FAILED',
        message: 'EDIT_TIMELINE_GENERATE_PANEL_VIDEO_LAST_FRAME_UNRESOLVED:media:last-frame',
      },
    ])
    expect(resumeTrace.inputBuildFailures).toEqual(initialTrace.inputBuildFailures)
    expect(initialTrace.hasInputBuildFailure).toBe(true)
    expect(resumeTrace.hasInputBuildFailure).toBe(true)
    expect(initialTrace.firstError).toEqual({
      stepKey: 'video',
      operationId: 'generate_panel_video',
      errorCode: 'PLAN_STEP_INPUT_BUILD_FAILED',
      message: 'EDIT_TIMELINE_GENERATE_PANEL_VIDEO_LAST_FRAME_UNRESOLVED:media:last-frame',
    })
  })

  it('records malformed step.error events instead of hiding eval gaps', () => {
    const summary = buildPlanRunTraceSummary([
      {
        id: 'event-1',
        planRunId: 'run-1',
        projectId: 'project-1',
        userId: 'user-1',
        seq: 1,
        eventType: PLAN_RUN_EVENT_TYPE.STEP_ERROR,
        stepKey: 'video',
        payload: { message: 'missing code' },
        createdAt: '2026-05-08T01:00:00.000Z',
      },
    ])

    expect(summary.malformedErrorEvents).toEqual([
      {
        seq: 1,
        stepKey: 'video',
        reason: 'missing errorCode',
      },
    ])
    expect(summary.hasInputBuildFailure).toBe(false)
  })

  it('scores operation selection, input-build visibility, and malformed-event risk from one summary', () => {
    const summary = buildPlanRunTraceSummary([
      {
        id: 'event-1',
        planRunId: 'run-1',
        projectId: 'project-1',
        userId: 'user-1',
        seq: 1,
        eventType: PLAN_RUN_EVENT_TYPE.STEP_START,
        stepKey: 'video',
        payload: { operationId: 'generate_panel_video' },
        createdAt: '2026-05-08T01:00:00.000Z',
      },
      {
        id: 'event-2',
        planRunId: 'run-1',
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

    const evaluation = evaluatePlanRunInputBuildFailureTrace({
      summary,
      expectedOperationId: 'generate_panel_video',
      expectedMessageIncludes: 'media:last-frame',
    })

    expect(evaluation).toEqual({
      passed: true,
      score: 3,
      maxScore: 3,
      checks: {
        operationSelected: true,
        inputBuildFailureVisible: true,
        malformedErrorEventsAbsent: true,
      },
      issues: [],
      matchedFailure: {
        stepKey: 'video',
        operationId: 'generate_panel_video',
        errorCode: 'PLAN_STEP_INPUT_BUILD_FAILED',
        message: 'EDIT_TIMELINE_GENERATE_PANEL_VIDEO_LAST_FRAME_UNRESOLVED:media:last-frame',
      },
    })
  })
})
