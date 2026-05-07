import { describe, expect, it, vi } from 'vitest'
import { resumePlanRunAfterTerminalTask } from '@/features/project-workspace/components/workspace-assistant/plan-run-submitted-resume'

describe('workspace assistant plan run submitted resume', () => {
  it('attempts resume once for the same terminal task after success', async () => {
    const resumedTaskIds = new Set<string>()
    const snapshot = { planRun: { id: 'plan-run-1', status: 'completed' } }
    const resume = vi.fn<() => Promise<typeof snapshot | null>>()
      .mockResolvedValue(snapshot)

    await expect(resumePlanRunAfterTerminalTask({
      taskId: 'task-1',
      taskStatus: 'completed',
      planRunStatus: 'waiting_task',
      resumedTaskIds,
      resume,
    })).resolves.toEqual({
      attempted: true,
      snapshot,
    })

    await expect(resumePlanRunAfterTerminalTask({
      taskId: 'task-1',
      taskStatus: 'completed',
      planRunStatus: 'waiting_task',
      resumedTaskIds,
      resume,
    })).resolves.toEqual({
      attempted: false,
      snapshot: null,
    })

    expect(resume).toHaveBeenCalledTimes(1)
    expect(resumedTaskIds.has('task-1')).toBe(true)
  })

  it('does not resume while the task is still active', async () => {
    const resumedTaskIds = new Set<string>()
    const resume = vi.fn<() => Promise<{ status: string } | null>>()

    await expect(resumePlanRunAfterTerminalTask({
      taskId: 'task-1',
      taskStatus: 'processing',
      planRunStatus: 'waiting_task',
      resumedTaskIds,
      resume,
    })).resolves.toEqual({
      attempted: false,
      snapshot: null,
    })

    expect(resume).not.toHaveBeenCalled()
    expect(resumedTaskIds.has('task-1')).toBe(false)
  })

  it('retries the same terminal task when the previous resume request failed', async () => {
    const resumedTaskIds = new Set<string>()
    const snapshot = { planRun: { id: 'plan-run-1', status: 'completed' } }
    const resume = vi.fn<() => Promise<typeof snapshot | null>>()
      .mockRejectedValueOnce(new Error('transient resume failure'))
      .mockResolvedValueOnce(snapshot)

    await expect(resumePlanRunAfterTerminalTask({
      taskId: 'task-1',
      taskStatus: 'completed',
      planRunStatus: 'waiting_task',
      resumedTaskIds,
      resume,
    })).rejects.toThrow('transient resume failure')

    expect(resumedTaskIds.has('task-1')).toBe(false)

    await expect(resumePlanRunAfterTerminalTask({
      taskId: 'task-1',
      taskStatus: 'completed',
      planRunStatus: 'waiting_task',
      resumedTaskIds,
      resume,
    })).resolves.toEqual({
      attempted: true,
      snapshot,
    })
    expect(resume).toHaveBeenCalledTimes(2)
    expect(resumedTaskIds.has('task-1')).toBe(true)
  })
})
