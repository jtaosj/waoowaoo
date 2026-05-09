export interface WorkspaceCanvasFinalVideo {
  readonly editorProjectId?: string | null
  readonly url?: string | null
  readonly status?: string | null
  readonly updatedAt?: string | null
}

export function normalizePlayableFinalVideoUrl(value: string | null | undefined): string | null {
  const url = value?.trim()
  if (!url) return null
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/') || url.startsWith('blob:')) {
    return url
  }
  return null
}
