'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import type {
  EditTimelinePartData,
  EditTimelineAgentRole,
} from '@/lib/project-agent/types'
import type {
  EditTimelineConfirmationSummary,
  EditTimelineBlackboardAgentRole,
  EditTimelineProviderMode,
} from '@/lib/edit-timeline'

type TimelineShot = EditTimelinePartData['timeline']['shots'][number]
type TimelineSegment = EditTimelinePartData['timeline']['segments'][number]
type BlackboardShot = NonNullable<EditTimelinePartData['blackboard']>['shots'][number]

function formatSeconds(ms: number): string {
  const seconds = ms / 1000
  return Number.isInteger(seconds) ? `${String(seconds)}s` : `${seconds.toFixed(1)}s`
}

function totalDurationMs(data: EditTimelinePartData): number {
  return data.confirmationSummary?.totalDurationMs
    ?? Math.max(...data.timeline.segments.map((segment) => segment.startMs + segment.durationMs))
}

function providerModeFromShot(shot: TimelineShot): EditTimelineProviderMode {
  if (shot.control.lastFrameRef) return 'first-last-frame'
  if (shot.control.firstFrameRef) return 'first-frame'
  if (shot.control.referenceImageRefs.length > 0) return 'reference-guided'
  return 'text-to-video'
}

function providerModeLabelKey(mode: EditTimelineProviderMode): string {
  if (mode === 'first-last-frame') return 'cards.editTimeline.providerMode.firstLastFrame'
  if (mode === 'first-frame') return 'cards.editTimeline.providerMode.firstFrame'
  if (mode === 'reference-guided') return 'cards.editTimeline.providerMode.referenceGuided'
  return 'cards.editTimeline.providerMode.textToVideo'
}

function agentRoleLabelKey(role: EditTimelineAgentRole): string {
  if (role === 'main-director') return 'cards.agentCrew.roles.mainDirector'
  if (role === 'screenplay-agent') return 'cards.blackboard.roles.screenplayAgent'
  if (role === 'cinematography-agent') return 'cards.blackboard.roles.cinematographyAgent'
  if (role === 'continuity-agent') return 'cards.blackboard.roles.continuityAgent'
  if (role === 'prompt-engineer-agent') return 'cards.blackboard.roles.promptEngineerAgent'
  if (role === 'sound-agent') return 'cards.blackboard.roles.soundAgent'
  if (role === 'visual-director') return 'cards.agentCrew.roles.visualDirector'
  if (role === 'story-editor') return 'cards.agentCrew.roles.storyEditor'
  if (role === 'sound-designer') return 'cards.agentCrew.roles.soundDesigner'
  return 'cards.agentCrew.roles.subtitleWriter'
}

function blackboardRoleLabelKey(role: EditTimelineBlackboardAgentRole): string {
  if (role === 'main-director') return 'cards.blackboard.roles.mainDirector'
  if (role === 'screenplay-agent') return 'cards.blackboard.roles.screenplayAgent'
  if (role === 'cinematography-agent') return 'cards.blackboard.roles.cinematographyAgent'
  if (role === 'continuity-agent') return 'cards.blackboard.roles.continuityAgent'
  if (role === 'prompt-engineer-agent') return 'cards.blackboard.roles.promptEngineerAgent'
  if (role === 'sound-agent') return 'cards.blackboard.roles.soundAgent'
  if (role === 'provider-production-agent') return 'cards.blackboard.roles.providerProductionAgent'
  return 'cards.blackboard.roles.filmCriticAgent'
}

function shotsForSegment(data: EditTimelinePartData, segment: TimelineSegment): TimelineShot[] {
  const byId = new Map(data.timeline.shots.map((shot) => [shot.id, shot] as const))
  return segment.shotIds
    .map((shotId) => byId.get(shotId))
    .filter((shot): shot is TimelineShot => !!shot)
}

function findShotSummary(
  summary: EditTimelineConfirmationSummary | undefined,
  shotId: string,
): EditTimelineConfirmationSummary['shots'][number] | null {
  return summary?.shots.find((shot) => shot.shotId === shotId) ?? null
}

function hasProviderTaskEvidence(shot: BlackboardShot): boolean {
  return Boolean(shot.providerTask.taskId && shot.providerTask.status !== 'planned')
    || Boolean(shot.providerTask.outputUrl)
    || Boolean(shot.providerTask.blocker)
    || shot.providerTask.status === 'failed'
    || shot.providerTask.status === 'blocked'
}

function visibleProviderTaskStatus(shot: BlackboardShot): BlackboardShot['providerTask']['status'] {
  if (shot.providerTask.status === 'succeeded' && !shot.providerTask.outputUrl) return 'running'
  if ((shot.providerTask.status === 'submitted' || shot.providerTask.status === 'running') && !shot.providerTask.taskId) {
    return 'planned'
  }
  return shot.providerTask.status
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

function finalVideoEvidenceRefs(
  data: EditTimelinePartData,
  blackboard: NonNullable<EditTimelinePartData['blackboard']>,
): string[] {
  const refs = new Set<string>()
  for (const ref of blackboard.finalCritic.evidenceRefs) {
    if (isFinalVideoEvidenceRef(ref)) refs.add(ref)
  }
  for (const artifact of data.workflow?.artifacts ?? []) {
    if (artifact.kind !== 'video' || artifact.status !== 'succeeded' || !artifact.ref) continue
    if (isFinalVideoEvidenceRef(artifact.ref)) refs.add(artifact.ref)
  }
  return Array.from(refs)
}

function shouldShowFinalCriticScore(
  blackboard: NonNullable<EditTimelinePartData['blackboard']>,
  refs: readonly string[],
): boolean {
  return blackboard.finalCritic.status === 'scored'
    && refs.length > 0
}

function visibleFinalCriticStatus(
  blackboard: NonNullable<EditTimelinePartData['blackboard']>,
  refs: readonly string[],
): NonNullable<EditTimelinePartData['blackboard']>['finalCritic']['status'] {
  if (blackboard.finalCritic.status === 'scored' && refs.length === 0) return 'ready'
  return blackboard.finalCritic.status
}

function shouldShowShotQualityScore(shot: BlackboardShot): boolean {
  return shot.status === 'scored' && Boolean(shot.providerTask.outputUrl)
}

export function EditTimelineDataCard({ data }: { data: EditTimelinePartData }) {
  const t = useTranslations('assistantAgent')
  const durationMs = totalDurationMs(data)
  const summary = data.confirmationSummary
  const providerTaskCount = summary?.providerTaskCount ?? data.estimatedTaskCount
  const blockers = summary?.blockers ?? data.risks
  const creativeBrief = data.creativeBrief
  const agentCrew = data.agentCrew
  const blackboard = data.blackboard ?? data.workflow?.blackboard
  const finalEvidenceRefs = blackboard ? finalVideoEvidenceRefs(data, blackboard) : []
  const finalVideoUrl = playableFinalVideoRef(finalEvidenceRefs)
  const finalCriticStatus = blackboard ? visibleFinalCriticStatus(blackboard, finalEvidenceRefs) : 'planned'

  return (
    <details className="group rounded-lg border border-[var(--glass-stroke-base)]/70 bg-[var(--glass-bg-muted)]/60 p-3 text-[12px] leading-5 text-[var(--glass-text-secondary)]" open>
      <summary className="flex cursor-pointer list-none items-center gap-2">
        <AppIcon name="timeline" className="h-3.5 w-3.5 shrink-0 text-[var(--glass-accent-from)]" />
        <span className="min-w-0 truncate text-sm font-medium text-[var(--glass-text-primary)]">
          {t('cards.editTimeline.title')} · {data.timeline.title}
        </span>
        <AppIcon name="chevronDown" className="ml-auto h-3 w-3 shrink-0 transition-transform group-open:rotate-180" />
      </summary>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-md border border-[var(--glass-stroke-base)]/60 bg-[var(--glass-bg-surface)]/70 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-normal text-[var(--glass-text-tertiary)]">{t('cards.editTimeline.duration')}</div>
          <div className="font-medium text-[var(--glass-text-primary)]">{formatSeconds(durationMs)}</div>
        </div>
        <div className="rounded-md border border-[var(--glass-stroke-base)]/60 bg-[var(--glass-bg-surface)]/70 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-normal text-[var(--glass-text-tertiary)]">{t('cards.editTimeline.aspectRatio')}</div>
          <div className="font-medium text-[var(--glass-text-primary)]">{data.timeline.aspectRatio}</div>
        </div>
        <div className="rounded-md border border-[var(--glass-stroke-base)]/60 bg-[var(--glass-bg-surface)]/70 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-normal text-[var(--glass-text-tertiary)]">{t('cards.editTimeline.shotCount')}</div>
          <div className="font-medium text-[var(--glass-text-primary)]">{String(data.timeline.shots.length)}</div>
        </div>
        <div className="rounded-md border border-[var(--glass-stroke-base)]/60 bg-[var(--glass-bg-surface)]/70 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-normal text-[var(--glass-text-tertiary)]">{t('cards.editTimeline.providerTaskCount')}</div>
          <div className="font-medium text-[var(--glass-text-primary)]">{String(providerTaskCount)}</div>
        </div>
      </div>

      {blackboard ? (
        <div className="mt-3 rounded-md border border-[var(--glass-stroke-base)]/70 bg-[var(--glass-bg-surface)]/70 px-3 py-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0 truncate text-[11px] font-medium text-[var(--glass-text-primary)]">
              {t('cards.blackboard.finalVideoPreview')}
            </div>
            <div className="shrink-0 text-[10px] text-[var(--glass-text-tertiary)]">
              {shouldShowFinalCriticScore(blackboard, finalEvidenceRefs)
                ? t('cards.blackboard.criticScore', { score: blackboard.finalCritic.score })
                : t('cards.blackboard.criticStatus', {
                  status: t(`cards.blackboard.status.${finalCriticStatus}`),
                })}
            </div>
          </div>
          {finalVideoUrl ? (
            <div className="overflow-hidden rounded-md border border-[var(--glass-stroke-soft)] bg-black">
              <video
                className="block max-h-[520px] w-full bg-black object-contain"
                src={finalVideoUrl}
                controls
                preload="metadata"
                playsInline
              />
            </div>
          ) : (
            <div className="rounded-md bg-[var(--glass-bg-muted)]/70 px-2 py-2 text-[10px] leading-4 text-[var(--glass-text-tertiary)]">
              {finalEvidenceRefs.length > 0
                ? t('cards.blackboard.finalVideoUnavailable')
                : t('cards.blackboard.finalVideoPending')}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] leading-4">
            {finalVideoUrl ? (
              <a
                className="font-medium text-[var(--glass-accent-from)] hover:underline"
                href={finalVideoUrl}
                target="_blank"
                rel="noreferrer"
              >
                {t('cards.blackboard.openFinalVideo')}
              </a>
            ) : null}
            {finalEvidenceRefs.length > 0 ? (
              <span className="min-w-0 break-all text-[var(--glass-text-tertiary)]">
                {t('cards.blackboard.finalEvidence')} · {finalEvidenceRefs.join(' / ')}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {creativeBrief ? (
        <div className="mt-3 rounded-md border border-[var(--glass-stroke-base)]/60 bg-[var(--glass-bg-surface)]/60 px-3 py-2">
          <div className="mb-1 text-[11px] font-medium text-[var(--glass-text-primary)]">
            {t('cards.editTimeline.storyUnderstanding')}
          </div>
          <div className="grid gap-1 text-[11px] text-[var(--glass-text-secondary)] sm:grid-cols-2">
            <div className="min-w-0 truncate">
              <span className="text-[var(--glass-text-tertiary)]">{t('cards.editTimeline.protagonist')} · </span>
              {creativeBrief.protagonist}
            </div>
            <div className="min-w-0 truncate">
              <span className="text-[var(--glass-text-tertiary)]">{t('cards.editTimeline.setting')} · </span>
              {creativeBrief.setting}
            </div>
            <div className="min-w-0 truncate">
              <span className="text-[var(--glass-text-tertiary)]">{t('cards.editTimeline.mood')} · </span>
              {creativeBrief.mood}
            </div>
            <div className="min-w-0 truncate">
              <span className="text-[var(--glass-text-tertiary)]">{t('cards.editTimeline.twist')} · </span>
              {creativeBrief.twist}
            </div>
          </div>
          {creativeBrief.assumptions.length > 0 ? (
            <div className="mt-2 line-clamp-2 text-[10px] text-[var(--glass-text-tertiary)]">
              {t('cards.editTimeline.assumptions')} · {creativeBrief.assumptions.slice(0, 2).join(' / ')}
            </div>
          ) : null}
        </div>
      ) : null}

      {agentCrew ? (
        <div className="mt-3 rounded-md border border-[var(--glass-stroke-base)]/60 bg-[var(--glass-bg-surface)]/60 px-3 py-2">
          <div className="mb-2 text-[11px] font-medium text-[var(--glass-text-primary)]">
            {t('cards.agentCrew.drawerTitle')}
          </div>
          <div className="rounded-md bg-[var(--glass-bg-muted)]/70 px-2 py-1.5 text-[10px] leading-4 text-[var(--glass-text-secondary)]">
            <span className="text-[var(--glass-text-tertiary)]">{t(agentRoleLabelKey(agentCrew.director.role))} · </span>
            {agentCrew.director.summary}
          </div>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {agentCrew.subagents.map((contribution) => (
              <div
                key={contribution.agentId}
                className="rounded-md border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/55 px-2 py-1.5"
              >
                <div className="truncate text-[10px] font-medium text-[var(--glass-text-primary)]">{contribution.title}</div>
                <div className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-[var(--glass-text-secondary)]">
                  {contribution.summary}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {blackboard ? (
        <div className="mt-3 rounded-md border border-[var(--glass-stroke-base)]/60 bg-[var(--glass-bg-surface)]/60 px-3 py-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0 truncate text-[11px] font-medium text-[var(--glass-text-primary)]">
              {t('cards.blackboard.title')}
            </div>
            <div className="shrink-0 text-[10px] text-[var(--glass-text-tertiary)]">
              {shouldShowFinalCriticScore(blackboard, finalEvidenceRefs)
                ? t('cards.blackboard.criticScore', { score: blackboard.finalCritic.score })
                : t('cards.blackboard.criticStatus', {
                  status: t(`cards.blackboard.status.${finalCriticStatus}`),
                })}
            </div>
          </div>
          <div className="line-clamp-2 rounded-md bg-[var(--glass-bg-muted)]/70 px-2 py-1.5 text-[10px] leading-4 text-[var(--glass-text-secondary)]">
            <span className="text-[var(--glass-text-tertiary)]">{t('cards.blackboard.nextOptimization')} · </span>
            {blackboard.nextOptimizationTarget}
          </div>
          {blackboard.macroScript.length > 0 ? (
            <div className="mt-2 grid gap-1.5">
              {blackboard.macroScript.map((segment) => (
                <div
                  key={segment.segmentId}
                  className="rounded-md border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/50 px-2 py-1.5 text-[10px] leading-4 text-[var(--glass-text-secondary)]"
                >
                  <div className="flex items-center justify-between gap-2 text-[var(--glass-text-primary)]">
                    <span className="min-w-0 truncate">{t('cards.blackboard.macroScript')} · {segment.segmentId}</span>
                    <span className="shrink-0 text-[var(--glass-text-tertiary)]">
                      {formatSeconds(segment.startMs)} - {formatSeconds(segment.endMs)}
                    </span>
                  </div>
                  <div className="mt-0.5 break-words">{segment.beatGoal}</div>
                  <div className="mt-0.5 truncate text-[var(--glass-text-tertiary)]">
                    {t('cards.blackboard.storyFunction')} · {segment.storyFunction}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {blackboard.segmentBlackboards.length > 0 ? (
            <div className="mt-2 grid gap-1.5">
              {blackboard.segmentBlackboards.map((segment) => (
                <div
                  key={segment.segmentId}
                  className="rounded-md border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/45 px-2 py-1.5 text-[10px] leading-4"
                >
                  <div className="flex items-center justify-between gap-2 text-[var(--glass-text-primary)]">
                    <span className="min-w-0 truncate">{t('cards.blackboard.segmentBlackboard')} · {segment.segmentId}</span>
                    <span className="shrink-0 text-[var(--glass-text-tertiary)]">
                      {t(`cards.blackboard.status.${segment.status}`)}
                    </span>
                  </div>
                  <div className="mt-0.5 break-words text-[var(--glass-text-secondary)]">
                    <span className="text-[var(--glass-text-tertiary)]">{t('cards.blackboard.screenplay')} · </span>
                    {segment.screenplay.visibleAction}
                  </div>
                  <div className="mt-0.5 break-words text-[var(--glass-text-secondary)]">
                    <span className="text-[var(--glass-text-tertiary)]">{t('cards.blackboard.cinematography')} · </span>
                    {segment.cinematography.camera} / {segment.cinematography.motion} / {segment.cinematography.composition}
                  </div>
                  <div className="mt-0.5 break-words text-[var(--glass-text-secondary)]">
                    <span className="text-[var(--glass-text-tertiary)]">{t('cards.blackboard.continuity')} · </span>
                    {segment.continuity.characterContinuity} / {segment.continuity.locationContinuity} / {segment.continuity.propContinuity}
                  </div>
                  <div className="mt-0.5 break-words text-[var(--glass-text-secondary)]">
                    <span className="text-[var(--glass-text-tertiary)]">{t('cards.blackboard.providerPrompt')} · </span>
                    {segment.promptPackage.providerPrompt}
                  </div>
                  <div className="mt-0.5 truncate text-[var(--glass-text-tertiary)]">
                    {t('cards.blackboard.soundPlan')} · {segment.soundPlan.cues.join(' / ')}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {blackboard.agents.map((agent) => (
              <div
                key={agent.agentId}
                className="rounded-md border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/55 px-2 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 truncate text-[10px] font-medium text-[var(--glass-text-primary)]">
                    {t(blackboardRoleLabelKey(agent.role))}
                  </div>
                  <div className="shrink-0 text-[9px] text-[var(--glass-text-tertiary)]">
                    {t(`cards.blackboard.status.${agent.status}`)}
                  </div>
                </div>
                <div className="mt-0.5 break-words text-[10px] leading-4 text-[var(--glass-text-secondary)]">
                  {agent.outputs.length > 0 ? agent.outputs.join(' / ') : agent.mission}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 grid gap-1.5">
            {blackboard.shots.map((shot) => (
              <div
                key={shot.shotId}
                className="rounded-md border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/45 px-2 py-1.5 text-[10px] leading-4"
              >
                <div className="flex items-center justify-between gap-2 text-[var(--glass-text-primary)]">
                  <span className="min-w-0 truncate">{shot.shotId}</span>
                  <span className="shrink-0 text-[var(--glass-text-tertiary)]">
                    {shouldShowShotQualityScore(shot)
                      ? t('cards.blackboard.shotScore', { score: shot.quality.score })
                      : t(`cards.blackboard.status.${shot.status}`)}
                  </span>
                </div>
                <div className="mt-0.5 break-words text-[var(--glass-text-secondary)]">
                  {shot.promptPackage.camera} · {shot.promptPackage.referencePolicy}
                </div>
                <div className="mt-0.5 break-words text-[var(--glass-text-secondary)]">
                  <span className="text-[var(--glass-text-tertiary)]">{t('cards.blackboard.providerPrompt')} · </span>
                  {shot.promptPackage.providerPrompt}
                </div>
                {hasProviderTaskEvidence(shot) ? (
                  <div className="mt-1 space-y-0.5 text-[var(--glass-text-secondary)]">
                    <div className="break-all">
                      <span className="text-[var(--glass-text-tertiary)]">{t('cards.blackboard.providerTask')} · </span>
                      {shot.providerTask.provider ?? '-'}
                      {shot.providerTask.model ? `/${shot.providerTask.model}` : ''}
                      {' · '}
                      {t(`cards.blackboard.status.${visibleProviderTaskStatus(shot)}`)}
                      {shot.providerTask.taskId ? ` · ${shot.providerTask.taskId}` : ''}
                    </div>
                    {shot.providerTask.outputUrl ? (
                      <div className="break-all">
                        <span className="text-[var(--glass-text-tertiary)]">{t('cards.blackboard.outputUrl')} · </span>
                        {shot.providerTask.outputUrl}
                      </div>
                    ) : null}
                    {shot.providerTask.blocker ? (
                      <div className="break-all text-[var(--glass-tone-warn-fg)]">
                        <span>{t('cards.blackboard.blocker')} · </span>
                        {shot.providerTask.blocker}
                      </div>
                    ) : null}
                    {shot.quality.redoReason ? (
                      <div className="break-all">
                        <span className="text-[var(--glass-text-tertiary)]">{t('cards.blackboard.redoReason')} · </span>
                        {shot.quality.redoReason}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 space-y-3">
        {data.timeline.segments.map((segment) => (
          <section key={segment.id} className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--glass-text-tertiary)]">
              <span className="min-w-0 truncate">{segment.label}</span>
              <span className="shrink-0">{formatSeconds(segment.startMs)} - {formatSeconds(segment.startMs + segment.durationMs)}</span>
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {shotsForSegment(data, segment).map((shot) => {
                const shotSummary = findShotSummary(summary, shot.id)
                const mode = shotSummary?.providerMode ?? providerModeFromShot(shot)
                const editorial = shot.editorial
                return (
                  <div
                    key={shot.id}
                    className="min-w-[180px] flex-1 rounded-md border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/80 px-2 py-2"
                  >
                    <div className="truncate text-[12px] font-medium text-[var(--glass-text-primary)]">{shot.title}</div>
                    <div className="mt-1 text-[10px] text-[var(--glass-text-tertiary)]">
                      {formatSeconds(shot.durationMs)} · {t(providerModeLabelKey(mode))}
                    </div>
                    {editorial ? (
                      <div className="mt-2 space-y-1 text-[10px] leading-4 text-[var(--glass-text-secondary)]">
                        <div className="line-clamp-2">
                          <span className="text-[var(--glass-text-tertiary)]">{t('cards.editTimeline.visual')} · </span>
                          {editorial.visual}
                        </div>
                        <div className="line-clamp-2">
                          <span className="text-[var(--glass-text-tertiary)]">{t('cards.editTimeline.story')} · </span>
                          {editorial.story}
                        </div>
                        <div className="line-clamp-2">
                          <span className="text-[var(--glass-text-tertiary)]">{t('cards.editTimeline.sound')} · </span>
                          {editorial.sound}
                        </div>
                        {editorial.caption ? (
                          <div className="line-clamp-2">
                            <span className="text-[var(--glass-text-tertiary)]">{t('cards.editTimeline.caption')} · </span>
                            {editorial.caption}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-1 line-clamp-2 text-[10px] leading-4 text-[var(--glass-text-secondary)]">
                        {shot.goal}
                      </div>
                    )}
                    <div className="mt-1 truncate text-[10px] text-[var(--glass-text-tertiary)]">
                      {t('cards.editTimeline.references', { count: shot.referenceIds.length })}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      {blockers.length > 0 ? (
        <div className="mt-3 rounded-md border border-[var(--glass-tone-warn-fg)]/30 bg-[var(--glass-tone-warn-bg)] px-3 py-2 text-[11px] text-[var(--glass-tone-warn-fg)]">
          <div className="mb-1 flex items-center gap-1.5 font-medium">
            <AppIcon name="alert" className="h-3 w-3 shrink-0" />
            <span>{t('cards.editTimeline.blockers', { count: blockers.length })}</span>
          </div>
          <div className="space-y-0.5">
            {blockers.slice(0, 4).map((blocker) => (
              <div key={`${blocker.code}:${blocker.message}`} className="break-words">{blocker.message}</div>
            ))}
          </div>
        </div>
      ) : null}
    </details>
  )
}
