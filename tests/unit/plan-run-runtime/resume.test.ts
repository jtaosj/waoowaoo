import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
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
        videoModel: 'fal::seedance/video',
        prompt: 'gentle camera move',
      },
    },
  ],
  artifacts: [],
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
      .mockResolvedValueOnce(p0VideoAfterTaskSnapshot)
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
    expect(serviceMock.completePlanRun).toHaveBeenCalledWith({
      planRunId: 'plan-run-video-1',
      userId: 'user-1',
      projectId: 'project-1',
    })
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).not.toHaveBeenCalled()
  })
})
