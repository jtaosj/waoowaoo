import * as fs from 'fs/promises'
import * as path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { authorizeStorageKeyRequest } from '@/lib/storage/route-access'

const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads'

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.json': 'application/json',
  '.txt': 'text/plain',
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return MIME_TYPES[ext] || 'application/octet-stream'
}

function resolveLocalFilePath(decodedPath: string): string {
  const filePath = path.join(process.cwd(), UPLOAD_DIR, decodedPath)
  const normalizedPath = path.normalize(filePath)
  const uploadDirPath = path.normalize(path.join(process.cwd(), UPLOAD_DIR))

  if (!normalizedPath.startsWith(uploadDirPath + path.sep)) {
    throw new ApiError('FORBIDDEN', {
      code: 'LOCAL_FILE_PATH_TRAVERSAL',
      field: 'path',
      message: 'local file path is outside upload directory',
    })
  }

  return filePath
}

export const GET = apiHandler<{ path: string[] }>(async (
  request: NextRequest,
  { params },
) => {
  const { path: pathSegments } = await params
  const decodedPath = decodeURIComponent(pathSegments.join('/'))
  const filePath = resolveLocalFilePath(decodedPath)
  const key = await authorizeStorageKeyRequest(request, decodedPath)

  try {
    const buffer = await fs.readFile(filePath)
    const mimeType = getMimeType(key)

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=31536000',
      },
    })
  } catch (error: unknown) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined
    if (code === 'ENOENT') {
      throw new ApiError('NOT_FOUND', {
        code: 'LOCAL_FILE_NOT_FOUND',
        field: 'path',
        message: 'local file not found',
      })
    }
    throw error
  }
})
