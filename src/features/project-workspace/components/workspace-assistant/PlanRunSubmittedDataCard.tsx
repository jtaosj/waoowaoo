'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { DataMessagePartProps } from '@assistant-ui/react'
import { useQueryClient } from '@tanstack/react-query'
import { AppIcon } from '@/components/ui/icons'
import { apiFetch } from '@/lib/api-fetch'
import { queryKeys } from '@/lib/query/keys'
import type { PlanRunSubmittedPartData } from '@/lib/project-agent/types'
import { resumePlanRunAfterTerminalTask } from './plan-run-submitted-resume'

const PLAN_RUN_POLL_INTERVAL_MS = 2000
const TERMINAL_PLAN_RUN_STATUSES = new Set(['completed', 'failed', 'canceled'])
const TERMINAL_TASK_STATUSES = new Set(['completed', 'failed', 'canceled', 'dismissed'])

interface PlanRunSnapshot {
  planRun: {
    id: string
    projectId: string
    status: string
    episodeId?: string | null
    currentStepKey?: string | null
    errorMessage?: string | null
  }
  steps: PlanRunStepSnapshot[]
}

interface PlanRunStepSnapshot {
  stepKey: string
  operationId: string
  status: string
  taskId?: string | null
  stepIndex?: number | null
  stepTotal?: number | null
  errorMessage?: string | null
}

interface TaskSnapshot {
  task: {
    id: string
    type?: string | null
    status: string
    progress?: number | null
    errorMessage?: string | null
    error?: {
      message?: string | null
    } | null
  }
  events: TaskEventSnapshot[]
}

interface TaskEventSnapshot {
  id: string
  type: string
  ts?: string | null
  payload?: Record<string, unknown> | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function parsePlanRunStep(value: unknown): PlanRunStepSnapshot | null {
  if (!isRecord(value)) return null
  const stepKey = readString(value.stepKey)
  const operationId = readString(value.operationId)
  const status = readString(value.status)
  if (!stepKey || !operationId || !status) return null
  const taskId = readString(value.taskId)
  const errorMessage = readString(value.errorMessage)
  return {
    stepKey,
    operationId,
    status,
    taskId: taskId || null,
    stepIndex: readNumber(value.stepIndex),
    stepTotal: readNumber(value.stepTotal),
    errorMessage: errorMessage || null,
  }
}

function parsePlanRunSnapshot(value: unknown): PlanRunSnapshot | null {
  if (!isRecord(value)) return null
  const planRun = isRecord(value.planRun) ? value.planRun : null
  if (!planRun) return null
  const id = readString(planRun.id)
  const projectId = readString(planRun.projectId)
  const status = readString(planRun.status)
  if (!id || !projectId || !status) return null
  const episodeId = readString(planRun.episodeId)
  const currentStepKey = readString(planRun.currentStepKey)
  const errorMessage = readString(planRun.errorMessage)
  const steps = Array.isArray(value.steps)
    ? value.steps.map(parsePlanRunStep).filter((step): step is PlanRunStepSnapshot => step !== null)
    : []
  return {
    planRun: {
      id,
      projectId,
      status,
      episodeId: episodeId || null,
      currentStepKey: currentStepKey || null,
      errorMessage: errorMessage || null,
    },
    steps,
  }
}

function parseTaskEvent(value: unknown): TaskEventSnapshot | null {
  if (!isRecord(value)) return null
  const id = readString(value.id)
  const type = readString(value.type)
  if (!id || !type) return null
  const ts = readString(value.ts)
  return {
    id,
    type,
    ts: ts || null,
    payload: isRecord(value.payload) ? value.payload : null,
  }
}

function parseTaskSnapshot(value: unknown): TaskSnapshot | null {
  if (!isRecord(value)) return null
  const task = isRecord(value.task) ? value.task : null
  if (!task) return null
  const id = readString(task.id)
  const status = readString(task.status)
  if (!id || !status) return null
  const error = isRecord(task.error) ? task.error : null
  const type = readString(task.type)
  const errorMessage = readString(task.errorMessage)
  const normalizedErrorMessage = errorMessage || readString(error?.message)
  const events = Array.isArray(value.events)
    ? value.events.map(parseTaskEvent).filter((event): event is TaskEventSnapshot => event !== null)
    : []
  return {
    task: {
      id,
      status,
      type: type || null,
      progress: readNumber(task.progress),
      errorMessage: normalizedErrorMessage || null,
      error: normalizedErrorMessage ? { message: normalizedErrorMessage } : null,
    },
    events,
  }
}

function findVisibleTaskId(snapshot: PlanRunSnapshot | null, fallbackTaskId?: string | null): string | null {
  const waitingStep = snapshot?.steps.find((step) => step.status === 'waiting_task' && step.taskId)
  return waitingStep?.taskId || fallbackTaskId || null
}

function latestEventLabel(event: TaskEventSnapshot): string {
  const payload = event.payload
  const progress = typeof payload?.progress === 'number' ? ` · ${String(payload.progress)}%` : ''
  const message = readString(payload?.message) || readString(payload?.stage) || event.type
  return `${message}${progress}`
}

async function readJsonResponse(response: Response): Promise<unknown> {
  return await response.json().catch(() => null)
}

async function fetchPlanRunSnapshot(planRunId: string): Promise<PlanRunSnapshot> {
  const response = await apiFetch(`/api/plan-runs/${encodeURIComponent(planRunId)}`)
  const payload = await readJsonResponse(response)
  if (!response.ok) throw new Error(`PLAN_RUN_SNAPSHOT_FAILED:${response.status}`)
  const snapshot = parsePlanRunSnapshot(payload)
  if (!snapshot) throw new Error('PLAN_RUN_SNAPSHOT_INVALID')
  return snapshot
}

async function fetchTaskSnapshot(taskId: string): Promise<TaskSnapshot> {
  const response = await apiFetch(`/api/tasks/${encodeURIComponent(taskId)}?includeEvents=1&eventsLimit=12`)
  const payload = await readJsonResponse(response)
  if (!response.ok) throw new Error(`TASK_SNAPSHOT_FAILED:${response.status}`)
  const snapshot = parseTaskSnapshot(payload)
  if (!snapshot) throw new Error('TASK_SNAPSHOT_INVALID')
  return snapshot
}

async function resumePlanRun(planRunId: string, locale: string): Promise<PlanRunSnapshot | null> {
  const search = new URLSearchParams({ locale })
  const response = await apiFetch(`/api/plan-runs/${encodeURIComponent(planRunId)}/resume?${search.toString()}`, {
    method: 'POST',
  })
  const payload = await readJsonResponse(response)
  if (!response.ok) throw new Error(`PLAN_RUN_RESUME_FAILED:${response.status}`)
  if (!isRecord(payload)) return null
  return parsePlanRunSnapshot(payload.snapshot)
}

function invalidateVisibleProjectData(
  queryClient: ReturnType<typeof useQueryClient>,
  snapshot: PlanRunSnapshot,
) {
  const { projectId, episodeId } = snapshot.planRun
  void queryClient.invalidateQueries({ queryKey: queryKeys.projectData(projectId) })
  void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all(projectId), exact: false })
  void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.targetStatesAll(projectId), exact: false })
  if (episodeId) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, episodeId) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.storyboards.all(episodeId) })
  }
}

export function PlanRunSubmittedDataCard({ data }: DataMessagePartProps<PlanRunSubmittedPartData>) {
  const t = useTranslations('assistantAgent')
  const locale = useLocale()
  const queryClient = useQueryClient()
  const [snapshot, setSnapshot] = useState<PlanRunSnapshot | null>(null)
  const [taskSnapshot, setTaskSnapshot] = useState<TaskSnapshot | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [resumeRunning, setResumeRunning] = useState(false)
  const resumedTaskIdsRef = useRef<Set<string>>(new Set())
  const snapshotRef = useRef<PlanRunSnapshot | null>(null)

  useEffect(() => {
    let disposed = false
    let timer: number | null = null

    const scheduleNext = (nextSnapshot: PlanRunSnapshot | null) => {
      if (disposed) return
      if (nextSnapshot && TERMINAL_PLAN_RUN_STATUSES.has(nextSnapshot.planRun.status)) return
      timer = window.setTimeout(() => {
        void load()
      }, PLAN_RUN_POLL_INTERVAL_MS)
    }

    const load = async () => {
      try {
        const nextSnapshot = await fetchPlanRunSnapshot(data.planRunId)
        if (disposed) return
        snapshotRef.current = nextSnapshot
        setSnapshot(nextSnapshot)
        setErrorMessage(null)

        const taskId = findVisibleTaskId(nextSnapshot, data.waitingTaskId ?? null)
        let nextTaskSnapshot: TaskSnapshot | null = null
        if (taskId) {
          nextTaskSnapshot = await fetchTaskSnapshot(taskId)
          if (disposed) return
          setTaskSnapshot(nextTaskSnapshot)
        } else {
          setTaskSnapshot(null)
        }

        if (
          taskId
          && nextTaskSnapshot
          && TERMINAL_TASK_STATUSES.has(nextTaskSnapshot.task.status)
          && !TERMINAL_PLAN_RUN_STATUSES.has(nextSnapshot.planRun.status)
          && !resumedTaskIdsRef.current.has(taskId)
        ) {
          setResumeRunning(true)
          const resumeResult = await resumePlanRunAfterTerminalTask({
            taskId,
            taskStatus: nextTaskSnapshot.task.status,
            planRunStatus: nextSnapshot.planRun.status,
            resumedTaskIds: resumedTaskIdsRef.current,
            resume: async () => await resumePlanRun(data.planRunId, locale),
            terminalTaskStatuses: TERMINAL_TASK_STATUSES,
            terminalPlanRunStatuses: TERMINAL_PLAN_RUN_STATUSES,
          })
          if (!resumeResult.attempted) {
            setResumeRunning(false)
            scheduleNext(nextSnapshot)
            return
          }
          if (disposed) return
          const resumedSnapshot = resumeResult.snapshot
          if (resumedSnapshot) {
            snapshotRef.current = resumedSnapshot
            setSnapshot(resumedSnapshot)
            invalidateVisibleProjectData(queryClient, resumedSnapshot)
          }
          setResumeRunning(false)
          scheduleNext(resumedSnapshot ?? nextSnapshot)
          return
        }

        scheduleNext(nextSnapshot)
      } catch (error) {
        if (disposed) return
        setResumeRunning(false)
        setErrorMessage(error instanceof Error ? error.message : String(error))
        scheduleNext(snapshotRef.current)
      }
    }

    void load()
    return () => {
      disposed = true
      if (timer) window.clearTimeout(timer)
    }
  }, [data.planRunId, data.waitingTaskId, locale, queryClient])

  const visibleStatus = snapshot?.planRun.status || data.status
  const visibleTaskId = findVisibleTaskId(snapshot, data.waitingTaskId ?? null)
  const running = !TERMINAL_PLAN_RUN_STATUSES.has(visibleStatus)
  const latestTaskEvents = useMemo(() => [...(taskSnapshot?.events ?? [])].slice(-5), [taskSnapshot?.events])

  return (
    <details open className="group rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/50 p-3 text-[12px] leading-5 text-[var(--glass-text-tertiary)]">
      <summary className="flex cursor-pointer list-none items-center gap-2">
        <AppIcon name={running ? 'loader' : visibleStatus === 'completed' ? 'check' : 'alert'} className={`h-3.5 w-3.5 shrink-0 ${running ? 'animate-spin' : ''}`} />
        <span className="min-w-0 truncate">
          {t('cards.planRunSubmitted')} · {visibleStatus}
        </span>
        <AppIcon name="chevronDown" className="h-3 w-3 shrink-0 transition-transform group-open:rotate-180" />
      </summary>

      <div className="ml-5 mt-2 space-y-1 text-[11px]">
        <div>{t('cards.planRunIdLabel')}: {data.planRunId}</div>
        {visibleTaskId ? <div>{t('cards.waitingTaskIdLabel')}: {visibleTaskId}</div> : null}
        {resumeRunning ? <div className="text-[var(--glass-tone-info-fg)]">{t('cards.planRunResumeRunning')}</div> : null}
        {errorMessage ? <div className="text-[var(--glass-tone-warn-fg)]">{t('cards.planRunLoadFailed')}: {errorMessage}</div> : null}
      </div>

      {snapshot?.steps.length ? (
        <div className="ml-5 mt-2 space-y-1 text-[11px]">
          <div className="text-[var(--glass-text-secondary)]">{t('cards.planRunSteps')}</div>
          {snapshot.steps.map((step) => (
            <div key={step.stepKey} className="flex min-w-0 items-start gap-2">
              <span className="shrink-0 font-mono text-[10px] text-[var(--glass-text-tertiary)]">
                {step.stepIndex && step.stepTotal ? `${step.stepIndex}/${step.stepTotal}` : step.stepKey}
              </span>
              <span className="min-w-0 flex-1 break-words">
                {step.operationId} · {step.status}
                {step.errorMessage ? ` · ${step.errorMessage}` : ''}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {taskSnapshot ? (
        <div className="ml-5 mt-2 space-y-1 text-[11px]">
          <div className="text-[var(--glass-text-secondary)]">
            {t('cards.taskStatusLabel')}: {taskSnapshot.task.status}
            {typeof taskSnapshot.task.progress === 'number' ? ` · ${taskSnapshot.task.progress}%` : ''}
          </div>
          {taskSnapshot.task.errorMessage ? (
            <div className="text-[var(--glass-tone-warn-fg)]">{taskSnapshot.task.errorMessage}</div>
          ) : null}
          {latestTaskEvents.length ? (
            <div className="space-y-0.5">
              <div className="text-[var(--glass-text-secondary)]">{t('cards.taskEvents')}</div>
              {latestTaskEvents.map((event) => (
                <div key={event.id} className="break-words font-mono text-[10px]">
                  {latestEventLabel(event)}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </details>
  )
}
