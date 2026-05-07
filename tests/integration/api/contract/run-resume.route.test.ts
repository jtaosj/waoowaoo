import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authState = vi.hoisted(() => ({ authenticated: true }))
const resumePlanRunFromApiMock = vi.hoisted(() => vi.fn(async () => ({
  success: true,
  planRunId: 'plan-run-1',
  status: 'waiting_task',
  resumedStepKeys: ['write'],
  waitingTaskId: 'task-2',
  snapshot: {
    planRun: { id: 'plan-run-1', userId: 'user-1', projectId: 'project-1', status: 'running' },
    steps: [],
    artifacts: [],
  },
})))

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

vi.mock('@/lib/plan-run-runtime/resume', () => ({
  resumePlanRunFromApi: resumePlanRunFromApiMock,
}))

describe('api contract - plan run resume route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = true
  })

  it('resumes an owned plan run after an async task reaches a terminal state', async () => {
    const { POST } = await import('@/app/api/plan-runs/[planRunId]/resume/route')
    const req = buildMockRequest({
      path: '/api/plan-runs/plan-run-1/resume',
      method: 'POST',
      query: { locale: 'zh' },
    })

    const res = await POST(req, {
      params: Promise.resolve({ planRunId: 'plan-run-1' }),
    })

    expect(res.status).toBe(200)
    const payload = await res.json() as {
      success: boolean
      planRunId: string
      status: string
      resumedStepKeys: string[]
      waitingTaskId: string | null
    }
    expect(payload).toMatchObject({
      success: true,
      planRunId: 'plan-run-1',
      status: 'waiting_task',
      resumedStepKeys: ['write'],
      waitingTaskId: 'task-2',
    })
    expect(resumePlanRunFromApiMock).toHaveBeenCalledWith(expect.objectContaining({
      request: req,
      planRunId: 'plan-run-1',
      userId: 'user-1',
      locale: 'zh',
    }))
  })

  it('rejects unauthenticated resume requests before touching the runtime', async () => {
    authState.authenticated = false
    const { POST } = await import('@/app/api/plan-runs/[planRunId]/resume/route')
    const req = buildMockRequest({
      path: '/api/plan-runs/plan-run-1/resume',
      method: 'POST',
    })

    const res = await POST(req, {
      params: Promise.resolve({ planRunId: 'plan-run-1' }),
    })

    expect(res.status).toBe(401)
    expect(resumePlanRunFromApiMock).not.toHaveBeenCalled()
  })
})
