import type { UIMessage } from 'ai'
import type {
  EditTimelineAgentContribution,
  EditTimelineAgentRole,
  EditTimelinePartData,
} from '@/lib/project-agent/types'
import type {
  EditTimelineBlackboard,
  EditTimelineSegmentBlackboard,
} from '@/lib/edit-timeline'
import { mergeWorkspaceEditTimelinePart } from './edit-timeline-board-event'

const EDIT_TIMELINE_PART_TYPE = 'data-edit-timeline'
const CHINESE_TEXT_PATTERN = /[\u3400-\u9fff]/

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isParsedTimeline(value: unknown): value is EditTimelinePartData['timeline'] {
  if (!isRecord(value)) return false
  return (
    isString(value.id)
    && isString(value.title)
    && isString(value.aspectRatio)
    && typeof value.fps === 'number'
    && Array.isArray(value.segments)
    && Array.isArray(value.shots)
    && Array.isArray(value.references)
    && isRecord(value.continuityBible)
  )
}

function hasChineseText(value: string): boolean {
  return CHINESE_TEXT_PATTERN.test(value)
}

function secondsLabel(ms: number): string {
  const seconds = ms / 1000
  return Number.isInteger(seconds) ? `${seconds}s` : `${seconds.toFixed(1)}s`
}

function timeRangeLabel(startMs: number, durationMs: number): string {
  return `${secondsLabel(startMs)} - ${secondsLabel(startMs + durationMs)}`
}

function uniqueShotIds(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  values.forEach((value) => {
    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    output.push(normalized)
  })
  return output
}

function orderedShots(timeline: EditTimelinePartData['timeline']): EditTimelinePartData['timeline']['shots'] {
  return [...timeline.shots].sort((left, right) => {
    if (left.startMs !== right.startMs) return left.startMs - right.startMs
    if (left.order !== right.order) return left.order - right.order
    return left.id.localeCompare(right.id)
  })
}

function isChineseTimeline(data: EditTimelinePartData): boolean {
  const candidate = [
    data.sourceStory,
    data.timeline.title,
    ...data.timeline.segments.map((segment) => `${segment.label} ${segment.intent}`),
  ].filter((value): value is string => typeof value === 'string')
  return hasChineseText(candidate.join(' '))
}

function roleText(data: EditTimelinePartData): {
  directorTitle: string
  directorMission: string
  directorSummary: string
  visualTitle: string
  visualMission: string
  storyTitle: string
  storyMission: string
  soundTitle: string
  soundMission: string
  subtitleTitle: string
  subtitleMission: string
  draftedSummary: string
  needsReviewSummary: string
  synthesisPrefix: string
} {
  if (isChineseTimeline(data)) {
    return {
      directorTitle: '主 Agent',
      directorMission: '理解用户目标，按时间线拆分镜头，分发给专业子 Agent，并综合为可执行视频计划。',
      directorSummary: '主 Agent 已根据当前时间线整理任务分发与综合结果。',
      visualTitle: '画面 Agent',
      visualMission: '负责每个镜头的视觉画面、构图、风格和运动提示。',
      storyTitle: '剧情 Agent',
      storyMission: '负责每个镜头的剧情推进、冲突节奏和镜头目的。',
      soundTitle: '声音 Agent',
      soundMission: '负责每个镜头的环境音、音乐、音效节奏和声音氛围。',
      subtitleTitle: '字幕 Agent',
      subtitleMission: '负责每个镜头的字幕文案、语气和屏幕文字节奏。',
      draftedSummary: '已从当前时间线镜头中恢复结构化输出。',
      needsReviewSummary: '当前时间线缺少可用镜头，需补充后再生成。',
      synthesisPrefix: '主 Agent 已综合子 Agent 输出',
    }
  }
  return {
    directorTitle: 'Main Agent',
    directorMission: 'Interpret the user goal, split the timeline into shots, dispatch specialist agents, and synthesize an executable video plan.',
    directorSummary: 'The main agent organized dispatch and synthesis from the current timeline.',
    visualTitle: 'Visual Agent',
    visualMission: 'Own visual design, framing, style, and motion prompts for each shot.',
    storyTitle: 'Story Agent',
    storyMission: 'Own story progression, conflict, pacing, and shot purpose.',
    soundTitle: 'Sound Agent',
    soundMission: 'Own ambience, music, effects, rhythm, and sonic mood for each shot.',
    subtitleTitle: 'Subtitle Agent',
    subtitleMission: 'Own captions, tone, and screen text pacing for each shot.',
    draftedSummary: 'Structured outputs were restored from the current timeline shots.',
    needsReviewSummary: 'The current timeline has no usable shots and needs review.',
    synthesisPrefix: 'The main agent synthesized subagent outputs',
  }
}

function fallbackText(values: readonly (string | undefined)[]): string {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() ?? ''
}

function buildSubagentContribution(params: {
  agentId: EditTimelineAgentContribution['agentId']
  role: EditTimelineAgentContribution['role']
  title: string
  mission: string
  summary: string
  data: EditTimelinePartData
  selectText: (shot: EditTimelinePartData['timeline']['shots'][number]) => string
}): EditTimelineAgentContribution {
  const shots = orderedShots(params.data.timeline)
  const outputs = shots.map((shot) => ({
    shotId: shot.id,
    text: params.selectText(shot),
  })).filter((output) => output.text.trim().length > 0)
  const shotIds = uniqueShotIds(outputs.map((output) => output.shotId))
  return {
    agentId: params.agentId,
    role: params.role,
    title: params.title,
    mission: params.mission,
    summary: params.summary,
    shotIds,
    outputs,
    status: shotIds.length === shots.length ? 'drafted' : 'needs-review',
  }
}

function deriveAgentCrewFromTimeline(data: EditTimelinePartData): EditTimelinePartData['agentCrew'] | undefined {
  const shots = orderedShots(data.timeline)
  if (shots.length === 0) return undefined
  const copy = roleText(data)
  const shotIds = shots.map((shot) => shot.id)
  const directorOutputs = data.timeline.segments
    .slice()
    .sort((left, right) => left.startMs - right.startMs)
    .flatMap((segment) => {
      const segmentShotId = segment.shotIds.find((shotId) => shotIds.includes(shotId))
      if (!segmentShotId) return []
      return [{
        shotId: segmentShotId,
        text: `${timeRangeLabel(segment.startMs, segment.durationMs)} ${segment.label}: ${segment.intent}`,
      }]
    })

  const director: EditTimelineAgentContribution = {
    agentId: 'main-director',
    role: 'main-director',
    title: copy.directorTitle,
    mission: copy.directorMission,
    summary: copy.directorSummary,
    shotIds,
    outputs: directorOutputs.length > 0
      ? directorOutputs
      : shots.map((shot) => ({ shotId: shot.id, text: `${timeRangeLabel(shot.startMs, shot.durationMs)} ${shot.title}: ${shot.goal}` })),
    status: 'drafted',
  }

  const subagents: EditTimelineAgentContribution[] = [
    buildSubagentContribution({
      agentId: 'visual-director',
      role: 'visual-director',
      title: copy.visualTitle,
      mission: copy.visualMission,
      summary: copy.draftedSummary,
      data,
      selectText: (shot) => fallbackText([shot.editorial?.visual, shot.control.cameraMotion, shot.control.prompt, shot.goal]),
    }),
    buildSubagentContribution({
      agentId: 'story-editor',
      role: 'story-editor',
      title: copy.storyTitle,
      mission: copy.storyMission,
      summary: copy.draftedSummary,
      data,
      selectText: (shot) => fallbackText([shot.editorial?.story, shot.goal, shot.title]),
    }),
    buildSubagentContribution({
      agentId: 'sound-designer',
      role: 'sound-designer',
      title: copy.soundTitle,
      mission: copy.soundMission,
      summary: copy.draftedSummary,
      data,
      selectText: (shot) => fallbackText([shot.editorial?.sound, shot.goal, shot.title]),
    }),
    buildSubagentContribution({
      agentId: 'subtitle-writer',
      role: 'subtitle-writer',
      title: copy.subtitleTitle,
      mission: copy.subtitleMission,
      summary: copy.draftedSummary,
      data,
      selectText: (shot) => fallbackText([shot.editorial?.caption, shot.title, shot.goal]),
    }),
  ]

  return {
    director,
    subagents: subagents.map((agent) => (
      agent.outputs.length > 0
        ? agent
        : { ...agent, summary: copy.needsReviewSummary, status: 'needs-review' }
    )),
    synthesis: `${copy.synthesisPrefix}: ${data.timeline.title} (${data.timeline.aspectRatio}, ${shots.length} shots).`,
  }
}

function segmentByShotId(segments: readonly EditTimelineSegmentBlackboard[]): ReadonlyMap<string, EditTimelineSegmentBlackboard> {
  const output = new Map<string, EditTimelineSegmentBlackboard>()
  segments.forEach((segment) => {
    segment.shotIds.forEach((shotId) => {
      output.set(shotId, segment)
    })
  })
  return output
}

function buildBlackboardAgentOutputs(params: {
  data: EditTimelinePartData
  segmentsByShotId: ReadonlyMap<string, EditTimelineSegmentBlackboard>
  selectText: (segment: EditTimelineSegmentBlackboard) => string
}): EditTimelineAgentContribution['outputs'] {
  return orderedShots(params.data.timeline).flatMap((shot) => {
    const segment = params.segmentsByShotId.get(shot.id)
    if (!segment) return []
    const text = params.selectText(segment).trim()
    return text ? [{ shotId: shot.id, text }] : []
  })
}

function buildBlackboardSubagentContribution(params: {
  data: EditTimelinePartData
  role: EditTimelineAgentRole
  agentId: string
  title: string
  mission: string
  summary: string
  outputs: EditTimelineAgentContribution['outputs']
}): EditTimelineAgentContribution {
  const shotIds = orderedShots(params.data.timeline).map((shot) => shot.id)
  return {
    agentId: params.agentId,
    role: params.role,
    title: params.title,
    mission: params.mission,
    summary: params.summary,
    shotIds,
    outputs: params.outputs,
    status: params.outputs.length === shotIds.length ? 'drafted' : 'needs-review',
  }
}

function firstBlackboardOutputText(
  outputs: readonly EditTimelineAgentContribution['outputs'][number][],
  fallback: string,
): string {
  return outputs[0]?.text ?? fallback
}

function deriveAgentCrewFromBlackboard(
  data: EditTimelinePartData,
  blackboard: EditTimelineBlackboard,
): EditTimelinePartData['agentCrew'] | undefined {
  const shots = orderedShots(data.timeline)
  if (shots.length === 0) return undefined
  const zh = isChineseTimeline(data)
  const segmentsByShotId = segmentByShotId(blackboard.segmentBlackboards)
  const timelineSegmentsById = new Map(data.timeline.segments.map((segment) => [segment.id, segment] as const))
  const shotIds = shots.map((shot) => shot.id)
  const directorOutputs = blackboard.macroScript.map((segment) => ({
    shotId: timelineSegmentsById.get(segment.segmentId)?.shotIds[0] ?? segment.segmentId,
    text: `${secondsLabel(segment.startMs)}-${secondsLabel(segment.endMs)} ${segment.storyFunction}: ${segment.beatGoal}`,
  }))
  const screenplayOutputs = buildBlackboardAgentOutputs({
    data,
    segmentsByShotId,
    selectText: (segment) => segment.screenplay.visibleAction,
  })
  const cinematographyOutputs = buildBlackboardAgentOutputs({
    data,
    segmentsByShotId,
    selectText: (segment) => [
      segment.cinematography.camera,
      segment.cinematography.motion,
      segment.cinematography.composition,
      segment.cinematography.lighting,
    ].join(' · '),
  })
  const continuityOutputs = buildBlackboardAgentOutputs({
    data,
    segmentsByShotId,
    selectText: (segment) => [
      segment.continuity.characterContinuity,
      segment.continuity.locationContinuity,
      segment.continuity.propContinuity,
      segment.continuity.styleContinuity,
    ].join(' · '),
  })
  const promptOutputs = buildBlackboardAgentOutputs({
    data,
    segmentsByShotId,
    selectText: (segment) => segment.promptPackage.providerPrompt,
  })
  const soundOutputs = buildBlackboardAgentOutputs({
    data,
    segmentsByShotId,
    selectText: (segment) => segment.soundPlan.cues.join(' / '),
  })

  const director: EditTimelineAgentContribution = {
    agentId: 'main-director',
    role: 'main-director',
    title: zh ? '主导演 Agent' : 'Main Director Agent',
    mission: zh
      ? '从 EditTimelineBlackboard 的 Macro Script 投影 UI 兼容分工。'
      : 'Project the UI-compatible crew from the EditTimelineBlackboard Macro Script.',
    summary: zh
      ? `主导演从黑板恢复 ${String(blackboard.macroScript.length)} 个段落和 ${String(shotIds.length)} 个镜头。`
      : `The main director restored ${String(blackboard.macroScript.length)} segments and ${String(shotIds.length)} shots from the blackboard.`,
    shotIds,
    outputs: directorOutputs,
    status: 'drafted',
  }

  const subagents: EditTimelineAgentContribution[] = [
    buildBlackboardSubagentContribution({
      data,
      role: 'screenplay-agent',
      agentId: 'screenplay-agent',
      title: zh ? '剧本 Agent' : 'Screenplay Agent',
      mission: zh ? '内容来自 blackboard.screenplay.visibleAction。' : 'Projected from blackboard.screenplay.visibleAction.',
      summary: zh
        ? `从黑板恢复可见动作：${firstBlackboardOutputText(screenplayOutputs, data.timeline.title)}`
        : `Restored visible actions from the blackboard: ${firstBlackboardOutputText(screenplayOutputs, data.timeline.title)}.`,
      outputs: screenplayOutputs,
    }),
    buildBlackboardSubagentContribution({
      data,
      role: 'cinematography-agent',
      agentId: 'cinematography-agent',
      title: zh ? '摄影 Agent' : 'Cinematography Agent',
      mission: zh ? '内容来自 blackboard.cinematography。' : 'Projected from blackboard.cinematography.',
      summary: zh
        ? `从黑板恢复镜头语言：${firstBlackboardOutputText(cinematographyOutputs, data.timeline.title)}`
        : `Restored camera language from the blackboard: ${firstBlackboardOutputText(cinematographyOutputs, data.timeline.title)}.`,
      outputs: cinematographyOutputs,
    }),
    buildBlackboardSubagentContribution({
      data,
      role: 'continuity-agent',
      agentId: 'continuity-agent',
      title: zh ? '连续性 Agent' : 'Continuity Agent',
      mission: zh ? '内容来自 blackboard.continuity。' : 'Projected from blackboard.continuity.',
      summary: zh
        ? `从黑板恢复连续性锚点：${firstBlackboardOutputText(continuityOutputs, data.timeline.title)}`
        : `Restored continuity anchors from the blackboard: ${firstBlackboardOutputText(continuityOutputs, data.timeline.title)}.`,
      outputs: continuityOutputs,
    }),
    buildBlackboardSubagentContribution({
      data,
      role: 'prompt-engineer-agent',
      agentId: 'prompt-engineer-agent',
      title: zh ? '提示词 Agent' : 'Prompt Engineer Agent',
      mission: zh ? '内容来自 blackboard.promptPackage.providerPrompt。' : 'Projected from blackboard.promptPackage.providerPrompt.',
      summary: zh
        ? `从黑板恢复 providerPrompt：${firstBlackboardOutputText(promptOutputs, data.timeline.title)}`
        : `Restored provider prompts from the blackboard: ${firstBlackboardOutputText(promptOutputs, data.timeline.title)}.`,
      outputs: promptOutputs,
    }),
    buildBlackboardSubagentContribution({
      data,
      role: 'sound-agent',
      agentId: 'sound-agent',
      title: zh ? '声音 Agent' : 'Sound Agent',
      mission: zh ? '内容来自 blackboard.soundPlan。' : 'Projected from blackboard.soundPlan.',
      summary: zh
        ? `从黑板恢复非阻塞声音计划：${firstBlackboardOutputText(soundOutputs, data.timeline.title)}`
        : `Restored non-blocking sound plans from the blackboard: ${firstBlackboardOutputText(soundOutputs, data.timeline.title)}.`,
      outputs: soundOutputs,
    }),
  ]

  return {
    director,
    subagents,
    synthesis: zh
      ? `agentCrew 是 blackboard 的 UI 兼容投影；真实源为 ${String(blackboard.segmentBlackboards.length)} 个 Segment Blackboard。`
      : `agentCrew is a UI compatibility projection of the blackboard; the source of truth is ${String(blackboard.segmentBlackboards.length)} Segment Blackboards.`,
  }
}

function ensureAgentCrew(data: EditTimelinePartData): EditTimelinePartData {
  if (data.agentCrew) return data
  const blackboard = data.blackboard ?? data.workflow?.blackboard
  const agentCrew = blackboard
    ? deriveAgentCrewFromBlackboard(data, blackboard)
    : deriveAgentCrewFromTimeline(data)
  if (!agentCrew) return data
  return {
    ...data,
    agentCrew,
    risks: agentCrew.subagents.some((agent) => agent.status === 'needs-review')
      ? [
          ...data.risks,
          {
            code: 'EDIT_TIMELINE_AGENT_CREW_COVERAGE_NEEDS_REVIEW',
            message: 'The saved timeline was missing agentCrew and derived coverage has gaps.',
          },
        ]
      : data.risks,
  }
}

export function isWorkspaceEditTimelinePartData(value: unknown): value is EditTimelinePartData {
  if (!isRecord(value)) return false
  return (
    isParsedTimeline(value.timeline)
    && Array.isArray(value.unresolvedRefs)
    && Array.isArray(value.risks)
    && typeof value.estimatedTaskCount === 'number'
  )
}

export function extractLatestWorkspaceEditTimelineFromMessages(
  messages: readonly UIMessage[],
): EditTimelinePartData | null {
  let timelineData: EditTimelinePartData | null = null
  for (let messageIndex = 0; messageIndex < messages.length; messageIndex += 1) {
    const message = messages[messageIndex]
    const parts = Array.isArray(message.parts) ? message.parts : []
    for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
      const part: unknown = parts[partIndex]
      if (!isRecord(part) || part.type !== EDIT_TIMELINE_PART_TYPE) continue
      if (isWorkspaceEditTimelinePartData(part.data)) {
        timelineData = mergeWorkspaceEditTimelinePart(timelineData, ensureAgentCrew(part.data))
      }
    }
  }
  return timelineData
}
