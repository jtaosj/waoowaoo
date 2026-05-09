import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { createProjectAgentOperationRegistryForApi } from '@/lib/operations/registry'
import type {
  ProjectAgentOperationContext,
  ProjectAgentOperationDefinition,
} from '@/lib/operations/types'
import { getPlanRunSnapshot, getPlanRunTraceSummary } from '@/lib/plan-run-runtime/service'
import type { PlanRunTraceSummary } from '@/lib/plan-run-runtime/trace-summary'
import { PLAN_RUN_STATUS, PLAN_STEP_STATUS } from '@/lib/plan-run-runtime/types'

vi.mock('@/lib/plan-run-runtime/service', () => ({
  createPlanArtifact: vi.fn(),
  getPlanRunSnapshot: vi.fn(),
  getPlanRunTraceSummary: vi.fn(),
}))

type PlanRunSnapshot = NonNullable<Awaited<ReturnType<typeof getPlanRunSnapshot>>>

const NOW = '2026-05-09T00:00:00.000Z'

function buildContext(): ProjectAgentOperationContext {
  return {
    request: new Request('http://localhost') as unknown as NextRequest,
    userId: 'user-1',
    projectId: 'project-1',
    context: { episodeId: 'episode-1', locale: 'zh' },
    source: 'assistant-panel',
    writer: {
      write: () => undefined,
      merge: () => undefined,
      onError: () => undefined,
    } as unknown as ProjectAgentOperationContext['writer'],
  }
}

function loadOperation(operationId: string): ProjectAgentOperationDefinition {
  const registry = createProjectAgentOperationRegistryForApi()
  const operation = registry[operationId]
  expect(operation).toBeDefined()
  if (!operation) {
    throw new Error(`TEST_OPERATION_MISSING:${operationId}`)
  }
  return operation
}

function buildSnapshotWithFinalVideoArtifact(): PlanRunSnapshot {
  return {
    planRun: {
      id: 'plan-run-final-video-1',
      userId: 'user-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      commandId: null,
      planId: 'plan-1',
      goal: 'assemble a short edit-first video',
      status: PLAN_RUN_STATUS.COMPLETED,
      currentStepKey: null,
      errorCode: null,
      errorMessage: null,
      cancelRequestedAt: null,
      queuedAt: NOW,
      startedAt: NOW,
      finishedAt: NOW,
      lastSeq: 3,
      createdAt: NOW,
      updatedAt: NOW,
    },
    steps: [
      {
        id: 'step-panel-video-1',
        planRunId: 'plan-run-final-video-1',
        stepKey: 'panel_video_1',
        skillId: 'edit-first-video-director',
        operationId: 'generate_panel_video',
        taskId: 'task-panel-video-1',
        status: PLAN_STEP_STATUS.COMPLETED,
        stepIndex: 0,
        stepTotal: 2,
        dependsOn: [],
        inputArtifacts: [],
        outputArtifacts: ['panel.video'],
        input: {
          promptPackage: {
            providerPrompt: 'Ava opens the door in one readable action.',
            imagePrompt: 'Ava visible in the same jacket at the door.',
          },
          controlPayload: {
            prompt: 'Ava opens the door in one readable action.',
          },
        },
        output: {
          outputUrl: 'https://cdn.example.test/panel-video-1.mp4',
        },
        errorCode: null,
        errorMessage: null,
        startedAt: NOW,
        finishedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'step-assemble-final-video',
        planRunId: 'plan-run-final-video-1',
        stepKey: 'assemble_final_video',
        skillId: 'edit-first-video-director',
        operationId: 'assemble_timeline_video',
        taskId: null,
        status: PLAN_STEP_STATUS.COMPLETED,
        stepIndex: 1,
        stepTotal: 2,
        dependsOn: ['panel_video_1'],
        inputArtifacts: ['panel.video'],
        outputArtifacts: ['final.video'],
        input: {
          renderFinalVideo: true,
        },
        output: {
          storageKey: 'final-videos/editor-final-video.mp4',
          finalVideoUrl: '/api/files/final-videos/editor-final-video.mp4?signature=test',
        },
        errorCode: null,
        errorMessage: null,
        startedAt: NOW,
        finishedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    artifacts: [
      {
        id: 'artifact-final-video-1',
        planRunId: 'plan-run-final-video-1',
        stepKey: 'assemble_final_video',
        artifactType: 'final.video',
        refId: 'final-videos/editor-final-video.mp4',
        payload: {
          storageKey: 'final-videos/editor-final-video.mp4',
          finalVideoUrl: '/api/files/final-videos/editor-final-video.mp4?signature=test',
        },
        createdAt: NOW,
      },
    ],
  }
}

const traceSummary: PlanRunTraceSummary = {
  eventCount: 3,
  stepOrder: ['panel_video_1', 'assemble_final_video'],
  operationOrder: ['generate_panel_video', 'assemble_timeline_video'],
  firstError: null,
  errors: [],
  inputBuildFailures: [],
  malformedErrorEvents: [],
  hasInputBuildFailure: false,
}

describe('edit timeline trace scoring', () => {
  beforeEach(() => {
    vi.mocked(getPlanRunSnapshot).mockReset()
    vi.mocked(getPlanRunTraceSummary).mockReset()
  })

  it('score_edit_timeline_trace treats persisted final.video PlanArtifact as playback evidence', async () => {
    vi.mocked(getPlanRunSnapshot).mockResolvedValueOnce(buildSnapshotWithFinalVideoArtifact())
    vi.mocked(getPlanRunTraceSummary).mockResolvedValueOnce(traceSummary)

    const operation = loadOperation('score_edit_timeline_trace')
    const result = await operation.execute(buildContext(), {
      planRunId: 'plan-run-final-video-1',
      eventLimit: 200,
    })

    expect(result).toMatchObject({
      dimensions: expect.arrayContaining([
        expect.objectContaining({
          code: 'finalVideoPlayback',
          status: 'passed',
          message: 'final.video playback evidence is present.',
        }),
      ]),
    })
  })
})
