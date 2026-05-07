const DEFAULT_TERMINAL_PLAN_RUN_STATUSES = new Set(['completed', 'failed', 'canceled'])
const DEFAULT_TERMINAL_TASK_STATUSES = new Set(['completed', 'failed', 'canceled', 'dismissed'])

export async function resumePlanRunAfterTerminalTask<TSnapshot>(params: {
  taskId: string | null
  taskStatus: string | null
  planRunStatus: string
  resumedTaskIds: Set<string>
  resume: () => Promise<TSnapshot | null>
  terminalTaskStatuses?: ReadonlySet<string>
  terminalPlanRunStatuses?: ReadonlySet<string>
}): Promise<{ attempted: boolean; snapshot: TSnapshot | null }> {
  const terminalTaskStatuses = params.terminalTaskStatuses ?? DEFAULT_TERMINAL_TASK_STATUSES
  const terminalPlanRunStatuses = params.terminalPlanRunStatuses ?? DEFAULT_TERMINAL_PLAN_RUN_STATUSES
  const taskId = params.taskId
  if (!taskId) return { attempted: false, snapshot: null }
  if (!terminalTaskStatuses.has(params.taskStatus || '')) return { attempted: false, snapshot: null }
  if (terminalPlanRunStatuses.has(params.planRunStatus)) return { attempted: false, snapshot: null }
  if (params.resumedTaskIds.has(taskId)) return { attempted: false, snapshot: null }

  const snapshot = await params.resume()
  params.resumedTaskIds.add(taskId)
  return { attempted: true, snapshot }
}
