'use client'

import { useEpisodeData } from '@/lib/query/hooks'
import type { ProjectClip, ProjectShot, ProjectStoryboard } from '@/types/project'
import { useWorkspaceProvider } from '../WorkspaceProvider'
import type { WorkspaceCanvasFinalVideo } from '../canvas/final-video'

interface EpisodeEditorProjectPayload {
  readonly id?: string | null
  readonly outputUrl?: string | null
  readonly renderStatus?: string | null
  readonly updatedAt?: string | Date | null
}

interface EpisodeStagePayload {
  name?: string
  novelText?: string | null
  audioUrl?: string | null
  srtContent?: string | null
  clips?: ProjectClip[]
  storyboards?: ProjectStoryboard[]
  shots?: ProjectShot[]
  editorProject?: EpisodeEditorProjectPayload | null
}

function readFinalVideo(editorProject: EpisodeEditorProjectPayload | null | undefined): WorkspaceCanvasFinalVideo | null {
  if (!editorProject) return null
  return {
    editorProjectId: editorProject.id ?? null,
    url: editorProject.outputUrl ?? null,
    status: editorProject.renderStatus ?? null,
    updatedAt: editorProject.updatedAt instanceof Date
      ? editorProject.updatedAt.toISOString()
      : editorProject.updatedAt ?? null,
  }
}

export function useWorkspaceEpisodeStageData() {
  const { projectId, episodeId } = useWorkspaceProvider()
  const { data: episodeData } = useEpisodeData(projectId, episodeId || null)
  const payload = episodeData as EpisodeStagePayload | null

  return {
    episodeName: payload?.name,
    novelText: payload?.novelText || '',
    audioUrl: payload?.audioUrl || null,
    srtContent: payload?.srtContent || null,
    clips: payload?.clips || [],
    storyboards: payload?.storyboards || [],
    shots: payload?.shots || [],
    finalVideo: readFinalVideo(payload?.editorProject),
  }
}
