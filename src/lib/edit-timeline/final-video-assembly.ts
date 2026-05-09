import type { VideoEditorProject, VideoClip } from '@/features/video-editor/types/editor.types'
import { parseEditTimeline } from './compiler'
import type { EditTimeline, ParsedEditTimeline, ShotNode } from './types'

export interface TimelinePanelVideoSource {
  shotId: string
  panelId: string
  storyboardId: string
  panelIndex: number
  videoUrl?: string | null
  videoMediaId?: string | null
  videoMediaStorageKey?: string | null
  durationSeconds?: number | null
  caption?: string | null
  description?: string | null
}

export interface BuildTimelineVideoEditorProjectInput {
  episodeId: string
  timeline: EditTimeline | ParsedEditTimeline
  panelVideos: readonly TimelinePanelVideoSource[]
  editorProjectId?: string
}

function dimensionsForAspectRatio(aspectRatio: string): { width: number; height: number } {
  if (aspectRatio === '9:16') return { width: 1080, height: 1920 }
  if (aspectRatio === '16:9') return { width: 1920, height: 1080 }
  if (aspectRatio === '1:1') return { width: 1080, height: 1080 }
  throw new Error(`EDIT_TIMELINE_FINAL_VIDEO_ASPECT_RATIO_UNSUPPORTED:${aspectRatio}`)
}

function orderedShots(timeline: ParsedEditTimeline): ShotNode[] {
  return [...timeline.shots].sort((left, right) => {
    if (left.startMs !== right.startMs) return left.startMs - right.startMs
    if (left.order !== right.order) return left.order - right.order
    return left.id.localeCompare(right.id)
  })
}

function normalizeEditorId(params: {
  timelineId: string
  editorProjectId?: string
}): string {
  return params.editorProjectId?.trim() || `editor-${params.timelineId}`
}

export function resolveTimelinePanelVideoRef(source: Pick<TimelinePanelVideoSource, 'videoUrl' | 'videoMediaStorageKey'>): string | null {
  const storageKey = source.videoMediaStorageKey?.trim()
  if (storageKey) return storageKey

  const videoUrl = source.videoUrl?.trim()
  if (videoUrl) return videoUrl

  return null
}

function durationInFrames(params: {
  fps: number
  shot: ShotNode
  source: TimelinePanelVideoSource
}): number {
  const seconds = params.source.durationSeconds ?? params.shot.control.durationSeconds ?? params.shot.durationMs / 1000
  return Math.max(1, Math.round(seconds * params.fps))
}

function clipSubtitle(params: {
  shot: ShotNode
  source: TimelinePanelVideoSource
}): VideoClip['attachment'] {
  const text = params.source.caption?.trim() || params.shot.editorial?.caption?.trim()
  if (!text) return undefined
  return {
    subtitle: {
      text,
      style: 'cinematic',
    },
  }
}

export function buildTimelineVideoEditorProject(
  input: BuildTimelineVideoEditorProjectInput,
): VideoEditorProject {
  const timeline = parseEditTimeline(input.timeline)
  const dims = dimensionsForAspectRatio(timeline.aspectRatio)
  const sourcesByShotId = new Map(input.panelVideos.map((source) => [source.shotId, source]))
  const clips: VideoClip[] = orderedShots(timeline).map((shot) => {
    const source = sourcesByShotId.get(shot.id)
    if (!source) {
      throw new Error(`EDIT_TIMELINE_FINAL_VIDEO_PANEL_VIDEO_MISSING:${shot.id}`)
    }
    const videoRef = resolveTimelinePanelVideoRef(source)
    if (!videoRef) {
      throw new Error(`EDIT_TIMELINE_FINAL_VIDEO_PANEL_VIDEO_MISSING:${shot.id}`)
    }
    return {
      id: `clip-${shot.id}`,
      src: videoRef,
      durationInFrames: durationInFrames({
        fps: timeline.fps,
        shot,
        source,
      }),
      attachment: clipSubtitle({
        shot,
        source,
      }),
      transition: {
        type: 'none',
        durationInFrames: 0,
      },
      metadata: {
        panelId: source.panelId,
        storyboardId: source.storyboardId,
        description: source.description?.trim() || shot.goal,
      },
    }
  })

  if (clips.length !== timeline.shots.length) {
    throw new Error('EDIT_TIMELINE_FINAL_VIDEO_CLIP_COUNT_MISMATCH')
  }

  return {
    id: normalizeEditorId({
      timelineId: timeline.id,
      editorProjectId: input.editorProjectId,
    }),
    episodeId: input.episodeId,
    schemaVersion: '1.0',
    config: {
      fps: timeline.fps,
      width: dims.width,
      height: dims.height,
    },
    timeline: clips,
    bgmTrack: [],
  }
}
