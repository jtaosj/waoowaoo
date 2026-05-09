import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import type { VideoEditorProject } from '@/features/video-editor/types/editor.types'
import { calculateTimelineDuration } from '@/features/video-editor/utils/time-utils'
import { VIDEO_EDITOR_COMPOSITION_ID } from '@/features/video-editor/remotion/constants'
import { getSignedObjectUrl, toFetchableUrl, uploadObject } from '@/lib/storage'

type RuntimeImport = <TModule>(specifier: string) => Promise<TModule>
type RenderInputProps = {
  clips: VideoEditorProject['timeline']
  bgmTrack: VideoEditorProject['bgmTrack']
  config: VideoEditorProject['config']
}
type SelectedComposition = Record<string, unknown>
type RemotionBundle = (options: { entryPoint: string }) => Promise<string>
type RemotionSelectComposition = (options: {
  serveUrl: string
  id: string
  inputProps: RenderInputProps
}) => Promise<SelectedComposition>
type RemotionRenderMedia = (options: {
  serveUrl: string
  composition: SelectedComposition & {
    fps: number
    width: number
    height: number
    durationInFrames: number
  }
  inputProps: RenderInputProps
  codec: 'h264'
  outputLocation: string
  overwrite: boolean
  logLevel: 'warn'
}) => Promise<void>
type RemotionBundlerRuntimeModule = {
  bundle: RemotionBundle
}
type RemotionRendererRuntimeModule = {
  renderMedia: RemotionRenderMedia
  selectComposition: RemotionSelectComposition
}

export interface RenderVideoEditorProjectToStorageInput {
  project: VideoEditorProject
  outputKey: string
}

export interface RenderVideoEditorProjectToStorageResult {
  storageKey: string
  outputUrl: string
}

function assertRenderableProject(project: VideoEditorProject): void {
  if (project.timeline.length === 0) {
    throw new Error('VIDEO_EDITOR_RENDER_TIMELINE_EMPTY')
  }
  const durationInFrames = calculateTimelineDuration(project.timeline)
  if (!Number.isFinite(durationInFrames) || durationInFrames <= 0) {
    throw new Error('VIDEO_EDITOR_RENDER_DURATION_INVALID')
  }
}

const importRuntimeModule = new Function('specifier', 'return import(specifier)') as RuntimeImport

async function loadRemotionRenderModules(): Promise<{
  bundle: RemotionBundle
  renderMedia: RemotionRenderMedia
  selectComposition: RemotionSelectComposition
}> {
  const [{ bundle }, { renderMedia, selectComposition }] = await Promise.all([
    importRuntimeModule<RemotionBundlerRuntimeModule>('@remotion/bundler'),
    importRuntimeModule<RemotionRendererRuntimeModule>('@remotion/renderer'),
  ])
  return { bundle, renderMedia, selectComposition }
}

const RENDER_MEDIA_SIGNED_URL_EXPIRES_SECONDS = 7 * 24 * 60 * 60

export async function toRenderableVideoEditorMediaUrl(inputUrl: string): Promise<string> {
  const trimmed = inputUrl.trim()
  if (!trimmed) return trimmed
  if (
    trimmed.startsWith('http://')
    || trimmed.startsWith('https://')
    || trimmed.startsWith('data:')
  ) {
    return trimmed
  }
  if (trimmed.startsWith('/')) {
    return toFetchableUrl(trimmed)
  }
  return toFetchableUrl(await getSignedObjectUrl(trimmed, RENDER_MEDIA_SIGNED_URL_EXPIRES_SECONDS))
}

async function projectForRender(project: VideoEditorProject): Promise<VideoEditorProject> {
  const timeline = await Promise.all(project.timeline.map(async (clip) => ({
    ...clip,
    src: await toRenderableVideoEditorMediaUrl(clip.src),
    attachment: clip.attachment
      ? {
          ...clip.attachment,
          audio: clip.attachment.audio
            ? {
                ...clip.attachment.audio,
                src: await toRenderableVideoEditorMediaUrl(clip.attachment.audio.src),
              }
            : undefined,
        }
      : undefined,
  })))
  const bgmTrack = await Promise.all(project.bgmTrack.map(async (track) => ({
    ...track,
    src: await toRenderableVideoEditorMediaUrl(track.src),
  })))

  return {
    ...project,
    timeline,
    bgmTrack,
  }
}

export async function renderVideoEditorProjectToStorage(
  input: RenderVideoEditorProjectToStorageInput,
): Promise<RenderVideoEditorProjectToStorageResult> {
  assertRenderableProject(input.project)

  const project = await projectForRender(input.project)
  const durationInFrames = calculateTimelineDuration(project.timeline)
  const entryPoint = path.join(process.cwd(), 'src/features/video-editor/remotion/RenderRoot.tsx')
  const outputLocation = path.join(
    os.tmpdir(),
    `waoowaoo-final-video-${input.project.id}-${Date.now()}.mp4`,
  )

  try {
    const { bundle, renderMedia, selectComposition } = await loadRemotionRenderModules()
    const serveUrl = await bundle({
      entryPoint,
    })
    const inputProps = {
      clips: project.timeline,
      bgmTrack: project.bgmTrack,
      config: project.config,
    }
    const composition = await selectComposition({
      serveUrl,
      id: VIDEO_EDITOR_COMPOSITION_ID,
      inputProps,
    })

    await renderMedia({
      serveUrl,
      composition: {
        ...composition,
        fps: project.config.fps,
        width: project.config.width,
        height: project.config.height,
        durationInFrames,
      },
      inputProps,
      codec: 'h264',
      outputLocation,
      overwrite: true,
      logLevel: 'warn',
    })

    const body = await fs.readFile(outputLocation)
    const storageKey = await uploadObject(body, input.outputKey, 1, 'video/mp4')
    const outputUrl = await getSignedObjectUrl(storageKey, RENDER_MEDIA_SIGNED_URL_EXPIRES_SECONDS)
    return {
      storageKey,
      outputUrl: toFetchableUrl(outputUrl),
    }
  } finally {
    await fs.rm(outputLocation, { force: true })
  }
}
