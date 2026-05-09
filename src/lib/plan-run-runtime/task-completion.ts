import { NextRequest } from 'next/server'
import { createScopedLogger } from '@/lib/logging/core'
import { listWaitingPlanStepsByTaskId } from './service'
import { resumePlanRunFromApi } from './resume'

const logger = createScopedLogger({
  module: 'plan-run-runtime.task-completion',
})

function buildInternalResumeRequest(locale?: string | null): NextRequest {
  const headers = new Headers()
  if (locale) headers.set('accept-language', locale)
  return new NextRequest('http://localhost/api/internal/plan-runs/resume-after-task', {
    headers,
  })
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name
  return String(error)
}

function readResumeErrorMessage(error: {
  message?: string
  errorMessage?: string
} | null | undefined): string {
  return error?.message ?? error?.errorMessage ?? 'PLAN_RUN_RESUME_FAILED'
}

export async function resumePlanRunsForTerminalTask(params: {
  taskId: string
  locale?: string | null
}) {
  const waitingSteps = await listWaitingPlanStepsByTaskId(params.taskId)
  const resumedRuns: Array<{
    planRunId: string
    stepKey: string
    success: boolean
    status: string
    waitingTaskId: string | null
    errorMessage: string | null
  }> = []

  for (const waitingStep of waitingSteps) {
    try {
      const result = await resumePlanRunFromApi({
        request: buildInternalResumeRequest(params.locale),
        planRunId: waitingStep.planRunId,
        userId: waitingStep.userId,
        locale: params.locale,
      })
      resumedRuns.push({
        planRunId: waitingStep.planRunId,
        stepKey: waitingStep.stepKey,
        success: result.success,
        status: result.status,
        waitingTaskId: result.waitingTaskId,
        errorMessage: result.success ? null : readResumeErrorMessage(result.error),
      })
    } catch (error) {
      const errorMessage = readErrorMessage(error)
      resumedRuns.push({
        planRunId: waitingStep.planRunId,
        stepKey: waitingStep.stepKey,
        success: false,
        status: 'failed',
        waitingTaskId: null,
        errorMessage,
      })
      logger.error({
        action: 'plan_run.resume_after_task_failed',
        message: errorMessage,
        details: {
          taskId: params.taskId,
          planRunId: waitingStep.planRunId,
          stepKey: waitingStep.stepKey,
        },
        error: error instanceof Error
          ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
          : { message: String(error) },
      })
    }
  }

  return {
    taskId: params.taskId,
    resumedRuns,
  }
}
