'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { DataMessagePartProps } from '@assistant-ui/react'
import { useQueryClient } from '@tanstack/react-query'
import { AppIcon } from '@/components/ui/icons'
import { apiFetch } from '@/lib/api-fetch'
import {
  EDIT_TIMELINE_BLACKBOARD_ARTIFACT_TYPE,
  EDIT_TIMELINE_WORKFLOW_ARTIFACT_TYPE,
} from '@/lib/edit-timeline/runtime-artifacts'
import { queryKeys } from '@/lib/query/keys'
import type { EditTimelinePartData, PlanRunSubmittedPartData } from '@/lib/project-agent/types'
import {
  getLatestWorkspaceEditTimeline,
  publishWorkspaceEditTimeline,
} from './edit-timeline-board-event'
import { resumePlanRunAfterTerminalTask } from './plan-run-submitted-resume'

const PLAN_RUN_POLL_INTERVAL_MS = 2000
const FINAL_VIDEO_ARTIFACT_TYPE = 'final.video'
const TERMINAL_PLAN_RUN_STATUSES = new Set(['completed', 'failed', 'canceled'])
const TERMINAL_TASK_STATUSES = new Set(['completed', 'failed', 'canceled', 'dismissed'])
const FAILED_STATUSES = new Set(['failed', 'canceled', 'dismissed'])
const QUEUED_TASK_STATUSES = new Set(['queued', 'pending', 'submitted', 'scheduled', 'waiting'])
const RUNNING_TASK_STATUSES = new Set(['running', 'processing', 'in_progress', 'generating', 'active'])
const EDIT_TIMELINE_STATUS_LABELS = new Set(['planned', 'ready', 'blocked', 'scored', 'submitted', 'running', 'succeeded', 'failed'])

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
  artifacts: PlanRunArtifactSnapshot[]
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

interface PlanRunArtifactSnapshot {
  id: string
  artifactType: string
  refId: string
  payload: Record<string, unknown> | null
  createdAt?: string | null
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

function parsePlanRunArtifact(value: unknown): PlanRunArtifactSnapshot | null {
  if (!isRecord(value)) return null
  const id = readString(value.id)
  const artifactType = readString(value.artifactType)
  const refId = readString(value.refId)
  if (!id || !artifactType || !refId) return null
  const createdAt = readString(value.createdAt)
  return {
    id,
    artifactType,
    refId,
    payload: isRecord(value.payload) ? value.payload : null,
    createdAt: createdAt || null,
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
  const artifacts = Array.isArray(value.artifacts)
    ? value.artifacts.map(parsePlanRunArtifact).filter((artifact): artifact is PlanRunArtifactSnapshot => artifact !== null)
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
    artifacts,
  }
}

function findLatestArtifactPayload(
  snapshot: PlanRunSnapshot | null,
  artifactType: string,
): Record<string, unknown> | null {
  const artifacts = snapshot?.artifacts ?? []
  for (let index = artifacts.length - 1; index >= 0; index -= 1) {
    const artifact = artifacts[index]
    if (artifact.artifactType === artifactType && artifact.payload) return artifact.payload
  }
  return null
}

function findLatestEditTimelineWorkflow(snapshot: PlanRunSnapshot | null): Record<string, unknown> | null {
  return findLatestArtifactPayload(snapshot, EDIT_TIMELINE_WORKFLOW_ARTIFACT_TYPE)
}

function findLatestEditTimelineBlackboard(snapshot: PlanRunSnapshot | null): Record<string, unknown> | null {
  const blackboard = findLatestArtifactPayload(snapshot, EDIT_TIMELINE_BLACKBOARD_ARTIFACT_TYPE)
  if (blackboard) return blackboard
  const workflow = findLatestEditTimelineWorkflow(snapshot)
  return isRecord(workflow?.blackboard) ? workflow.blackboard : null
}

function publishEditTimelineArtifacts(snapshot: PlanRunSnapshot | null): void {
  const current = getLatestWorkspaceEditTimeline()
  if (!current) return
  const blackboard = findLatestEditTimelineBlackboard(snapshot)
  const workflow = findLatestEditTimelineWorkflow(snapshot)
  if (!blackboard && !workflow) return
  publishWorkspaceEditTimeline({
    ...current,
    ...(blackboard ? { blackboard: blackboard as EditTimelinePartData['blackboard'] } : {}),
    ...(workflow ? { workflow: workflow as unknown as EditTimelinePartData['workflow'] } : {}),
  })
}

interface VisibleEditTimelineProviderEvidence {
  shotId: string
  status: string
  taskId: string | null
  outputUrl: string | null
  provider: string | null
  model: string | null
  blocker: string | null
}

export interface VisibleEditTimelineEvidence {
  providerTasks: VisibleEditTimelineProviderEvidence[]
  finalVideoRefs: string[]
  finalVideoUrl: string | null
  finalCriticStatus: string | null
  finalCriticScore: number | null
}

function isFinalVideoEvidenceRef(ref: string): boolean {
  const normalized = ref.toLowerCase()
  return normalized.includes('final.video')
    || normalized.includes('final-video')
    || normalized.includes('final-videos/')
    || normalized.endsWith('.mp4')
    || normalized.endsWith('.mov')
    || normalized.endsWith('.webm')
}

function hasVideoContainerRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase().split('?')[0]
  return normalized.includes('final-videos/')
    || normalized.endsWith('.mp4')
    || normalized.endsWith('.mov')
    || normalized.endsWith('.webm')
}

function isPlayableVideoRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase()
  const hasPlayableScheme = normalized.startsWith('http://')
    || normalized.startsWith('https://')
    || normalized.startsWith('/')
    || normalized.startsWith('blob:')
  return hasPlayableScheme && hasVideoContainerRef(ref)
}

function playableFinalVideoRef(refs: readonly string[]): string | null {
  return refs.find(isPlayableVideoRef) ?? null
}

function visibleProviderEvidenceStatus(providerTask: VisibleEditTimelineProviderEvidence): string {
  if (providerTask.status === 'succeeded' && !providerTask.outputUrl) return 'running'
  if ((providerTask.status === 'submitted' || providerTask.status === 'running') && !providerTask.taskId) return 'planned'
  return providerTask.status
}

function readProviderEvidence(shot: unknown): VisibleEditTimelineProviderEvidence | null {
  if (!isRecord(shot)) return null
  const shotId = readString(shot.shotId)
  const providerTask = isRecord(shot.providerTask) ? shot.providerTask : null
  if (!shotId || !providerTask) return null
  const status = readString(providerTask.status) || 'planned'
  const taskId = readString(providerTask.taskId) || null
  const outputUrl = readString(providerTask.outputUrl) || null
  const blocker = readString(providerTask.blocker) || null
  if (!taskId && !outputUrl && !blocker && status === 'planned') return null
  return {
    shotId,
    status,
    taskId,
    outputUrl,
    provider: readString(providerTask.provider) || null,
    model: readString(providerTask.model) || null,
    blocker,
  }
}

function readEditTimelineEvidence(snapshot: PlanRunSnapshot | null): VisibleEditTimelineEvidence | null {
  const blackboard = findLatestEditTimelineBlackboard(snapshot)
  const workflow = findLatestEditTimelineWorkflow(snapshot)
  const finalVideoArtifact = findLatestArtifactPayload(snapshot, FINAL_VIDEO_ARTIFACT_TYPE)
  if (!blackboard && !workflow && !finalVideoArtifact) return null
  const providerTasks = Array.isArray(blackboard?.shots)
    ? blackboard.shots.map(readProviderEvidence).filter((item): item is VisibleEditTimelineProviderEvidence => item !== null)
    : []
  const refs = new Set<string>()
  const finalCritic = isRecord(blackboard?.finalCritic) ? blackboard.finalCritic : null
  if (Array.isArray(finalCritic?.evidenceRefs)) {
    for (const ref of finalCritic.evidenceRefs) {
      const text = readString(ref)
      if (text && isFinalVideoEvidenceRef(text)) refs.add(text)
    }
  }
  if (Array.isArray(workflow?.artifacts)) {
    for (const artifact of workflow.artifacts) {
      if (!isRecord(artifact)) continue
      const kind = readString(artifact.kind)
      const status = readString(artifact.status)
      const ref = readString(artifact.ref)
      if (kind === 'video' && status === 'succeeded' && ref && isFinalVideoEvidenceRef(ref)) refs.add(ref)
    }
  }
  if (finalVideoArtifact) {
    const finalVideoUrl = readString(finalVideoArtifact.finalVideoUrl)
      || readString(finalVideoArtifact.outputUrl)
    const storageKey = readString(finalVideoArtifact.storageKey)
    if (finalVideoUrl && isFinalVideoEvidenceRef(finalVideoUrl)) refs.add(finalVideoUrl)
    if (storageKey && isFinalVideoEvidenceRef(storageKey)) refs.add(storageKey)
  }
  const finalVideoRefs = Array.from(refs)
  return {
    providerTasks,
    finalVideoRefs,
    finalVideoUrl: playableFinalVideoRef(finalVideoRefs),
    finalCriticStatus: readString(finalCritic?.status) || null,
    finalCriticScore: readNumber(finalCritic?.score),
  }
}

export function readVisibleEditTimelineEvidenceFromSnapshot(value: unknown): VisibleEditTimelineEvidence | null {
  return readEditTimelineEvidence(parsePlanRunSnapshot(value))
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

function isKnownEditTimelineStatus(status: string): boolean {
  return EDIT_TIMELINE_STATUS_LABELS.has(status)
}

function normalizeProgress(progress: number | null | undefined): number | null {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) return null
  return Math.max(0, Math.min(100, Math.round(progress)))
}

function buildPlanRunTitleKey(status: string): string {
  if (status === 'completed') return 'cards.planRunTitle.completed'
  if (FAILED_STATUSES.has(status)) return 'cards.planRunTitle.failed'
  return 'cards.planRunTitle.running'
}

function buildPlanRunStageKey(params: {
  status: string
  taskStatus: string | null
  hasVisibleTask: boolean
  resumeRunning: boolean
}): string {
  if (params.resumeRunning) return 'cards.planRunStage.resuming'
  if (params.status === 'completed') return 'cards.planRunStage.completed'
  if (FAILED_STATUSES.has(params.status)) return 'cards.planRunStage.failed'
  if (params.taskStatus) {
    if (QUEUED_TASK_STATUSES.has(params.taskStatus)) return 'cards.planRunStage.queued'
    if (RUNNING_TASK_STATUSES.has(params.taskStatus)) return 'cards.planRunStage.taskRunning'
    if (params.taskStatus === 'completed') return 'cards.planRunStage.taskCompleted'
    if (FAILED_STATUSES.has(params.taskStatus)) return 'cards.planRunStage.failed'
  }
  if (params.status === 'waiting_task' || params.hasVisibleTask) return 'cards.planRunStage.waitingTask'
  return 'cards.planRunStage.checking'
}

function buildPlanRunNextKey(params: {
  status: string
  taskStatus: string | null
  hasVisibleTask: boolean
  resumeRunning: boolean
  errorMessage: string | null
}): string {
  if (params.resumeRunning) return 'cards.planRunNext.resuming'
  if (params.status === 'completed') return 'cards.planRunNext.completed'
  if (params.errorMessage || FAILED_STATUSES.has(params.status) || FAILED_STATUSES.has(params.taskStatus || '')) {
    return 'cards.planRunNext.failed'
  }
  if (params.status === 'waiting_task' || params.hasVisibleTask) return 'cards.planRunNext.waitingForTask'
  return 'cards.planRunNext.checking'
}

function findCurrentStep(snapshot: PlanRunSnapshot | null): PlanRunStepSnapshot | null {
  if (!snapshot) return null
  const currentStepKey = snapshot.planRun.currentStepKey
  if (currentStepKey) {
    const currentStep = snapshot.steps.find((step) => step.stepKey === currentStepKey)
    if (currentStep) return currentStep
  }
  return snapshot.steps.find((step) => step.status !== 'completed') || null
}

function countCompletedSteps(snapshot: PlanRunSnapshot | null, executedStepKeys: readonly string[]): number {
  if (!snapshot?.steps.length) return executedStepKeys.length
  return snapshot.steps.filter((step) => step.status === 'completed').length
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
        publishEditTimelineArtifacts(nextSnapshot)
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
            publishEditTimelineArtifacts(resumedSnapshot)
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
  const visibleTaskStatus = taskSnapshot?.task.status ?? null
  const running = !TERMINAL_PLAN_RUN_STATUSES.has(visibleStatus)
  const progress = normalizeProgress(taskSnapshot?.task.progress)
  const currentStep = findCurrentStep(snapshot)
  const completedStepCount = countCompletedSteps(snapshot, data.executedStepKeys)
  const totalStepCount = snapshot?.steps.length || currentStep?.stepTotal || null
  const titleKey = buildPlanRunTitleKey(visibleStatus)
  const stageKey = buildPlanRunStageKey({
    status: visibleStatus,
    taskStatus: visibleTaskStatus,
    hasVisibleTask: !!visibleTaskId,
    resumeRunning,
  })
  const nextKey = buildPlanRunNextKey({
    status: visibleStatus,
    taskStatus: visibleTaskStatus,
    hasVisibleTask: !!visibleTaskId,
    resumeRunning,
    errorMessage,
  })
  const latestTaskEvents = useMemo(() => [...(taskSnapshot?.events ?? [])].slice(-5), [taskSnapshot?.events])
  const editTimelineEvidence = useMemo(() => readEditTimelineEvidence(snapshot), [snapshot])

  return (
    <div className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/60 p-3 text-[12px] leading-5 text-[var(--glass-text-secondary)]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] text-[var(--glass-text-secondary)]">
          <AppIcon name={running ? 'loader' : visibleStatus === 'completed' ? 'check' : 'alert'} className={`h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-[var(--glass-text-primary)]">{t(titleKey)}</div>
          <div className="mt-0.5 text-[11px] text-[var(--glass-text-secondary)]">{t(stageKey)}</div>
          <div className="mt-2 rounded-md border border-[var(--glass-stroke-base)]/70 bg-[var(--glass-bg-surface)]/70 px-2.5 py-2 text-[11px] text-[var(--glass-text-secondary)]">
            <div className="flex items-start gap-2">
              <AppIcon name="clock" className="mt-0.5 h-3 w-3 shrink-0 text-[var(--glass-text-tertiary)]" />
              <span className="min-w-0 flex-1">{t(nextKey)}</span>
            </div>
          </div>
        </div>
      </div>

      {progress !== null ? (
        <div className="mt-3 flex items-center gap-2">
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--glass-stroke-base)]/60">
            <div className="h-full rounded-full bg-[var(--glass-accent-from)]" style={{ width: `${progress}%` }} />
          </div>
          <span className="w-9 shrink-0 text-right font-mono text-[10px] text-[var(--glass-text-tertiary)]">{progress}%</span>
        </div>
      ) : null}

      {currentStep || totalStepCount ? (
        <div className="mt-3 grid gap-1.5 text-[11px]">
          {totalStepCount ? (
            <div className="flex justify-between gap-3">
              <span className="text-[var(--glass-text-tertiary)]">{t('cards.planRunProgress')}</span>
              <span className="font-mono text-[var(--glass-text-secondary)]">{completedStepCount}/{totalStepCount}</span>
            </div>
          ) : null}
          {currentStep ? (
            <div className="flex justify-between gap-3">
              <span className="text-[var(--glass-text-tertiary)]">{t('cards.planRunCurrentStep')}</span>
              <span className="min-w-0 flex-1 truncate text-right font-mono text-[var(--glass-text-secondary)]">
                {currentStep.stepIndex && currentStep.stepTotal ? `${currentStep.stepIndex}/${currentStep.stepTotal} · ` : ''}
                {currentStep.operationId}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {resumeRunning ? <div className="mt-2 text-[11px] text-[var(--glass-tone-info-fg)]">{t('cards.planRunResumeRunning')}</div> : null}
      {errorMessage ? <div className="mt-2 break-words text-[11px] text-[var(--glass-tone-warn-fg)]">{t('cards.planRunLoadFailed')}: {errorMessage}</div> : null}
      {taskSnapshot?.task.errorMessage ? (
        <div className="mt-2 break-words text-[11px] text-[var(--glass-tone-warn-fg)]">{t('cards.planRunError')}: {taskSnapshot.task.errorMessage}</div>
      ) : null}

      {editTimelineEvidence && (
        editTimelineEvidence.providerTasks.length > 0
        || editTimelineEvidence.finalVideoRefs.length > 0
        || editTimelineEvidence.finalCriticStatus
      ) ? (
        <div className="mt-3 rounded-md border border-[var(--glass-stroke-base)]/70 bg-[var(--glass-bg-surface)]/70 px-2.5 py-2 text-[11px] text-[var(--glass-text-secondary)]">
          <div className="mb-1.5 font-medium text-[var(--glass-text-primary)]">{t('cards.planRunEvidence.title')}</div>
          {editTimelineEvidence.finalVideoUrl ? (
            <div className="mb-2">
              <div className="mb-1 text-[var(--glass-text-tertiary)]">{t('cards.planRunEvidence.finalVideoPreview')}</div>
              <div className="overflow-hidden rounded-md border border-[var(--glass-stroke-soft)] bg-black">
                <video
                  className="block max-h-[520px] w-full bg-black object-contain"
                  src={editTimelineEvidence.finalVideoUrl}
                  controls
                  preload="metadata"
                  playsInline
                />
              </div>
              <a
                className="mt-1 inline-block font-medium text-[var(--glass-accent-from)] hover:underline"
                href={editTimelineEvidence.finalVideoUrl}
                target="_blank"
                rel="noreferrer"
              >
                {t('cards.planRunEvidence.openFinalVideo')}
              </a>
            </div>
          ) : null}
          {editTimelineEvidence.providerTasks.length > 0 ? (
            <div className="space-y-1">
              <div className="text-[var(--glass-text-tertiary)]">{t('cards.planRunEvidence.providerTasks')}</div>
              {editTimelineEvidence.providerTasks.map((providerTask) => {
                const status = visibleProviderEvidenceStatus(providerTask)
                const statusLabel = isKnownEditTimelineStatus(status)
                  ? t(`cards.blackboard.status.${status}`)
                  : status
                return (
                  <div key={`${providerTask.shotId}-${providerTask.taskId ?? providerTask.status}`} className="break-all font-mono text-[10px] leading-4">
                    {providerTask.shotId} · {statusLabel}
                    {providerTask.provider ? ` · ${providerTask.provider}` : ''}
                    {providerTask.model ? `/${providerTask.model}` : ''}
                    {providerTask.taskId ? ` · ${t('cards.planRunEvidence.task')} ${providerTask.taskId}` : ''}
                    {providerTask.outputUrl ? ` · ${t('cards.planRunEvidence.output')} ${providerTask.outputUrl}` : ''}
                    {providerTask.blocker ? ` · ${t('cards.planRunEvidence.blocker')} ${providerTask.blocker}` : ''}
                  </div>
                )
              })}
            </div>
          ) : null}
          {editTimelineEvidence.finalVideoRefs.length > 0 ? (
            <div className="mt-2 break-all">
              <span className="text-[var(--glass-text-tertiary)]">{t('cards.planRunEvidence.finalVideo')} · </span>
              {editTimelineEvidence.finalVideoRefs.join(' / ')}
            </div>
          ) : null}
          {editTimelineEvidence.finalCriticStatus ? (
            <div className="mt-1.5">
              <span className="text-[var(--glass-text-tertiary)]">{t('cards.planRunEvidence.critic')} · </span>
              {editTimelineEvidence.finalCriticStatus === 'scored' && editTimelineEvidence.finalVideoRefs.length > 0 && editTimelineEvidence.finalCriticScore !== null
                ? t('cards.blackboard.criticScore', { score: editTimelineEvidence.finalCriticScore })
                : isKnownEditTimelineStatus(editTimelineEvidence.finalCriticStatus)
                  ? t(`cards.blackboard.status.${editTimelineEvidence.finalCriticStatus}`)
                  : editTimelineEvidence.finalCriticStatus}
            </div>
          ) : null}
        </div>
      ) : null}

      <details className="group mt-3 text-[11px] text-[var(--glass-text-tertiary)]">
        <summary className="flex cursor-pointer list-none items-center gap-1.5">
          <span>{t('cards.planRunTechnicalDetails')}</span>
          <AppIcon name="chevronDown" className="h-3 w-3 shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-2 space-y-1">
          <div className="break-all">{t('cards.planRunMeta.planRun')}: {data.planRunId}</div>
          <div>{t('cards.planRunMeta.operation')}: {data.operationId}</div>
          <div>{t('cards.planRunMeta.status')}: {visibleStatus}</div>
          {visibleTaskId ? <div className="break-all">{t('cards.planRunMeta.task')}: {visibleTaskId}</div> : null}
          {taskSnapshot ? (
            <div>
              {t('cards.taskStatusLabel')}: {taskSnapshot.task.status}
              {progress !== null ? ` · ${progress}%` : ''}
            </div>
          ) : null}
        </div>

        {snapshot?.steps.length ? (
          <div className="mt-3 space-y-1">
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

        {latestTaskEvents.length ? (
          <div className="mt-3 space-y-0.5">
            <div className="text-[var(--glass-text-secondary)]">{t('cards.planRunEvents')}</div>
            {latestTaskEvents.map((event) => (
              <div key={event.id} className="break-words font-mono text-[10px]">
                {latestEventLabel(event)}
              </div>
            ))}
          </div>
        ) : null}
      </details>
    </div>
  )
}
