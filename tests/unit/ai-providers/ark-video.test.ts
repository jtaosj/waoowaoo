import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiProviderVideoExecutionContext } from '@/lib/ai-providers/runtime-types'

const runtimeConfigMock = vi.hoisted(() => ({
  getProviderConfig: vi.fn(async () => ({ apiKey: 'ark-key' })),
}))

const normalizeToBase64ForGenerationMock = vi.hoisted(() => vi.fn(async (input: string) => `base64:${input}`))

vi.mock('@/lib/user-api/runtime-config', () => runtimeConfigMock)
vi.mock('@/lib/media/outbound-image', () => ({
  normalizeToBase64ForGeneration: normalizeToBase64ForGenerationMock,
}))

import { executeArkVideoGeneration } from '@/lib/ai-providers/ark/video'

function buildArkInput(overrides?: Partial<AiProviderVideoExecutionContext>): AiProviderVideoExecutionContext {
  return {
    userId: 'user-1',
    selection: {
      provider: 'ark',
      modelId: 'doubao-seedance-2-0-260128',
      modelKey: 'ark::doubao-seedance-2-0-260128',
      variantSubKind: 'official',
    },
    imageUrl: '',
    options: {
      prompt: '纯文本生成一个竖屏镜头',
      duration: 5,
      resolution: '720p',
      aspectRatio: '9:16',
      generateAudio: true,
    },
    ...(overrides || {}),
  }
}

describe('executeArkVideoGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('submits text-to-video payload without requiring source imageUrl', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'cgt-text-video-1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await executeArkVideoGeneration(buildArkInput())

    expect(result).toMatchObject({
      success: true,
      async: true,
      requestId: 'cgt-text-video-1',
      externalId: 'ARK:VIDEO:cgt-text-video-1',
    })
    expect(normalizeToBase64ForGenerationMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const firstCall = fetchMock.mock.calls[0]
    expect(firstCall).toBeTruthy()
    const [, init] = firstCall as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'doubao-seedance-2-0-260128',
      content: [
        { type: 'text', text: '纯文本生成一个竖屏镜头' },
      ],
      resolution: '720p',
      ratio: '9:16',
      duration: 5,
      generate_audio: true,
    })
  })

  it('fails first-last-frame generation explicitly when source image is missing', async () => {
    await expect(executeArkVideoGeneration(buildArkInput({
      options: {
        prompt: '首尾帧生成',
        lastFrameImageUrl: 'https://example.com/last.png',
      },
    }))).rejects.toThrow('ARK_VIDEO_FIRST_FRAME_IMAGE_REQUIRED')
    expect(normalizeToBase64ForGenerationMock).not.toHaveBeenCalled()
  })
})
