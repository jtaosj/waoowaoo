import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { createSignedStorageRoutePath } from '@/lib/storage/access-token'
import { authorizeStorageKeyRequest } from '@/lib/storage/route-access'

export const GET = apiHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url)
  const rawKey = searchParams.get('key')
  const expires = searchParams.get('expires') || '3600'

  if (!rawKey) {
    throw new ApiError('INVALID_PARAMS')
  }

  const expiresInSeconds = Number.parseInt(expires, 10)
  const key = await authorizeStorageKeyRequest(request, rawKey)
  const location = createSignedStorageRoutePath({
    route: 'storage-sign',
    key,
    expiresInSeconds: Number.isFinite(expiresInSeconds) && expiresInSeconds > 0 ? expiresInSeconds : 3600,
  })
  return NextResponse.redirect(new URL(location, request.url))
})
