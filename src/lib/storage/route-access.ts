import type { NextRequest } from 'next/server'
import { ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { assertUserCanAccessStorageKey } from '@/lib/storage/access-control'
import {
  hasValidStorageAccessQuery,
  normalizeStorageAccessKey,
} from '@/lib/storage/access-token'

export async function authorizeStorageKeyRequest(
  request: NextRequest,
  rawKey: string,
): Promise<string> {
  const key = normalizeStorageAccessKey(rawKey)
  const { searchParams } = new URL(request.url)
  const hasValidSignedAccess = hasValidStorageAccessQuery({
    key,
    expiresAt: searchParams.get('expiresAt'),
    signature: searchParams.get('signature'),
  })

  if (hasValidSignedAccess) return key

  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) {
    throw new ApiError('UNAUTHORIZED')
  }

  await assertUserCanAccessStorageKey({
    key,
    userId: authResult.session.user.id,
  })

  return key
}
