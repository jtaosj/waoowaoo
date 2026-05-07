import { describe, expect, it } from 'vitest'
import {
  readOperationResultSummary,
  readPlanRunSubmittedPartData,
} from '@/features/project-workspace/components/workspace-assistant/confirmed-operation-result'

describe('workspace assistant confirmed operation result', () => {
  it('surfaces execute_plan plan run ids instead of hiding the running chain in plain text', () => {
    const payload = {
      success: true,
      operationId: 'execute_plan',
      result: {
        success: true,
        planRunId: 'plan-run-1',
        status: 'waiting_task',
        executedStepKeys: ['split'],
        waitingTaskId: 'task-1',
      },
    }

    expect(readOperationResultSummary(payload)).toBe('waiting_task · plan-run-1 · task-1')
    expect(readPlanRunSubmittedPartData('execute_plan', payload)).toEqual({
      operationId: 'execute_plan',
      planRunId: 'plan-run-1',
      status: 'waiting_task',
      executedStepKeys: ['split'],
      waitingTaskId: 'task-1',
    })
  })

  it('does not synthesize a running PlanRun when execute_plan omits status', () => {
    const payload = {
      success: true,
      operationId: 'execute_plan',
      result: {
        success: true,
        planRunId: 'plan-run-1',
        waitingTaskId: 'task-1',
      },
    }

    expect(readOperationResultSummary(payload)).toBe('plan-run-1 · task-1')
    expect(readPlanRunSubmittedPartData('execute_plan', payload)).toBeNull()
  })
})
