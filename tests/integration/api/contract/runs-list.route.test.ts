import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authState = vi.hoisted(() => ({ authenticated: true }))
const listPlanRunsMock = vi.hoisted(() => vi.fn())
const createPlanRunMock = vi.hoisted(() => vi.fn())
const prismaMock = vi.hoisted(() => ({
  project: {
    findFirst: vi.fn(),
  },
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

vi.mock('@/lib/plan-run-runtime/service', () => ({
  listPlanRuns: listPlanRunsMock,
  createPlanRun: createPlanRunMock,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

describe('api contract - plan runs list route', () => {
  const emptyRouteContext = {
    params: Promise.resolve({}),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = true
    listPlanRunsMock.mockResolvedValue([
      {
        id: 'plan-run-1',
        status: 'running',
      },
    ])
    createPlanRunMock.mockResolvedValue({
      id: 'plan-run-created',
      projectId: 'project-1',
      userId: 'user-1',
      status: 'queued',
    })
    prismaMock.project.findFirst.mockResolvedValue({ id: 'project-1' })
  })

  it('lists scoped active plan runs without fixed workflow filters', async () => {
    const { GET } = await import('@/app/api/plan-runs/route')

    const req = buildMockRequest({
      path: '/api/plan-runs?projectId=project-1&episodeId=episode-1&status=queued&status=running&status=canceling&limit=20',
      method: 'GET',
    })
    const res = await GET(req, emptyRouteContext)

    expect(res.status).toBe(200)
    expect(listPlanRunsMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      statuses: ['queued', 'running', 'canceling'],
      limit: 20,
    }))
  })

  it('keeps completed plan run queries as normal list requests', async () => {
    const { GET } = await import('@/app/api/plan-runs/route')

    const req = buildMockRequest({
      path: '/api/plan-runs?projectId=project-1&status=completed&limit=20',
      method: 'GET',
    })
    const res = await GET(req, emptyRouteContext)

    expect(res.status).toBe(200)
    expect(listPlanRunsMock).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      statuses: ['completed'],
      limit: 20,
    }))
  })

  it('POST /api/plan-runs creates a plan run only after project ownership is verified', async () => {
    const { POST } = await import('@/app/api/plan-runs/route')

    const req = buildMockRequest({
      path: '/api/plan-runs',
      method: 'POST',
      body: {
        projectId: 'project-1',
        goal: '生成一段测试视频',
        steps: [],
      },
    })
    const res = await POST(req, emptyRouteContext)
    const json = await res.json() as { success: boolean; planRunId: string }

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.planRunId).toBe('plan-run-created')
    expect(prismaMock.project.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'project-1',
        userId: 'user-1',
      },
      select: { id: true },
    })
    expect(createPlanRunMock).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      userId: 'user-1',
      goal: '生成一段测试视频',
      steps: [],
    }))
  })

  it('POST /api/plan-runs rejects cross-project create_plan_run before writing the run', async () => {
    prismaMock.project.findFirst.mockResolvedValueOnce(null)
    const { POST } = await import('@/app/api/plan-runs/route')

    const req = buildMockRequest({
      path: '/api/plan-runs',
      method: 'POST',
      body: {
        projectId: 'other-user-project',
        goal: '不应创建到别人的项目',
        steps: [],
      },
    })
    const res = await POST(req, emptyRouteContext)
    const json = await res.json() as { code: string; error: { code: string } }

    expect(res.status).toBe(404)
    expect(json.code).toBe('PROJECT_NOT_FOUND')
    expect(json.error.code).toBe('NOT_FOUND')
    expect(prismaMock.project.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'other-user-project',
        userId: 'user-1',
      },
      select: { id: true },
    })
    expect(createPlanRunMock).not.toHaveBeenCalled()
  })
})
