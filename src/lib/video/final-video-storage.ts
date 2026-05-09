const FINAL_VIDEO_STORAGE_SEGMENT = 'final-videos'

function trimString(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

function storageKeyFromPathname(pathname: string): string | null {
  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(pathname).replace(/^\/+/, '')
  } catch {
    decodedPath = pathname.replace(/^\/+/, '')
  }

  const parts = decodedPath.split('/').filter((part) => part.length > 0)
  const finalVideosIndex = parts.indexOf(FINAL_VIDEO_STORAGE_SEGMENT)
  if (finalVideosIndex < 0) return null
  return parts.slice(finalVideosIndex).join('/')
}

export function extractFinalVideoStorageKey(value: string | null | undefined): string | null {
  const ref = trimString(value)
  if (!ref) return null

  if (ref.startsWith(`${FINAL_VIDEO_STORAGE_SEGMENT}/`)) return ref

  try {
    const parsed = new URL(ref, 'http://workspace.local')
    const keyFromQuery = parsed.searchParams.get('key')
    if (keyFromQuery?.startsWith(`${FINAL_VIDEO_STORAGE_SEGMENT}/`)) return keyFromQuery
    return storageKeyFromPathname(parsed.pathname)
  } catch {
    return storageKeyFromPathname(ref)
  }
}

export function buildProjectVideoProxyUrl(projectId: string, storageKey: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/video-proxy?key=${encodeURIComponent(storageKey)}`
}
