import { beforeEach, describe, expect, it, vi } from 'vitest'

const submitOperationTaskMock = vi.hoisted(() => vi.fn(async () => ({
  success: true,
  async: true,
  taskId: 'task-1',
  status: 'queued',
  runId: null,
  deduped: false,
})))
vi.mock('@/lib/operations/submit-operation-task', () => ({
  submitOperationTask: submitOperationTaskMock,
}))

vi.mock('@/lib/task/resolve-locale', () => ({
  resolveRequiredTaskLocale: vi.fn(() => 'zh'),
}))

vi.mock('@/lib/billing', () => ({
  buildDefaultTaskBillingInfo: vi.fn(() => ({ mode: 'default' })),
}))

const mutationBatchMock = vi.hoisted(() => ({
  createMutationBatch: vi.fn(async () => ({ id: 'mutation-batch-1' })),
}))
vi.mock('@/lib/mutation-batch/service', () => mutationBatchMock)

const hasOutputMock = vi.hoisted(() => ({
  hasPanelVideoOutput: vi.fn(async () => false),
}))
vi.mock('@/lib/task/has-output', () => hasOutputMock)

const prismaMock = vi.hoisted(() => ({
  projectEpisode: {
    findFirst: vi.fn(async (): Promise<{ id: string } | null> => ({ id: 'episode-1' })),
  },
  projectPanel: {
    findUnique: vi.fn(async () => ({
      videoUrl: null,
      lastVideoGenerationOptions: null,
      storyboard: { episodeId: 'episode-1' },
    })),
    findFirst: vi.fn(async (): Promise<{
      id: string
      videoUrl: null
      lastVideoGenerationOptions: null
      storyboard: { episodeId: string }
    } | null> => ({
      id: 'panel-1',
      videoUrl: null,
      lastVideoGenerationOptions: null,
      storyboard: { episodeId: 'episode-1' },
    })),
    findMany: vi.fn(async () => []),
  },
}))
vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

const configServiceMock = vi.hoisted(() => ({
  resolveProjectModelCapabilityGenerationOptions: vi.fn(async (input: {
    runtimeSelections: Record<string, string | number | boolean>
  }) => input.runtimeSelections),
}))
vi.mock('@/lib/config-service', () => configServiceMock)

vi.mock('@/lib/ai-registry/selection', () => ({
  parseModelKeyStrict: vi.fn((value: string) => (
    value.includes('::') ? { provider: value.split('::')[0], model: value.split('::')[1] } : null
  )),
}))

vi.mock('@/lib/ai-registry/capabilities-catalog', () => ({
  resolveBuiltinCapabilitiesByModelKey: vi.fn(() => ({
    video: { firstlastframe: true },
  })),
}))

vi.mock('@/lib/ai-registry/pricing-resolution', () => ({
  resolveBuiltinPricing: vi.fn(() => ({ status: 'ok' })),
}))

vi.mock('@/lib/ai-exec/video-token-pricing', () => ({
  resolveAiVideoTokenPricingContract: vi.fn(() => null),
}))

vi.mock('@/lib/ai-exec/catalog-bootstrap', () => ({
  ensureAiCatalogsRegistered: vi.fn(),
}))

import { createVideoGenerationOperations } from '@/lib/operations/domains/media/video-generation-ops'

function buildCtx() {
  return {
    request: new Request('http://localhost') as unknown as import('next/server').NextRequest,
    userId: 'user-1',
    projectId: 'project-1',
    context: { locale: 'zh' },
    source: 'assistant-panel',
    writer: null,
  }
}

describe('video generation operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('generate_panel_video rejects first-last-frame mode without a concrete last-frame source before submitting', async () => {
    const ops = createVideoGenerationOperations()
    const ctx = buildCtx()

    await expect(ops.generate_panel_video.execute(ctx as never, {
      confirmed: true,
      panelId: 'panel-1',
      videoModel: 'google::veo-3.1-generate-preview',
      firstLastFrame: {
        flModel: 'google::veo-3.1-generate-preview',
      },
      generationOptions: {
        duration: 8,
        resolution: '720p',
      },
    })).rejects.toThrow('PROJECT_AGENT_FIRSTLASTFRAME_LAST_FRAME_REQUIRED')

    expect(submitOperationTaskMock).not.toHaveBeenCalled()
  })

  it('generate_panel_video rejects a panel outside the current project before submitting a task', async () => {
    const ops = createVideoGenerationOperations()
    const ctx = buildCtx()
    prismaMock.projectPanel.findFirst.mockResolvedValueOnce(null)

    await expect(ops.generate_panel_video.execute(ctx as never, {
      confirmed: true,
      panelId: 'foreign-panel',
      videoModel: 'google::veo-3.1-generate-preview',
      generationOptions: {
        duration: 8,
        resolution: '720p',
      },
    })).rejects.toThrow('PROJECT_AGENT_PANEL_NOT_FOUND')

    expect(prismaMock.projectPanel.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'foreign-panel',
        storyboard: {
          episode: {
            projectId: 'project-1',
          },
        },
      },
      select: {
        videoUrl: true,
        lastVideoGenerationOptions: true,
        storyboard: { select: { episodeId: true } },
      },
    })
    expect(submitOperationTaskMock).not.toHaveBeenCalled()
    expect(mutationBatchMock.createMutationBatch).not.toHaveBeenCalled()
  })

  it('generate_episode_videos rejects a foreign episode before scanning panels or submitting tasks', async () => {
    const ops = createVideoGenerationOperations()
    const ctx = buildCtx()
    prismaMock.projectEpisode.findFirst.mockResolvedValueOnce(null)

    await expect(ops.generate_episode_videos.execute(ctx as never, {
      confirmed: true,
      episodeId: 'foreign-episode',
      videoModel: 'google::veo-3.1-generate-preview',
      generationOptions: {
        duration: 8,
        resolution: '720p',
      },
    })).rejects.toThrow('PROJECT_AGENT_EPISODE_NOT_FOUND')

    expect(prismaMock.projectEpisode.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'foreign-episode',
        projectId: 'project-1',
      },
      select: { id: true },
    })
    expect(prismaMock.projectPanel.findMany).not.toHaveBeenCalled()
    expect(submitOperationTaskMock).not.toHaveBeenCalled()
    expect(mutationBatchMock.createMutationBatch).not.toHaveBeenCalled()
  })
})
