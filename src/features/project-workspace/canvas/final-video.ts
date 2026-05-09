import {
  buildProjectVideoProxyUrl,
  extractFinalVideoStorageKey,
} from '@/lib/video/final-video-storage'

export { extractFinalVideoStorageKey } from '@/lib/video/final-video-storage'

export interface WorkspaceCanvasFinalVideo {
  readonly editorProjectId?: string | null
  readonly url?: string | null
  readonly storageKey?: string | null
  readonly status?: string | null
  readonly updatedAt?: string | null
}

function trimString(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

export function normalizePlayableFinalVideoUrl(
  value: string | null | undefined,
  projectId?: string | null,
): string | null {
  const url = value?.trim()
  if (!url) return null
  if (url.startsWith('/api/projects/') && url.includes('/video-proxy')) return url
  if (projectId?.trim()) {
    const storageKey = extractFinalVideoStorageKey(url)
    if (storageKey) return buildProjectVideoProxyUrl(projectId.trim(), storageKey)
  }
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/') || url.startsWith('blob:')) {
    return url
  }
  return null
}

export function normalizeFinalVideoEvidenceLabel(value: string | null | undefined): string | null {
  const ref = trimString(value)
  if (!ref) return null
  return extractFinalVideoStorageKey(ref) ?? ref
}

export function normalizeFinalVideoForPlayback(params: {
  readonly projectId?: string | null
  readonly url?: string | null
  readonly storageKey?: string | null
}): string | null {
  const projectId = trimString(params.projectId)
  const storageKey = trimString(params.storageKey)
  if (projectId && storageKey) return buildProjectVideoProxyUrl(projectId, storageKey)
  return normalizePlayableFinalVideoUrl(params.url, projectId || null)
}
