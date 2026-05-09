import { PLAN_RUN_EVENT_TYPE } from './types'

type JsonRecord = Record<string, unknown>

export interface PlanRunTraceEvent {
  id: string
  planRunId: string
  projectId: string
  userId: string
  seq: number
  eventType: string
  stepKey: string | null
  payload: JsonRecord | null
  createdAt: string
}

export interface PlanRunStepFailureSignature {
  stepKey: string | null
  operationId: string | null
  errorCode: string
  message: string
}

export interface MalformedPlanRunErrorEvent {
  seq: number
  stepKey: string | null
  reason: 'missing errorCode' | 'missing message'
}

export interface PlanRunTraceSummary {
  eventCount: number
  stepOrder: string[]
  operationOrder: string[]
  firstError: PlanRunStepFailureSignature | null
  errors: PlanRunStepFailureSignature[]
  inputBuildFailures: PlanRunStepFailureSignature[]
  malformedErrorEvents: MalformedPlanRunErrorEvent[]
  hasInputBuildFailure: boolean
}

export type PlanRunInputBuildFailureTraceIssue =
  | 'operation_not_selected'
  | 'input_build_failure_not_visible'
  | 'malformed_error_event'

export interface PlanRunInputBuildFailureTraceEvaluationInput {
  summary: PlanRunTraceSummary
  expectedOperationId: string
  expectedMessageIncludes?: string
}

export interface PlanRunInputBuildFailureTraceEvaluation {
  passed: boolean
  score: number
  maxScore: 3
  checks: {
    operationSelected: boolean
    inputBuildFailureVisible: boolean
    malformedErrorEventsAbsent: boolean
  }
  issues: PlanRunInputBuildFailureTraceIssue[]
  matchedFailure: PlanRunStepFailureSignature | null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readPayloadString(payload: JsonRecord | null, key: string): string | null {
  if (!payload) return null
  return readString(payload[key])
}

function readStartOperationId(event: PlanRunTraceEvent): string | null {
  if (event.eventType !== PLAN_RUN_EVENT_TYPE.STEP_START) return null
  return readPayloadString(event.payload, 'operationId')
}

export function buildPlanRunTraceSummary(events: readonly PlanRunTraceEvent[]): PlanRunTraceSummary {
  const orderedEvents = [...events].sort((left, right) => left.seq - right.seq)
  const stepOrder: string[] = []
  const seenStepKeys = new Set<string>()
  const operationOrder: string[] = []
  const seenOperationIds = new Set<string>()
  const operationIdByStepKey = new Map<string, string>()
  const errors: PlanRunStepFailureSignature[] = []
  const malformedErrorEvents: MalformedPlanRunErrorEvent[] = []

  for (const event of orderedEvents) {
    if (event.stepKey && !seenStepKeys.has(event.stepKey)) {
      seenStepKeys.add(event.stepKey)
      stepOrder.push(event.stepKey)
    }

    const operationId = readStartOperationId(event)
    if (event.stepKey && operationId) {
      operationIdByStepKey.set(event.stepKey, operationId)
    }
    if (operationId && !seenOperationIds.has(operationId)) {
      seenOperationIds.add(operationId)
      operationOrder.push(operationId)
    }

    if (event.eventType !== PLAN_RUN_EVENT_TYPE.STEP_ERROR) continue

    const errorCode = readPayloadString(event.payload, 'errorCode')
    if (!errorCode) {
      malformedErrorEvents.push({
        seq: event.seq,
        stepKey: event.stepKey,
        reason: 'missing errorCode',
      })
      continue
    }

    const message = readPayloadString(event.payload, 'message')
    if (!message) {
      malformedErrorEvents.push({
        seq: event.seq,
        stepKey: event.stepKey,
        reason: 'missing message',
      })
      continue
    }

    errors.push({
      stepKey: event.stepKey,
      operationId: event.stepKey ? operationIdByStepKey.get(event.stepKey) ?? null : null,
      errorCode,
      message,
    })
  }

  const inputBuildFailures = errors.filter((error) => error.errorCode === 'PLAN_STEP_INPUT_BUILD_FAILED')
  return {
    eventCount: orderedEvents.length,
    stepOrder,
    operationOrder,
    firstError: errors[0] ?? null,
    errors,
    inputBuildFailures,
    malformedErrorEvents,
    hasInputBuildFailure: inputBuildFailures.length > 0,
  }
}

function messageMatches(message: string, expectedMessageIncludes: string | undefined): boolean {
  return expectedMessageIncludes ? message.includes(expectedMessageIncludes) : true
}

export function evaluatePlanRunInputBuildFailureTrace(
  input: PlanRunInputBuildFailureTraceEvaluationInput,
): PlanRunInputBuildFailureTraceEvaluation {
  const operationSelected = input.summary.operationOrder.includes(input.expectedOperationId)
  const matchedFailure = input.summary.inputBuildFailures.find((failure) => (
    failure.operationId === input.expectedOperationId
    && messageMatches(failure.message, input.expectedMessageIncludes)
  )) ?? null
  const inputBuildFailureVisible = matchedFailure !== null
  const malformedErrorEventsAbsent = input.summary.malformedErrorEvents.length === 0
  const checks = {
    operationSelected,
    inputBuildFailureVisible,
    malformedErrorEventsAbsent,
  }
  const issues: PlanRunInputBuildFailureTraceIssue[] = []
  if (!operationSelected) issues.push('operation_not_selected')
  if (!inputBuildFailureVisible) issues.push('input_build_failure_not_visible')
  if (!malformedErrorEventsAbsent) issues.push('malformed_error_event')

  return {
    passed: issues.length === 0,
    score: Object.values(checks).filter(Boolean).length,
    maxScore: 3,
    checks,
    issues,
    matchedFailure,
  }
}
