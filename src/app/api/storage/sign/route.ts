import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { getSignedObjectUrl } from '@/lib/storage'
import { authorizeStorageKeyRequest } from '@/lib/storage/route-access'

const DEFAULT_EXPIRES_SECONDS = 3600

export const GET = apiHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url)
  const rawKey = searchParams.get('key')
  const expiresRaw = searchParams.get('expires')

  if (!rawKey) {
    throw new ApiError('INVALID_PARAMS')
  }

  const expires = expiresRaw ? Number.parseInt(expiresRaw, 10) : DEFAULT_EXPIRES_SECONDS
  const ttl = Number.isFinite(expires) && expires > 0 ? expires : DEFAULT_EXPIRES_SECONDS
  const key = await authorizeStorageKeyRequest(request, rawKey)

  const signedUrl = await getSignedObjectUrl(key, ttl)
  return NextResponse.redirect(new URL(signedUrl, request.url))
})
