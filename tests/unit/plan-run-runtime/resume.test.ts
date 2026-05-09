import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  EDIT_TIMELINE_BLACKBOARD_ARTIFACT_TYPE,
  buildEditTimelineBlackboard,
  parseEditTimeline,
} from '@/lib/edit-timeline'
import { resumePlanRunFromApi } from '@/lib/plan-run-runtime/resume'

const serviceMock = vi.hoisted(() => ({
  completePlanRun: vi.fn(async () => ({ planRun: { id: 'plan-run-1' } })),
  completePlanStep: vi.fn(async () => ({})),
  completeWaitingPlanStepTask: vi.fn(async () => ({})),
  createPlanArtifact: vi.fn(async () => ({})),
  failPlanStep: vi.fn(async () => ({})),
  getPlanRunSnapshot: vi.fn(),
  startPlanStep: vi.fn(async () => ({})),
}))

const taskServiceMock = vi.hoisted(() => ({
  getTaskById: vi.fn(),
}))

const apiAdapterMock = vi.hoisted(() => ({
  executeProjectAgentOperationFromApi: vi.fn(),
}))

vi.mock('@/lib/plan-run-runtime/service', () => serviceMock)
vi.mock('@/lib/task/service', () => taskServiceMock)
vi.mock('@/lib/adapters/api/execute-project-agent-operation', () => apiAdapterMock)

const firstSnapshot = {
  planRun: {
    id: 'plan-run-1',
    userId: 'user-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    status: 'running',
  },
  steps: [
    {
      stepKey: 'split',
      skillId: 'screenwriting',
      operationId: 'split_clips',
      status: 'waiting_task',
      taskId: 'task-1',
      dependsOn: [],
      inputArtifacts: [],
      outputArtifacts: ['clips'],
      input: { episodeId: 'episode-1' },
    },
    {
      stepKey: 'write',
      skillId: 'screenwriting',
      operationId: 'write_screenplay',
      status: 'pending',
      taskId: null,
      dependsOn: ['split'],
      inputArtifacts: ['clips'],
      outputArtifacts: ['screenplay'],
      input: {},
    },
  ],
  artifacts: [],
}

const afterTaskSnapshot = {
  ...firstSnapshot,
  steps: [
    {
      ...firstSnapshot.steps[0],
      status: 'completed',
    },
    firstSnapshot.steps[1],
  ],
}

const waitingNextTaskSnapshot = {
  ...afterTaskSnapshot,
  steps: [
    afterTaskSnapshot.steps[0],
    {
      ...afterTaskSnapshot.steps[1],
      status: 'waiting_task',
      taskId: 'task-2',
    },
  ],
}

const runtimeTimeline = parseEditTimeline({
  id: 'timeline-runtime-evidence',
  title: 'Runtime evidence test',
  aspectRatio: '9:16',
  fps: 24,
  segments: [
    {
      id: 'segment-01',
      label: 'Single runtime beat',
      startMs: 0,
      durationMs: 4_000,
      intent: 'Show the hero action clearly.',
      shotIds: ['shot-01'],
    },
  ],
  shots: [
    {
      id: 'shot-01',
      segmentId: 'segment-01',
      title: 'Hero action',
      goal: 'A courier lifts a bright package in the rain.',
      track: 'video',
      order: 1,
      startMs: 0,
      durationMs: 4_000,
      dependsOn: [],
      referenceIds: [],
      control: {
        prompt: 'A courier lifts a bright package in the rain.',
      },
    },
  ],
  references: [],
  continuityBible: {
    characters: ['courier in yellow rain jacket'],
    locations: ['rainy convenience store entrance'],
    props: ['bright insulated package'],
    visualRules: ['silent cinematic 9:16'],
  },
})

const runtimeBlackboard = buildEditTimelineBlackboard({
  timeline: runtimeTimeline,
  sourceStory: 'A courier lifts a bright package in the rain outside a convenience store.',
  creativeBrief: {
    theme: 'Courier hero moment',
    protagonist: 'courier in yellow rain jacket',
    setting: 'rainy convenience store entrance',
    mood: 'hopeful',
    twist: 'the package becomes a hero emblem',
    targetDurationMs: 4_000,
    aspectRatio: '9:16',
    missingInfo: [],
    assumptions: [],
  },
  risks: [],
})

const runtimeBlackboardArtifact = {
  id: 'artifact-runtime-blackboard',
  artifactType: EDIT_TIMELINE_BLACKBOARD_ARTIFACT_TYPE,
  refId: runtimeBlackboard.id,
  payload: runtimeBlackboard,
}

const p0VideoFirstSnapshot = {
  planRun: {
    id: 'plan-run-video-1',
    userId: 'user-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    status: 'running',
  },
  steps: [
    {
      stepKey: 'video',
      skillId: 'media-generation',
      operationId: 'generate_panel_video',
      status: 'waiting_task',
      taskId: 'task-video-1',
      dependsOn: [],
      inputArtifacts: [],
      outputArtifacts: ['panel.video'],
      input: {
        panelId: 'panel-1',
        shotId: 'shot-01',
        videoModel: 'fal::seedance/video',
        prompt: 'gentle camera move',
      },
    },
  ],
  artifacts: [runtimeBlackboardArtifact],
}

const p0VideoAfterTaskSnapshot = {
  ...p0VideoFirstSnapshot,
  steps: [
    {
      ...p0VideoFirstSnapshot.steps[0],
      status: 'completed',
    },
  ],
}

const p0VideoCompletedSnapshot = {
  ...p0VideoAfterTaskSnapshot,
  planRun: {
    ...p0VideoAfterTaskSnapshot.planRun,
    status: 'completed',
  },
}

const editFirstPendingVideoSnapshot = {
  planRun: {
    id: 'plan-run-edit-first-1',
    userId: 'user-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    status: 'running',
  },
  steps: [
    {
      stepKey: 'video',
      skillId: 'media-generation',
      operationId: 'generate_panel_video',
      status: 'pending',
      taskId: null,
      dependsOn: [],
      inputArtifacts: [],
      outputArtifacts: ['panel.video'],
      input: {
        editFirst: true,
        panelId: 'panel-1',
        shotId: 'shot-01',
        videoModel: 'google::veo-3.1-generate-preview',
        firstLastFrameModel: 'google::veo-3.1-generate-preview',
        sourceFrameRef: 'media:first-frame',
        mediaRefs: {},
        controlPayload: {
          prompt: 'A precise bridge between two frames.',
          durationSeconds: 8,
          aspectRatio: '16:9',
          firstFrameRef: 'media:first-frame',
          lastFrameRef: 'media:last-frame',
        },
      },
    },
  ],
  artifacts: [],
}

const editFirstFailedVideoSnapshot = {
  ...editFirstPendingVideoSnapshot,
  planRun: {
    ...editFirstPendingVideoSnapshot.planRun,
    status: 'failed',
    errorCode: 'PLAN_STEP_INPUT_BUILD_FAILED',
    errorMessage: 'EDIT_TIMELINE_GENERATE_PANEL_VIDEO_LAST_FRAME_UNRESOLVED:media:last-frame',
  },
  steps: [
    {
      ...editFirstPendingVideoSnapshot.steps[0],
      status: 'failed',
      errorCode: 'PLAN_STEP_INPUT_BUILD_FAILED',
      errorMessage: 'EDIT_TIMELINE_GENERATE_PANEL_VIDEO_LAST_FRAME_UNRESOLVED:media:last-frame',
    },
  ],
}

const editFirstSubmitVideoSnapshot = {
  ...editFirstPendingVideoSnapshot,
  planRun: {
    ...editFirstPendingVideoSnapshot.planRun,
    id: 'plan-run-edit-first-submit-1',
  },
  steps: [
    {
      ...editFirstPendingVideoSnapshot.steps[0],
      input: {
        editFirst: true,
        panelId: 'panel-1',
        shotId: 'shot-01',
        videoModel: 'google::veo-3.1-generate-preview',
        controlPayload: {
          prompt: 'A precise courier hero shot.',
          durationSeconds: 4,
          aspectRatio: '9:16',
        },
      },
    },
  ],
  artifacts: [runtimeBlackboardArtifact],
}

const editFirstSubmitWaitingSnapshot = {
  ...editFirstSubmitVideoSnapshot,
  steps: [
    {
      ...editFirstSubmitVideoSnapshot.steps[0],
      status: 'waiting_task',
      taskId: 'task-video-2',
      output: {
        success: true,
        taskId: 'task-video-2',
        status: 'queued',
        panelId: 'panel-1',
      },
    },
  ],
}

const finalAssemblyPendingSnapshot = {
  planRun: {
    id: 'plan-run-final-video-1',
    userId: 'user-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    status: 'running',
  },
  steps: [
    {
      stepKey: 'shot_01_materialize',
      skillId: 'media-generation',
      operationId: 'generate_panel_video',
      status: 'completed',
      taskId: 'task-video-1',
      dependsOn: [],
      inputArtifacts: [],
      outputArtifacts: ['panel.video'],
      input: {
        editFirst: true,
        panelId: 'panel-1',
        shotId: 'shot-01',
        videoModel: 'google::veo-3.1-generate-preview',
        controlPayload: {
          prompt: 'A product shot.',
          durationSeconds: 4,
          aspectRatio: '16:9',
        },
      },
    },
    {
      stepKey: 'assemble_final_video',
      skillId: 'edit-first-video-director',
      operationId: 'assemble_timeline_video',
      status: 'pending',
      taskId: null,
      dependsOn: ['shot_01_materialize'],
      inputArtifacts: ['panel.video'],
      outputArtifacts: ['final.video'],
      input: {
        editFirst: true,
        timeline: {
          id: 'timeline-final-video',
          title: 'Generic product video',
          aspectRatio: '16:9',
          fps: 24,
          segments: [],
          shots: [],
          references: [],
          continuityBible: {},
        },
        panelIdsByShotId: {
          'shot-01': 'panel-1',
        },
        renderFinalVideo: true,
      },
    },
  ],
  artifacts: [
    runtimeBlackboardArtifact,
    {
      id: 'artifact-panel-video',
      artifactType: 'panel.video',
      refId: 'panel-1',
    },
  ],
}

const finalAssemblyAfterStepSnapshot = {
  ...finalAssemblyPendingSnapshot,
  steps: [
    finalAssemblyPendingSnapshot.steps[0],
    {
      ...finalAssemblyPendingSnapshot.steps[1],
      status: 'completed',
    },
  ],
}

const finalAssemblyCompletedSnapshot = {
  ...finalAssemblyAfterStepSnapshot,
  planRun: {
    ...finalAssemblyAfterStepSnapshot.planRun,
    status: 'completed',
  },
}

describe('plan run resume runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serviceMock.getPlanRunSnapshot
      .mockResolvedValueOnce(firstSnapshot)
      .mockResolvedValueOnce(afterTaskSnapshot)
      .mockResolvedValueOnce(waitingNextTaskSnapshot)
    taskServiceMock.getTaskById.mockResolvedValue({
      id: 'task-1',
      userId: 'user-1',
      projectId: 'project-1',
      status: 'completed',
      result: { clipCount: 3 },
      errorCode: null,
      errorMessage: null,
    })
    apiAdapterMock.executeProjectAgentOperationFromApi.mockResolvedValue({
      success: true,
      taskId: 'task-2',
      status: 'queued',
    })
  })

  it('continues downstream plan steps after the waited async task completes', async () => {
    const request = new NextRequest('http://localhost/api/plan-runs/plan-run-1/resume')

    const result = await resumePlanRunFromApi({
      request,
      planRunId: 'plan-run-1',
      userId: 'user-1',
      locale: 'zh',
    })

    expect(result).toMatchObject({
      success: true,
      planRunId: 'plan-run-1',
      status: 'waiting_task',
      resumedStepKeys: ['write'],
      waitingTaskId: 'task-2',
    })
    expect(serviceMock.completeWaitingPlanStepTask).toHaveBeenCalledWith({
      planRunId: 'plan-run-1',
      userId: 'user-1',
      projectId: 'project-1',
      stepKey: 'split',
      taskId: 'task-1',
      output: { clipCount: 3 },
    })
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenCalledWith(expect.objectContaining({
      request,
      operationId: 'write_screenplay',
      projectId: 'project-1',
      userId: 'user-1',
      context: {
        locale: 'zh',
        episodeId: 'episode-1',
      },
      input: {
        episodeId: 'episode-1',
        confirmed: true,
      },
      source: 'plan-run-resume',
    }))
    expect(serviceMock.completePlanStep).toHaveBeenCalledWith(expect.objectContaining({
      planRunId: 'plan-run-1',
      stepKey: 'write',
      taskId: 'task-2',
    }))
    expect(serviceMock.completePlanRun).not.toHaveBeenCalled()
  })

  it('completes the P0 single panel video plan after the video task finishes', async () => {
    serviceMock.getPlanRunSnapshot.mockReset()
    serviceMock.getPlanRunSnapshot
      .mockResolvedValueOnce(p0VideoFirstSnapshot)
      .mockResolvedValue(p0VideoAfterTaskSnapshot)
    serviceMock.completePlanRun.mockResolvedValueOnce(p0VideoCompletedSnapshot)
    taskServiceMock.getTaskById.mockResolvedValueOnce({
      id: 'task-video-1',
      userId: 'user-1',
      projectId: 'project-1',
      status: 'completed',
      result: {
        panelId: 'panel-1',
        videoUrl: 'https://storage.example/project-1/panel-1.mp4',
      },
      errorCode: null,
      errorMessage: null,
    })
    const request = new NextRequest('http://localhost/api/plan-runs/plan-run-video-1/resume')

    const result = await resumePlanRunFromApi({
      request,
      planRunId: 'plan-run-video-1',
      userId: 'user-1',
      locale: 'zh',
    })

    expect(result).toMatchObject({
      success: true,
      planRunId: 'plan-run-video-1',
      status: 'completed',
      resumedStepKeys: [],
      waitingTaskId: null,
    })
    expect(serviceMock.completeWaitingPlanStepTask).toHaveBeenCalledWith({
      planRunId: 'plan-run-video-1',
      userId: 'user-1',
      projectId: 'project-1',
      stepKey: 'video',
      taskId: 'task-video-1',
      output: {
        panelId: 'panel-1',
        videoUrl: 'https://storage.example/project-1/panel-1.mp4',
      },
    })
    expect(serviceMock.createPlanArtifact).toHaveBeenCalledWith({
      planRunId: 'plan-run-video-1',
      stepKey: 'video',
      artifactType: 'panel.video',
      refId: 'panel-1',
      payload: {
        panelId: 'panel-1',
        videoUrl: 'https://storage.example/project-1/panel-1.mp4',
      },
    })
    expect(serviceMock.createPlanArtifact).toHaveBeenCalledWith(expect.objectContaining({
      planRunId: 'plan-run-video-1',
      artifactType: EDIT_TIMELINE_BLACKBOARD_ARTIFACT_TYPE,
      refId: runtimeBlackboard.id,
      payload: expect.objectContaining({
        shots: expect.arrayContaining([
          expect.objectContaining({
            shotId: 'shot-01',
            providerTask: expect.objectContaining({
              taskId: 'task-video-1',
              status: 'succeeded',
              outputUrl: 'https://storage.example/project-1/panel-1.mp4',
              model: 'fal::seedance/video',
            }),
          }),
        ]),
        providerExperiments: expect.arrayContaining([
          expect.objectContaining({
            shotId: 'shot-01',
            taskId: 'task-video-1',
            status: 'succeeded',
            outputUrl: 'https://storage.example/project-1/panel-1.mp4',
          }),
        ]),
      }),
    }))
    expect(serviceMock.completePlanRun).toHaveBeenCalledWith({
      planRunId: 'plan-run-video-1',
      userId: 'user-1',
      projectId: 'project-1',
    })
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).not.toHaveBeenCalled()
  })

  it('records provider task blockers on the edit timeline blackboard when a waited video task fails', async () => {
    const failedSnapshot = {
      ...p0VideoFirstSnapshot,
      planRun: {
        ...p0VideoFirstSnapshot.planRun,
        status: 'failed',
      },
      steps: [
        {
          ...p0VideoFirstSnapshot.steps[0],
          status: 'failed',
          errorCode: 'PROVIDER_TASK_FAILED',
          errorMessage: 'provider quota exhausted',
        },
      ],
    }
    serviceMock.getPlanRunSnapshot.mockReset()
    serviceMock.getPlanRunSnapshot
      .mockResolvedValueOnce(p0VideoFirstSnapshot)
      .mockResolvedValue(failedSnapshot)
    taskServiceMock.getTaskById.mockResolvedValueOnce({
      id: 'task-video-1',
      userId: 'user-1',
      projectId: 'project-1',
      status: 'failed',
      payload: {
        videoModel: 'fal::seedance/video',
      },
      result: null,
      errorCode: 'PROVIDER_TASK_FAILED',
      errorMessage: 'provider quota exhausted',
    })
    const request = new NextRequest('http://localhost/api/plan-runs/plan-run-video-1/resume')

    const result = await resumePlanRunFromApi({
      request,
      planRunId: 'plan-run-video-1',
      userId: 'user-1',
      locale: 'zh',
    })

    expect(result).toMatchObject({
      success: false,
      planRunId: 'plan-run-video-1',
      status: 'failed',
      failedStepKey: 'video',
      error: {
        errorCode: 'PROVIDER_TASK_FAILED',
        errorMessage: 'provider quota exhausted',
      },
    })
    expect(serviceMock.createPlanArtifact).toHaveBeenCalledWith(expect.objectContaining({
      planRunId: 'plan-run-video-1',
      artifactType: EDIT_TIMELINE_BLACKBOARD_ARTIFACT_TYPE,
      refId: runtimeBlackboard.id,
      payload: expect.objectContaining({
        finalCritic: expect.objectContaining({
          status: 'blocked',
          issues: expect.arrayContaining(['shot-01:provider quota exhausted']),
        }),
        shots: expect.arrayContaining([
          expect.objectContaining({
            shotId: 'shot-01',
            status: 'blocked',
            blocker: 'provider quota exhausted',
            providerTask: expect.objectContaining({
              taskId: 'task-video-1',
              status: 'failed',
              blocker: 'provider quota exhausted',
            }),
          }),
        ]),
      }),
    }))
  })

  it('records a submitted provider task id on the edit timeline blackboard during resume', async () => {
    serviceMock.getPlanRunSnapshot.mockReset()
    serviceMock.getPlanRunSnapshot
      .mockResolvedValueOnce(editFirstSubmitVideoSnapshot)
      .mockResolvedValue(editFirstSubmitWaitingSnapshot)
    apiAdapterMock.executeProjectAgentOperationFromApi.mockResolvedValueOnce({
      success: true,
      taskId: 'task-video-2',
      status: 'queued',
      panelId: 'panel-1',
    })
    const request = new NextRequest('http://localhost/api/plan-runs/plan-run-edit-first-submit-1/resume')

    const result = await resumePlanRunFromApi({
      request,
      planRunId: 'plan-run-edit-first-submit-1',
      userId: 'user-1',
      locale: 'zh',
    })

    expect(result).toMatchObject({
      success: true,
      planRunId: 'plan-run-edit-first-submit-1',
      status: 'waiting_task',
      resumedStepKeys: ['video'],
      waitingTaskId: 'task-video-2',
    })
    expect(serviceMock.createPlanArtifact).toHaveBeenCalledWith(expect.objectContaining({
      planRunId: 'plan-run-edit-first-submit-1',
      artifactType: EDIT_TIMELINE_BLACKBOARD_ARTIFACT_TYPE,
      refId: runtimeBlackboard.id,
      payload: expect.objectContaining({
        shots: expect.arrayContaining([
          expect.objectContaining({
            shotId: 'shot-01',
            providerTask: expect.objectContaining({
              taskId: 'task-video-2',
              status: 'submitted',
              outputUrl: null,
              model: 'google::veo-3.1-generate-preview',
            }),
          }),
        ]),
      }),
    }))
  })

  it('fails a pending edit-first video step during resume before invoking operations when terminal refs are unresolved', async () => {
    serviceMock.getPlanRunSnapshot.mockReset()
    serviceMock.getPlanRunSnapshot
      .mockResolvedValueOnce(editFirstPendingVideoSnapshot)
      .mockResolvedValueOnce(editFirstFailedVideoSnapshot)
    const request = new NextRequest('http://localhost/api/plan-runs/plan-run-edit-first-1/resume')

    const result = await resumePlanRunFromApi({
      request,
      planRunId: 'plan-run-edit-first-1',
      userId: 'user-1',
      locale: 'zh',
    })

    expect(result).toMatchObject({
      success: false,
      planRunId: 'plan-run-edit-first-1',
      status: 'failed',
      failedStepKey: 'video',
      resumedStepKeys: ['video'],
      waitingTaskId: null,
      error: {
        code: 'PLAN_STEP_INPUT_BUILD_FAILED',
        message: 'EDIT_TIMELINE_GENERATE_PANEL_VIDEO_LAST_FRAME_UNRESOLVED:media:last-frame',
      },
    })
    expect(serviceMock.startPlanStep).toHaveBeenCalledWith({
      planRunId: 'plan-run-edit-first-1',
      userId: 'user-1',
      projectId: 'project-1',
      stepKey: 'video',
    })
    expect(serviceMock.failPlanStep).toHaveBeenCalledWith({
      planRunId: 'plan-run-edit-first-1',
      userId: 'user-1',
      projectId: 'project-1',
      stepKey: 'video',
      errorCode: 'PLAN_STEP_INPUT_BUILD_FAILED',
      errorMessage: 'EDIT_TIMELINE_GENERATE_PANEL_VIDEO_LAST_FRAME_UNRESOLVED:media:last-frame',
    })
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).not.toHaveBeenCalled()
  })

  it('continues from completed provider steps into final video assembly and records the final artifact', async () => {
    serviceMock.getPlanRunSnapshot.mockReset()
    serviceMock.getPlanRunSnapshot
      .mockResolvedValueOnce(finalAssemblyPendingSnapshot)
      .mockResolvedValue(finalAssemblyAfterStepSnapshot)
    serviceMock.completePlanRun.mockResolvedValueOnce(finalAssemblyCompletedSnapshot)
    const signedFinalVideoUrl = '/api/files/final-videos/editor-final-video.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=minioadmin%2F20260508%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Signature=long-signature'
    apiAdapterMock.executeProjectAgentOperationFromApi.mockResolvedValueOnce({
      editorProjectId: 'editor-final-video',
      outputUrl: signedFinalVideoUrl,
      finalVideoUrl: signedFinalVideoUrl,
      storageKey: 'final-videos/editor-final-video.mp4',
      renderStatus: 'completed',
      blockers: [],
    })
    const request = new NextRequest('http://localhost/api/plan-runs/plan-run-final-video-1/resume')

    const result = await resumePlanRunFromApi({
      request,
      planRunId: 'plan-run-final-video-1',
      userId: 'user-1',
      locale: 'zh',
    })

    expect(result).toMatchObject({
      success: true,
      planRunId: 'plan-run-final-video-1',
      status: 'completed',
      resumedStepKeys: ['assemble_final_video'],
      waitingTaskId: null,
    })
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenCalledWith(expect.objectContaining({
      request,
      operationId: 'assemble_timeline_video',
      projectId: 'project-1',
      userId: 'user-1',
      context: {
        locale: 'zh',
        episodeId: 'episode-1',
      },
      input: expect.objectContaining({
        episodeId: 'episode-1',
        confirmed: true,
        panelIdsByShotId: {
          'shot-01': 'panel-1',
        },
        renderFinalVideo: true,
      }),
      source: 'plan-run-resume',
    }))
    expect(serviceMock.createPlanArtifact).toHaveBeenCalledWith({
      planRunId: 'plan-run-final-video-1',
      stepKey: 'assemble_final_video',
      artifactType: 'final.video',
      refId: 'final-videos/editor-final-video.mp4',
      payload: {
        editorProjectId: 'editor-final-video',
        outputUrl: signedFinalVideoUrl,
        finalVideoUrl: signedFinalVideoUrl,
        storageKey: 'final-videos/editor-final-video.mp4',
        renderStatus: 'completed',
        blockers: [],
      },
    })
    expect(serviceMock.createPlanArtifact).toHaveBeenCalledWith(expect.objectContaining({
      planRunId: 'plan-run-final-video-1',
      artifactType: EDIT_TIMELINE_BLACKBOARD_ARTIFACT_TYPE,
      refId: runtimeBlackboard.id,
      payload: expect.objectContaining({
        finalCritic: expect.objectContaining({
          status: 'scored',
          evidenceRefs: expect.arrayContaining([signedFinalVideoUrl]),
        }),
      }),
    }))
    expect(serviceMock.completePlanRun).toHaveBeenCalledWith({
      planRunId: 'plan-run-final-video-1',
      userId: 'user-1',
      projectId: 'project-1',
    })
  })
})
