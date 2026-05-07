import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { resumePlanRunFromApi } from '@/lib/plan-run-runtime/resume'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ planRunId: string }> },
) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult
  const { planRunId: rawPlanRunId } = await context.params
  const planRunId = decodeURIComponent(rawPlanRunId || '').trim()
  if (!planRunId) throw new ApiError('INVALID_PARAMS')

  const result = await resumePlanRunFromApi({
    request,
    planRunId,
    userId: session.user.id,
    locale: request.nextUrl.searchParams.get('locale'),
  })

  return NextResponse.json(result)
})
