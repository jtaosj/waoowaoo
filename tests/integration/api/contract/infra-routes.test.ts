import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTE_CATALOG } from '../../../contracts/route-catalog'
import { buildMockRequest } from '../../../helpers/request'

const authState = vi.hoisted(() => ({
  authenticated: false,
}))

const loggingMock = vi.hoisted(() => ({
  readAllLogs: vi.fn(async () => 'worker log line 1\nworker log line 2'),
}))

const storageMock = vi.hoisted(() => ({
  getSignedObjectUrl: vi.fn(async (key: string, ttl: number) => `https://signed.example/${key}?expires=${ttl}`),
}))

const storageAccessMock = vi.hoisted(() => ({
  assertUserCanAccessStorageKey: vi.fn(async () => undefined),
}))

vi.mock('@/lib/api-auth', () => {
  const unauthorized = () => new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )

  return {
    isErrorResponse: (value: unknown) => value instanceof Response,
    requireUserAuth: async () => {
      if (!authState.authenticated) return unauthorized()
      return { session: { user: { id: 'user-1' } } }
    },
  }
})

vi.mock('@/lib/logging/file-writer', () => loggingMock)
vi.mock('@/lib/storage', () => storageMock)
vi.mock('@/lib/storage/access-control', () => storageAccessMock)

describe('api contract - infra routes (behavior)', () => {
  const routes = ROUTE_CATALOG.filter((entry) => entry.contractGroup === 'infra-routes')
  const originalUploadDir = process.env.UPLOAD_DIR
  const originalNextAuthSecret = process.env.NEXTAUTH_SECRET
  const tempState = {
    uploadDirAbs: '',
    uploadDirRel: '',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = false
    process.env.NEXTAUTH_SECRET = 'test-storage-access-secret'
    vi.resetModules()
  })

  afterEach(async () => {
    vi.resetModules()
    if (tempState.uploadDirAbs) {
      await fs.rm(tempState.uploadDirAbs, { recursive: true, force: true })
      tempState.uploadDirAbs = ''
      tempState.uploadDirRel = ''
    }
    if (originalUploadDir === undefined) {
      delete process.env.UPLOAD_DIR
    } else {
      process.env.UPLOAD_DIR = originalUploadDir
    }
    if (originalNextAuthSecret === undefined) {
      delete process.env.NEXTAUTH_SECRET
    } else {
      process.env.NEXTAUTH_SECRET = originalNextAuthSecret
    }
  })

  async function prepareUploadDir(): Promise<void> {
    const unique = `test-uploads-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    tempState.uploadDirRel = path.join('.tmp', unique)
    tempState.uploadDirAbs = path.join(process.cwd(), tempState.uploadDirRel)
    process.env.UPLOAD_DIR = tempState.uploadDirRel
    await fs.mkdir(tempState.uploadDirAbs, { recursive: true })
  }

  async function createSignedStorageQuery(key: string, expiresInSeconds = 3600): Promise<string> {
    const { createStorageAccessQuery } = await import('@/lib/storage/access-token')
    return createStorageAccessQuery(key, expiresInSeconds).toString()
  }

  it('infra route group exists', () => {
    expect(routes.map((entry) => entry.routeFile)).toEqual(expect.arrayContaining([
      'src/app/api/admin/download-logs/route.ts',
      'src/app/api/cos/image/route.ts',
      'src/app/api/files/[...path]/route.ts',
      'src/app/api/storage/sign/route.ts',
      'src/app/api/system/boot-id/route.ts',
    ]))
  })

  it('GET /api/admin/download-logs rejects unauthenticated requests', async () => {
    const mod = await import('@/app/api/admin/download-logs/route')
    const req = buildMockRequest({
      path: '/api/admin/download-logs',
      method: 'GET',
    })

    const res = await mod.GET(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(401)
    expect(loggingMock.readAllLogs).not.toHaveBeenCalled()
  })

  it('GET /api/admin/download-logs returns attachment headers when authenticated', async () => {
    authState.authenticated = true
    const mod = await import('@/app/api/admin/download-logs/route')
    const req = buildMockRequest({
      path: '/api/admin/download-logs',
      method: 'GET',
    })

    const res = await mod.GET(req, { params: Promise.resolve({}) })
    const text = await res.text()

    expect(res.status).toBe(200)
    expect(text).toContain('worker log line 1')
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="waoowaoo-logs-/)
  })

  it('GET /api/cos/image rejects unauthenticated unsigned image keys', async () => {
    const mod = await import('@/app/api/cos/image/route')
    const req = buildMockRequest({
      path: '/api/cos/image?key=folder/a.png&expires=7200',
      method: 'GET',
    })

    const res = await mod.GET(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(401)
    expect(storageAccessMock.assertUserCanAccessStorageKey).not.toHaveBeenCalled()
  })

  it('GET /api/cos/image redirects authorized keys to a signed storage route', async () => {
    authState.authenticated = true
    const mod = await import('@/app/api/cos/image/route')
    const req = buildMockRequest({
      path: '/api/cos/image?key=folder/a.png&expires=7200',
      method: 'GET',
    })

    const res = await mod.GET(req, { params: Promise.resolve({}) })
    const location = new URL(res.headers.get('location') || '')

    expect(res.status).toBe(307)
    expect(location.pathname).toBe('/api/storage/sign')
    expect(location.searchParams.get('key')).toBe('folder/a.png')
    expect(location.searchParams.get('expires')).toBe('7200')
    expect(location.searchParams.get('expiresAt')).toMatch(/^\d+$/)
    expect(location.searchParams.get('signature')?.length).toBeGreaterThan(20)
    expect(storageAccessMock.assertUserCanAccessStorageKey).toHaveBeenCalledWith({
      key: 'folder/a.png',
      userId: 'user-1',
    })
  })

  it('GET /api/storage/sign rejects unauthenticated unsigned object keys', async () => {
    const mod = await import('@/app/api/storage/sign/route')
    const req = buildMockRequest({
      path: '/api/storage/sign?key=folder/a.png',
      method: 'GET',
    })

    const res = await mod.GET(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(401)
    expect(storageMock.getSignedObjectUrl).not.toHaveBeenCalled()
    expect(storageAccessMock.assertUserCanAccessStorageKey).not.toHaveBeenCalled()
  })

  it('GET /api/storage/sign redirects authenticated owner requests to signed object url', async () => {
    authState.authenticated = true
    const mod = await import('@/app/api/storage/sign/route')
    const req = buildMockRequest({
      path: '/api/storage/sign?key=folder/a.png',
      method: 'GET',
    })

    const res = await mod.GET(req, { params: Promise.resolve({}) })

    expect(storageMock.getSignedObjectUrl).toHaveBeenCalledWith('folder/a.png', 3600)
    expect(storageAccessMock.assertUserCanAccessStorageKey).toHaveBeenCalledWith({
      key: 'folder/a.png',
      userId: 'user-1',
    })
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://signed.example/folder/a.png?expires=3600')
  })

  it('GET /api/storage/sign accepts valid signed storage access without session auth', async () => {
    const signedQuery = await createSignedStorageQuery('folder/a.png')
    const mod = await import('@/app/api/storage/sign/route')
    const req = buildMockRequest({
      path: `/api/storage/sign?key=folder/a.png&${signedQuery}`,
      method: 'GET',
    })

    const res = await mod.GET(req, { params: Promise.resolve({}) })

    expect(storageMock.getSignedObjectUrl).toHaveBeenCalledWith('folder/a.png', 3600)
    expect(storageAccessMock.assertUserCanAccessStorageKey).not.toHaveBeenCalled()
    expect(res.status).toBe(307)
  })

  it('GET /api/system/boot-id returns the current server boot id', async () => {
    const mod = await import('@/app/api/system/boot-id/route')
    const serverBoot = await import('@/lib/server-boot')
    const res = await mod.GET()
    const json = await res.json() as { bootId: string }

    expect(res.status).toBe(200)
    expect(json.bootId).toBe(serverBoot.SERVER_BOOT_ID)
    expect(typeof json.bootId).toBe('string')
    expect(json.bootId.length).toBeGreaterThan(0)
  })

  it('GET /api/files/[...path] rejects path traversal attempts', async () => {
    await prepareUploadDir()
    const mod = await import('@/app/api/files/[...path]/route')
    const req = buildMockRequest({
      path: '/api/files/%2E%2E/secret.txt',
      method: 'GET',
    })

    const res = await mod.GET(req, {
      params: Promise.resolve({ path: ['..', 'secret.txt'] }),
    })
    const json = await res.json() as { code: string; error: { code: string } }

    expect(res.status).toBe(403)
    expect(json.code).toBe('LOCAL_FILE_PATH_TRAVERSAL')
    expect(json.error.code).toBe('FORBIDDEN')
  })

  it('GET /api/files/[...path] rejects unsigned local file requests before reading storage', async () => {
    await prepareUploadDir()
    const nestedDir = path.join(tempState.uploadDirAbs, 'folder')
    await fs.mkdir(nestedDir, { recursive: true })
    await fs.writeFile(path.join(nestedDir, 'hello.txt'), 'hello local file', 'utf8')

    const mod = await import('@/app/api/files/[...path]/route')
    const req = buildMockRequest({
      path: '/api/files/folder/hello.txt',
      method: 'GET',
    })

    const res = await mod.GET(req, {
      params: Promise.resolve({ path: ['folder', 'hello.txt'] }),
    })
    const text = await res.text()

    expect(res.status).toBe(401)
    expect(text).not.toBe('hello local file')
    expect(storageAccessMock.assertUserCanAccessStorageKey).not.toHaveBeenCalled()
  })

  it('GET /api/files/[...path] returns 404 when an authorized file is missing', async () => {
    await prepareUploadDir()
    const signedQuery = await createSignedStorageQuery('missing.txt')
    const mod = await import('@/app/api/files/[...path]/route')
    const req = buildMockRequest({
      path: `/api/files/missing.txt?${signedQuery}`,
      method: 'GET',
    })

    const res = await mod.GET(req, {
      params: Promise.resolve({ path: ['missing.txt'] }),
    })
    const json = await res.json() as { code: string; error: { code: string } }

    expect(res.status).toBe(404)
    expect(json.code).toBe('LOCAL_FILE_NOT_FOUND')
    expect(json.error.code).toBe('NOT_FOUND')
  })

  it('GET /api/files/[...path] serves signed local files from the configured upload dir', async () => {
    await prepareUploadDir()
    const nestedDir = path.join(tempState.uploadDirAbs, 'folder')
    await fs.mkdir(nestedDir, { recursive: true })
    await fs.writeFile(path.join(nestedDir, 'hello.txt'), 'hello local file', 'utf8')

    const signedQuery = await createSignedStorageQuery('folder/hello.txt')
    const mod = await import('@/app/api/files/[...path]/route')
    const req = buildMockRequest({
      path: `/api/files/folder/hello.txt?${signedQuery}`,
      method: 'GET',
    })

    const res = await mod.GET(req, {
      params: Promise.resolve({ path: ['folder', 'hello.txt'] }),
    })
    const text = await res.text()

    expect(res.status).toBe(200)
    expect(text).toBe('hello local file')
    expect(res.headers.get('content-type')).toBe('text/plain')
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000')
    expect(storageAccessMock.assertUserCanAccessStorageKey).not.toHaveBeenCalled()
  })
})
