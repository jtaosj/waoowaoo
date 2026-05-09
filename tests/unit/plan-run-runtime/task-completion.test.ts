import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resumePlanRunsForTerminalTask } from '@/lib/plan-run-runtime/task-completion'

const serviceMock = vi.hoisted(() => ({
  listWaitingPlanStepsByTaskId: vi.fn(),
}))

const resumeMock = vi.hoisted(() => ({
  resumePlanRunFromApi: vi.fn(),
}))

vi.mock('@/lib/plan-run-runtime/service', () => serviceMock)
vi.mock('@/lib/plan-run-runtime/resume', () => resumeMock)
vi.mock('@/lib/logging/core', () => ({
  createScopedLogger: vi.fn(() => ({
    error: vi.fn(),
    info: vi.fn(),
  })),
}))

describe('plan run task completion hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serviceMock.listWaitingPlanStepsByTaskId.mockResolvedValue([
      {
        planRunId: 'plan-run-1',
        stepKey: 'shot_01_materialize',
        status: 'waiting_task',
        userId: 'user-1',
        projectId: 'project-1',
        episodeId: 'episode-1',
        planRunStatus: 'running',
      },
    ])
    resumeMock.resumePlanRunFromApi.mockResolvedValue({
      success: true,
      status: 'waiting_task',
      waitingTaskId: 'task-video-2',
    })
  })

  it('resumes active PlanRuns that are waiting on a completed task', async () => {
    const result = await resumePlanRunsForTerminalTask({
      taskId: 'task-video-1',
      locale: 'zh',
    })

    expect(serviceMock.listWaitingPlanStepsByTaskId).toHaveBeenCalledWith('task-video-1')
    expect(resumeMock.resumePlanRunFromApi).toHaveBeenCalledWith(expect.objectContaining({
      planRunId: 'plan-run-1',
      userId: 'user-1',
      locale: 'zh',
    }))
    expect(result.resumedRuns).toEqual([
      {
        planRunId: 'plan-run-1',
        stepKey: 'shot_01_materialize',
        success: true,
        status: 'waiting_task',
        waitingTaskId: 'task-video-2',
        errorMessage: null,
      },
    ])
  })

  it('reports resume failures instead of pretending the PlanRun advanced', async () => {
    resumeMock.resumePlanRunFromApi.mockRejectedValueOnce(new Error('resume exploded'))

    const result = await resumePlanRunsForTerminalTask({
      taskId: 'task-video-1',
      locale: 'zh',
    })

    expect(result.resumedRuns).toEqual([
      {
        planRunId: 'plan-run-1',
        stepKey: 'shot_01_materialize',
        success: false,
        status: 'failed',
        waitingTaskId: null,
        errorMessage: 'resume exploded',
      },
    ])
  })
})
