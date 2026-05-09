import type { Prisma } from '@prisma/client'
import { ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { normalizeStorageAccessKey } from '@/lib/storage/access-token'

function projectPanelMediaAccess(userId: string) {
  return {
    some: {
      storyboard: {
        episode: {
          project: { userId },
        },
      },
    },
  }
}

function projectStoryboardMediaAccess(userId: string) {
  return {
    some: {
      storyboard: {
        episode: {
          project: { userId },
        },
      },
    },
  }
}

function globalCharacterAppearanceAccess(userId: string) {
  return {
    some: {
      character: { userId },
    },
  }
}

function globalLocationImageAccess(userId: string) {
  return {
    some: {
      location: { userId },
    },
  }
}

function storageAccessWhere(params: { key: string; userId: string }): Prisma.MediaObjectWhereInput {
  const { key, userId } = params
  return {
    storageKey: key,
    OR: [
      { characterAppearanceImages: { some: { character: { project: { userId } } } } },
      { locationImages: { some: { location: { project: { userId } } } } },
      { projectCharacterVoices: { some: { project: { userId } } } },
      { projectEpisodeAudios: { some: { project: { userId } } } },
      { projectPanelImages: projectPanelMediaAccess(userId) },
      { projectPanelVideos: projectPanelMediaAccess(userId) },
      { projectPanelLipSyncVideos: projectPanelMediaAccess(userId) },
      { projectPanelSketchImages: projectPanelMediaAccess(userId) },
      { projectPanelPreviousImages: projectPanelMediaAccess(userId) },
      { projectShotImages: { some: { episode: { project: { userId } } } } },
      { supplementaryPanelImages: projectStoryboardMediaAccess(userId) },
      { projectVoiceLineAudios: { some: { episode: { project: { userId } } } } },
      { voicePresetAudios: { some: { isSystem: true } } },
      { globalCharacterVoices: { some: { userId } } },
      { globalCharacterAppearanceImages: globalCharacterAppearanceAccess(userId) },
      { globalCharacterAppearancePreviousImgs: globalCharacterAppearanceAccess(userId) },
      { globalLocationImageImages: globalLocationImageAccess(userId) },
      { globalLocationImagePreviousImages: globalLocationImageAccess(userId) },
      { globalVoiceCustomVoices: { some: { userId } } },
    ],
  }
}

export async function assertUserCanAccessStorageKey(params: {
  key: string
  userId: string
}): Promise<void> {
  const key = normalizeStorageAccessKey(params.key)
  const media = await prisma.mediaObject.findFirst({
    where: storageAccessWhere({ key, userId: params.userId }),
    select: { id: true },
  })

  if (!media) {
    throw new ApiError('NOT_FOUND', {
      code: 'STORAGE_OBJECT_NOT_FOUND',
      field: 'key',
      message: 'storage object not found',
    })
  }
}
