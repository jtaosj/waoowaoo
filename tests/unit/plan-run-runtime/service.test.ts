import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  completeWaitingPlanStepTask,
  createPlanRun,
  getPlanRunSnapshot,
  getPlanRunTraceSummary,
  listWaitingPlanStepsByTaskId,
} from '@/lib/plan-run-runtime/service'

const prismaState = vi.hoisted(() => {
  const tx = {
    executionPlan: {
      findFirst: vi.fn(),
    },
    planRun: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    planStepRun: {
      createMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    planRunEvent: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    planArtifact: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  }

  return {
    tx,
    prisma: {
      ...tx,
      $transaction: vi.fn(async <T>(fn: (txArg: typeof tx) => Promise<T>): Promise<T> => fn(tx)),
    },
  }
})

vi.mock('@/lib/prisma', () => ({
  prisma: prismaState.prisma,
}))

function buildPlanRunRow(planId: string | null) {
  const now = new Date('2026-05-05T00:00:00.000Z')
  return {
    id: 'plan-run-1',
    userId: 'user-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    commandId: null,
    planId,
    goal: 'write scene',
    status: 'queued',
    currentStepKey: null,
    errorCode: null,
    errorMessage: null,
    cancelRequestedAt: null,
    queuedAt: now,
    startedAt: null,
    finishedAt: null,
    lastSeq: 0,
    createdAt: now,
    updatedAt: now,
  }
}

function buildPlanStepRunRow(status: string) {
  const now = new Date('2026-05-05T00:00:00.000Z')
  return {
    id: 'step-run-1',
    planRunId: 'plan-run-1',
    stepKey: 'split',
    skillId: 'screenwriting',
    operationId: 'split_clips',
    taskId: 'task-1',
    status,
    stepIndex: 1,
    stepTotal: 2,
    dependsOnJson: [],
    inputArtifactsJson: [],
    outputArtifactsJson: ['clips'],
    inputJson: { episodeId: 'episode-1' },
    outputJson: status === 'completed' ? { clipCount: 3 } : { taskId: 'task-1' },
    errorCode: null,
    errorMessage: null,
    startedAt: now,
    finishedAt: status === 'completed' ? now : null,
    createdAt: now,
    updatedAt: now,
  }
}

function buildPlanRunEventRow() {
  const now = new Date('2026-05-05T00:00:00.000Z')
  return {
    id: { toString: () => '1' },
    planRunId: 'plan-run-1',
    projectId: 'project-1',
    userId: 'user-1',
    seq: 7,
    eventType: 'step.complete',
    stepKey: 'split',
    payload: {
      status: 'completed',
      taskId: 'task-1',
    },
    createdAt: now,
  }
}

describe('plan run runtime service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaState.tx.executionPlan.findFirst.mockResolvedValue({ id: 'execution-plan-1' })
    prismaState.tx.planRun.create.mockResolvedValue(buildPlanRunRow('execution-plan-1'))
    prismaState.tx.planStepRun.createMany.mockResolvedValue({ count: 0 })
  })

  it('links a PlanRun only to an existing ExecutionPlan in the same project', async () => {
    const planRun = await createPlanRun({
      userId: 'user-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      planId: 'execution-plan-1',
      goal: 'write scene',
    })

    expect(planRun.planId).toBe('execution-plan-1')
    expect(prismaState.tx.executionPlan.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'execution-plan-1',
        projectId: 'project-1',
      },
      select: { id: true },
    })
    expect(prismaState.tx.planRun.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        planId: 'execution-plan-1',
      }),
    }))
  })

  it('fails before creating a PlanRun when the supplied planId is not persisted', async () => {
    prismaState.tx.executionPlan.findFirst.mockResolvedValue(null)

    await expect(createPlanRun({
      userId: 'user-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      planId: 'draft_plan_1',
      goal: 'write scene',
    })).rejects.toThrow('PLAN_NOT_FOUND:draft_plan_1')

    expect(prismaState.tx.executionPlan.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'draft_plan_1',
        projectId: 'project-1',
      },
      select: { id: true },
    })
    expect(prismaState.tx.planRun.create).not.toHaveBeenCalled()
  })

  it('marks a waiting async task step completed with the final task output', async () => {
    prismaState.tx.planStepRun.findUnique.mockResolvedValue(buildPlanStepRunRow('waiting_task'))
    prismaState.tx.planStepRun.update.mockResolvedValue(buildPlanStepRunRow('completed'))
    prismaState.tx.planRun.update.mockResolvedValue({
      ...buildPlanRunRow(null),
      lastSeq: 7,
    })
    prismaState.tx.planRunEvent.create.mockResolvedValue(buildPlanRunEventRow())

    const step = await completeWaitingPlanStepTask({
      planRunId: 'plan-run-1',
      userId: 'user-1',
      projectId: 'project-1',
      stepKey: 'split',
      taskId: 'task-1',
      output: { clipCount: 3 },
    })

    expect(step.status).toBe('completed')
    expect(step.output).toEqual({ clipCount: 3 })
    expect(prismaState.tx.planStepRun.findUnique).toHaveBeenCalledWith({
      where: {
        planRunId_stepKey: {
          planRunId: 'plan-run-1',
          stepKey: 'split',
        },
      },
    })
    expect(prismaState.tx.planStepRun.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'completed',
        outputJson: { clipCount: 3 },
        errorCode: null,
        errorMessage: null,
      }),
    }))
    expect(prismaState.tx.planRunEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        planRunId: 'plan-run-1',
        projectId: 'project-1',
        userId: 'user-1',
        seq: 7,
        eventType: 'step.complete',
        stepKey: 'split',
        payload: {
          status: 'completed',
          taskId: 'task-1',
        },
      }),
    })
  })

  it('fails explicitly when a persisted PlanRun status is unknown', async () => {
    prismaState.tx.planRun.findUnique.mockResolvedValue({
      ...buildPlanRunRow(null),
      status: 'mystery',
    })
    prismaState.tx.planStepRun.findMany.mockResolvedValue([])
    prismaState.tx.planArtifact.findMany.mockResolvedValue([])

    await expect(getPlanRunSnapshot('plan-run-1')).rejects.toThrow('PLAN_RUN_STATUS_INVALID:mystery')
  })

  it('builds an eval-ready trace summary from persisted PlanRun events', async () => {
    const now = new Date('2026-05-08T01:00:00.000Z')
    prismaState.tx.planRunEvent.findMany.mockResolvedValue([
      {
        id: { toString: () => '11' },
        planRunId: 'plan-run-1',
        projectId: 'project-1',
        userId: 'user-1',
        seq: 11,
        eventType: 'step.start',
        stepKey: 'video',
        payload: { operationId: 'generate_panel_video' },
        createdAt: now,
      },
      {
        id: { toString: () => '12' },
        planRunId: 'plan-run-1',
        projectId: 'project-1',
        userId: 'user-1',
        seq: 12,
        eventType: 'step.error',
        stepKey: 'video',
        payload: {
          errorCode: 'PLAN_STEP_INPUT_BUILD_FAILED',
          message: 'EDIT_TIMELINE_GENERATE_PANEL_VIDEO_LAST_FRAME_UNRESOLVED:media:last-frame',
        },
        createdAt: now,
      },
    ])

    const summary = await getPlanRunTraceSummary({
      planRunId: 'plan-run-1',
      userId: 'user-1',
      afterSeq: 10,
      limit: 20,
    })

    expect(prismaState.tx.planRunEvent.findMany).toHaveBeenCalledWith({
      where: {
        planRunId: 'plan-run-1',
        userId: 'user-1',
        seq: { gt: 10 },
      },
      orderBy: { seq: 'asc' },
      take: 20,
    })
    expect(summary.inputBuildFailures).toEqual([
      {
        stepKey: 'video',
        operationId: 'generate_panel_video',
        errorCode: 'PLAN_STEP_INPUT_BUILD_FAILED',
        message: 'EDIT_TIMELINE_GENERATE_PANEL_VIDEO_LAST_FRAME_UNRESOLVED:media:last-frame',
      },
    ])
  })

  it('finds active PlanRun steps waiting on a terminal task id', async () => {
    prismaState.tx.planStepRun.findMany.mockResolvedValue([
      {
        planRunId: 'plan-run-1',
        stepKey: 'shot_01_materialize',
        status: 'waiting_task',
        planRun: {
          userId: 'user-1',
          projectId: 'project-1',
          episodeId: 'episode-1',
          status: 'running',
        },
      },
    ])

    const waitingSteps = await listWaitingPlanStepsByTaskId('task-video-1')

    expect(waitingSteps).toEqual([
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
    expect(prismaState.tx.planStepRun.findMany).toHaveBeenCalledWith({
      where: {
        taskId: 'task-video-1',
        status: 'waiting_task',
        planRun: {
          status: {
            in: ['queued', 'running'],
          },
        },
      },
      select: {
        planRunId: true,
        stepKey: true,
        status: true,
        planRun: {
          select: {
            userId: true,
            projectId: true,
            episodeId: true,
            status: true,
          },
        },
      },
    })
  })
})
