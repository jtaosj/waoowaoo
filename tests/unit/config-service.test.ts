import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
  },
  userPreference: {
    findUnique: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

import { getProjectModelConfig } from '@/lib/config-service'

describe('config-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses user default media models when project model fields are empty', async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      analysisModel: null,
      characterModel: null,
      locationModel: null,
      storyboardModel: null,
      editModel: null,
      videoModel: null,
      audioModel: null,
      musicModel: null,
      videoRatio: '9:16',
      artStyle: 'american-comic',
      capabilityOverrides: null,
    })
    prismaMock.userPreference.findUnique.mockResolvedValue({
      analysisModel: 'ark::analysis',
      characterModel: 'ark::character',
      locationModel: 'ark::location',
      storyboardModel: 'ark::storyboard',
      editModel: 'ark::edit',
      videoModel: 'ark::video',
      audioModel: 'ark::audio',
      musicModel: 'ark::music',
      capabilityDefaults: JSON.stringify({
        'ark::video': {
          duration: 2,
          resolution: '480p',
        },
      }),
    })

    const config = await getProjectModelConfig('project-1', 'user-1')

    expect(config).toMatchObject({
      analysisModel: 'ark::analysis',
      characterModel: 'ark::character',
      locationModel: 'ark::location',
      storyboardModel: 'ark::storyboard',
      editModel: 'ark::edit',
      videoModel: 'ark::video',
      audioModel: 'ark::audio',
      musicModel: 'ark::music',
      videoRatio: '9:16',
      artStyle: 'american-comic',
    })
    expect(config.capabilityDefaults['ark::video']).toEqual({
      duration: 2,
      resolution: '480p',
    })
  })

  it('keeps project model selections ahead of user defaults', async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      analysisModel: 'ark::project-analysis',
      characterModel: 'ark::project-character',
      locationModel: 'ark::project-location',
      storyboardModel: 'ark::project-storyboard',
      editModel: 'ark::project-edit',
      videoModel: 'ark::project-video',
      audioModel: null,
      musicModel: null,
      videoRatio: '16:9',
      artStyle: null,
      capabilityOverrides: null,
    })
    prismaMock.userPreference.findUnique.mockResolvedValue({
      analysisModel: 'ark::user-analysis',
      characterModel: 'ark::user-character',
      locationModel: 'ark::user-location',
      storyboardModel: 'ark::user-storyboard',
      editModel: 'ark::user-edit',
      videoModel: 'ark::user-video',
      audioModel: 'ark::user-audio',
      musicModel: 'ark::user-music',
      capabilityDefaults: null,
    })

    const config = await getProjectModelConfig('project-1', 'user-1')

    expect(config).toMatchObject({
      analysisModel: 'ark::project-analysis',
      characterModel: 'ark::project-character',
      locationModel: 'ark::project-location',
      storyboardModel: 'ark::project-storyboard',
      editModel: 'ark::project-edit',
      videoModel: 'ark::project-video',
      audioModel: 'ark::user-audio',
      musicModel: 'ark::user-music',
      videoRatio: '16:9',
    })
  })
})
