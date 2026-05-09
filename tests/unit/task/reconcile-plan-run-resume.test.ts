import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reconcileActiveTasks } from '@/lib/task/reconcile'

const prismaMock = vi.hoisted(() => ({
  task: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
}))

const queuesMock = vi.hoisted(() => ({
  getAllQueues: vi.fn(),
}))

const publisherMock = vi.hoisted(() => ({
  publishTaskEvent: vi.fn(),
}))

const taskServiceMock = vi.hoisted(() => ({
  rollbackTaskBillingForTask: vi.fn(),
}))

const planRunTaskCompletionMock = vi.hoisted(() => ({
  resumePlanRunsForTerminalTask: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/task/queues', () => queuesMock)
vi.mock('@/lib/task/publisher', () => publisherMock)
vi.mock('@/lib/task/service', () => taskServiceMock)
vi.mock('@/lib/plan-run-runtime/task-completion', () => planRunTaskCompletionMock)
vi.mock('@/lib/logging/core', () => ({
  createScopedLogger: vi.fn(() => ({
    error: vi.fn(),
    info: vi.fn(),
  })),
}))

describe('task reconciliation PlanRun resume bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.task.findMany.mockResolvedValue([
      {
        id: 'task-orphan-1',
        userId: 'user-1',
        projectId: 'project-1',
        episodeId: 'episode-1',
        type: 'VIDEO_PANEL',
        targetType: 'Panel',
        targetId: 'panel-1',
        billingInfo: null,
        updatedAt: new Date(Date.now() - 10 * 60_000),
      },
    ])
    prismaMock.task.updateMany.mockResolvedValue({ count: 1 })
    taskServiceMock.rollbackTaskBillingForTask.mockResolvedValue({
      attempted: false,
      rolledBack: true,
      billingInfo: null,
    })
    queuesMock.getAllQueues.mockReturnValue([
      {
        getJob: vi.fn().mockResolvedValue({
          getState: vi.fn().mockResolvedValue('failed'),
        }),
      },
    ])
    publisherMock.publishTaskEvent.mockResolvedValue(undefined)
    planRunTaskCompletionMock.resumePlanRunsForTerminalTask.mockResolvedValue({
      taskId: 'task-orphan-1',
      resumedRuns: [],
    })
  })

  it('resumes or fails PlanRuns waiting on orphaned terminal tasks after marking the task failed', async () => {
    await expect(reconcileActiveTasks()).resolves.toEqual(['task-orphan-1'])

    expect(planRunTaskCompletionMock.resumePlanRunsForTerminalTask).toHaveBeenCalledWith({
      taskId: 'task-orphan-1',
      locale: null,
    })
  })
})
