import type { PlanRunSubmittedPartData } from '@/lib/project-agent/types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => readString(item))
    .filter((item) => item.length > 0)
}

function readResultRecord(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) return null
  return isRecord(payload.result) ? payload.result : null
}

export function readOperationResultSummary(payload: unknown): string {
  const result = readResultRecord(payload)
  if (!result) return ''
  const status = readString(result.status)
  const planRunId = readString(result.planRunId)
  const waitingTaskId = readString(result.waitingTaskId)
  const taskId = readString(result.taskId)
  const runId = readString(result.runId)
  return [status, planRunId, waitingTaskId || taskId || runId].filter(Boolean).join(' · ')
}

export function readPlanRunSubmittedPartData(
  operationId: string,
  payload: unknown,
): PlanRunSubmittedPartData | null {
  const result = readResultRecord(payload)
  if (!result) return null
  const planRunId = readString(result.planRunId)
  if (!planRunId) return null
  const status = readString(result.status)
  if (!status) return null
  const waitingTaskId = readString(result.waitingTaskId)
  return {
    operationId,
    planRunId,
    status,
    executedStepKeys: readStringArray(result.executedStepKeys),
    waitingTaskId: waitingTaskId || null,
  }
}
