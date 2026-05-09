import { createHmac, timingSafeEqual } from 'node:crypto'
import { ApiError } from '@/lib/api-errors'
import { DEFAULT_SIGNED_URL_EXPIRES_SECONDS, normalizeKey } from '@/lib/storage/utils'

const TOKEN_VERSION = 'v1'
const MAX_EXPIRES_SECONDS = 7 * 24 * 60 * 60

function requireStorageAccessSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret?.trim()) {
    throw new ApiError('MISSING_CONFIG', {
      code: 'STORAGE_ACCESS_SECRET_MISSING',
      field: 'NEXTAUTH_SECRET',
      message: 'NEXTAUTH_SECRET is required to sign storage access URLs',
    })
  }
  return secret.trim()
}

function toBase64Url(input: Buffer): string {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function signingPayload(key: string, expiresAt: number): string {
  return `${TOKEN_VERSION}:${key}:${expiresAt}`
}

function createSignature(key: string, expiresAt: number): string {
  return toBase64Url(
    createHmac('sha256', requireStorageAccessSecret())
      .update(signingPayload(key, expiresAt))
      .digest(),
  )
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

export function normalizeStorageAccessKey(rawKey: string): string {
  const key = normalizeKey(rawKey.trim())
  if (!key || key.includes('\0') || key.includes('\\')) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'INVALID_STORAGE_KEY',
      field: 'key',
      message: 'storage key is invalid',
    })
  }

  const hasTraversalSegment = key.split('/').some((segment) => segment === '..')
  if (hasTraversalSegment) {
    throw new ApiError('FORBIDDEN', {
      code: 'STORAGE_KEY_TRAVERSAL',
      field: 'key',
      message: 'storage key cannot contain path traversal segments',
    })
  }

  return key
}

export function resolveStorageAccessExpiresAt(
  expiresInSeconds: number = DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
  nowMs: number = Date.now(),
): number {
  const normalizedSeconds = Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
    ? Math.floor(expiresInSeconds)
    : DEFAULT_SIGNED_URL_EXPIRES_SECONDS
  const boundedSeconds = Math.min(normalizedSeconds, MAX_EXPIRES_SECONDS)
  return Math.floor(nowMs / 1000) + boundedSeconds
}

export function createStorageAccessQuery(
  rawKey: string,
  expiresInSeconds: number = DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
): URLSearchParams {
  const key = normalizeStorageAccessKey(rawKey)
  const expiresAt = resolveStorageAccessExpiresAt(expiresInSeconds)
  const params = new URLSearchParams()
  params.set('expiresAt', String(expiresAt))
  params.set('signature', createSignature(key, expiresAt))
  return params
}

export function createSignedStorageRoutePath(params: {
  route: 'files' | 'storage-sign'
  key: string
  expiresInSeconds?: number
}): string {
  const key = normalizeStorageAccessKey(params.key)
  const query = createStorageAccessQuery(key, params.expiresInSeconds)

  if (params.route === 'files') {
    return `/api/files/${encodeURIComponent(key)}?${query.toString()}`
  }

  query.set('key', key)
  query.set('expires', String(params.expiresInSeconds || DEFAULT_SIGNED_URL_EXPIRES_SECONDS))
  return `/api/storage/sign?${query.toString()}`
}

export function hasValidStorageAccessQuery(params: {
  key: string
  expiresAt: string | null
  signature: string | null
  nowMs?: number
}): boolean {
  if (!params.expiresAt || !params.signature) return false

  const expiresAt = Number.parseInt(params.expiresAt, 10)
  if (!Number.isFinite(expiresAt)) return false

  const nowSeconds = Math.floor((params.nowMs || Date.now()) / 1000)
  if (expiresAt <= nowSeconds) return false

  const key = normalizeStorageAccessKey(params.key)
  return safeEqual(params.signature, createSignature(key, expiresAt))
}
