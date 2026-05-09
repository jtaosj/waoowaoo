import { generateObject, type LanguageModel, type UIMessage } from 'ai'
import { z } from 'zod'
import type { ProjectPhaseSnapshot } from './project-phase'
import type { ProjectAgentContext } from './types'
import { normalizeProjectAgentLocale, type ProjectAgentLocale } from './locale'

type UnknownObject = { [key: string]: unknown }

export type ProjectAgentIntent = 'query' | 'plan' | 'act'

export type ProjectAgentDomain =
  | 'project'
  | 'skill'
  | 'run'
  | 'task'
  | 'storyboard'
  | 'asset'
  | 'asset-hub'
  | 'voice'
  | 'config'
  | 'billing'
  | 'governance'
  | 'download'
  | 'debug'
  | 'unknown'

export interface ProjectAgentRouteDecision {
  intent: ProjectAgentIntent
  domains: ProjectAgentDomain[]
  requestedGroups: string[][]
  needsClarification: boolean
  clarifyingQuestion: string | null
  reasoning: string[]
  latestUserText: string
}

const routerSchema = z.object({
  intent: z.enum(['query', 'plan', 'act']),
  domains: z.array(z.enum([
    'project',
    'skill',
    'run',
    'task',
    'storyboard',
    'asset',
    'asset-hub',
    'voice',
    'config',
    'billing',
    'governance',
    'download',
    'debug',
    'unknown',
  ])).min(1),
  requestedGroups: z.array(z.array(z.string().min(1)).min(1)).max(8),
  needsClarification: z.boolean(),
  clarifyingQuestion: z.string().nullable(),
  reasoning: z.array(z.string()).max(8),
})

function serializeGroupPath(groupPath: string[]): string {
  return groupPath.join('/')
}

function normalizeGroupPath(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const trimmed = raw
    .map((segment) => (typeof segment === 'string' ? segment.trim() : ''))
    .filter(Boolean)
  return trimmed.length > 0 ? trimmed : null
}

function filterRequestedGroups(params: {
  requestedGroups: unknown
  allowedRequestedGroups: string[][]
  reasoning: string[]
}): string[][] {
  const allowedSet = new Set<string>(
    params.allowedRequestedGroups.map((groupPath) => serializeGroupPath(groupPath)),
  )
  const requested = Array.isArray(params.requestedGroups) ? params.requestedGroups : []

  const output: string[][] = []
  const seen = new Set<string>()
  let dropped = 0

  for (const item of requested) {
    const normalized = normalizeGroupPath(item)
    if (!normalized) {
      dropped += 1
      continue
    }
    const key = serializeGroupPath(normalized)
    if (!allowedSet.has(key)) {
      dropped += 1
      continue
    }
    if (seen.has(key)) continue
    seen.add(key)
    output.push(normalized)
  }

  if (dropped > 0) {
    params.reasoning.push(`router:requestedGroups_dropped=${String(dropped)}`)
  }

  return output
}

function isRecord(value: unknown): value is UnknownObject {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function extractLatestUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message.role !== 'user') continue
    const chunks: string[] = []
    for (const part of message.parts) {
      if (!isRecord(part)) continue
      if (part.type !== 'text') continue
      if (typeof part.text !== 'string') continue
      const trimmed = part.text.trim()
      if (trimmed) chunks.push(trimmed)
    }
    const joined = chunks.join('\n').trim()
    if (joined) return joined
  }
  return ''
}

function extractConversationExcerpt(messages: UIMessage[]): string {
  return messages
    .slice(-8)
    .map((message) => {
      const parts = message.parts
        .map((part) => {
          if (!isRecord(part)) return ''
          if (part.type === 'text' && typeof part.text === 'string') return part.text.trim()
          return ''
        })
        .filter(Boolean)
      if (parts.length === 0) return null
      return `${message.role.toUpperCase()}: ${parts.join(' ')}`
    })
    .filter((value): value is string => Boolean(value))
    .join('\n')
}

const EDIT_FIRST_ROUTE_MARKERS = [
  'edit-first-video-director',
  'create_edit_timeline_plan',
  'validate_edit_timeline',
  'compile_edit_timeline',
  'start_edit_timeline_video_run',
  'score_edit_timeline_trace',
  'redo_timeline_shot',
  'edittimeline',
  'edit timeline',
  '剪辑先行',
  '剪辑时间线',
  '时间线剪辑',
] as const

const NATURAL_STORY_VIDEO_PRODUCTION_MARKERS = [
  '生成',
  '生产',
  '做',
  '帮我生成',
  '生成一段',
  '生成一个',
  '做一段',
  '做一个',
  '做成',
  '拍成',
  '拍出来',
  '拍一段',
  '拍一个',
  '剪成',
  '剪一段',
  '剪一个',
  '出一个',
  '出一段',
  '制作',
  '创作',
  '输出',
  '变成',
  'create',
  'generate',
  'make',
  'produce',
  'turn into',
  'film',
  'shoot',
] as const

const NATURAL_STORY_VIDEO_OUTPUT_MARKERS = [
  '竖屏短片',
  '影片',
  '片子',
  '电影',
  '短动画',
  '短剧',
  '动画',
  '视频',
  '短片',
  '镜头',
  '画面',
  '分镜',
  'short animation',
  'short drama',
  'short film',
  'animation',
  'video',
  'clip',
] as const

const NATURAL_STORY_CONTENT_MARKERS = [
  '故事',
  '剧情',
  '主角',
  '人物',
  '他',
  '她',
  '男人',
  '女人',
  '老人',
  '孩子',
  '女子',
  '高中生',
  '学生',
  '男孩',
  '女孩',
  '清洁工',
  '雨夜',
  '便利店',
  '地铁',
  '末班车',
  '车厢',
  '窗外',
  '门口',
  '怀表',
  '相机',
  '捡到',
  '照片',
  '发现',
  '看见',
  '抬头',
  '突然',
  '却',
  '未来',
  '年轻时',
  '十分钟后',
  '悬疑',
  '反转',
  'story',
  'plot',
  'character',
  'protagonist',
  'discovers',
  'finds',
  'sees',
  'future',
  'twist',
] as const

const EDIT_FIRST_CREATIVE_PLANNING_MARKERS = [
  '计划',
  '设计',
  '规划',
  '草案',
  '方案',
  '想法',
  '先帮我',
  '给我一个',
  '帮我想',
  'plan',
  'design',
  'draft',
  'outline',
] as const

const EDIT_FIRST_CREATIVE_STYLE_MARKERS = [
  '风格',
  '恐怖',
  '悬疑',
  '喜剧',
  '科幻',
  '电影感',
  '希区柯克',
  '赛博',
  ' noir',
  'cinematic',
  'horror',
  'suspense',
  'thriller',
  'comedy',
  'sci-fi',
] as const

const NON_EDIT_FIRST_OPERATIONAL_MARKERS = [
  '为什么失败',
  '失败了',
  '报错',
  '错误',
  '任务状态',
  '任务进度',
  '生成状态',
  '下载',
  '配置',
  '账单',
  '花费',
  '多少钱',
  '余额',
  '额度',
  '登录',
  '开通',
  'api key',
  'failed',
  'failure',
  'error',
  'status',
  'progress',
  'download',
  'config',
  'billing',
  'quota',
  'login',
] as const

const EDIT_FIRST_VIDEO_CONTINUATION_MARKERS = [
  '生成视频',
  '生成视屏',
  '生产视频',
  '生产视屏',
  '做视频',
  '做成视频',
  '生成影片',
  '执行生成',
  '开始生成',
  '提交生成',
  '确认生成',
  '生成真实视频',
  '全量生成',
  '生成全部',
  '生成所有镜头',
  '提交任务',
  '执行任务',
  'generate video',
  'start generation',
  'submit generation',
  'execute generation',
  'run generation',
  'generate all shots',
  'render video',
] as const

const EDIT_FIRST_CONTEXT_DATA_PART_TYPES = [
  'data-edit-timeline',
] as const

const EDIT_FIRST_CONTEXT_TEXT_MARKERS = [
  ...EDIT_FIRST_ROUTE_MARKERS,
  'agentcrew',
  'agent crew',
  'confirmation summary',
  '确认摘要',
  '预计执行任务数',
  'provider task',
  'provider 任务',
] as const

function includesAnyMarkerOrCompact(text: string, markers: readonly string[]): boolean {
  const normalized = text.toLowerCase()
  const compact = normalized.replace(/[\s_-]+/g, '')
  return markers.some((marker) => {
    const normalizedMarker = marker.toLowerCase()
    return normalized.includes(normalizedMarker) || compact.includes(normalizedMarker.replace(/[\s_-]+/g, ''))
  })
}

function isExplicitEditFirstTimelineRequest(latestUserText: string): boolean {
  return includesAnyMarkerOrCompact(latestUserText, EDIT_FIRST_ROUTE_MARKERS)
}

function includesAnyMarker(text: string, markers: readonly string[]): boolean {
  return markers.some((marker) => text.includes(marker.toLowerCase()))
}

function countMarkers(text: string, markers: readonly string[]): number {
  let count = 0
  for (const marker of markers) {
    if (text.includes(marker.toLowerCase())) count += 1
  }
  return count
}

function countNarrativeBoundaries(text: string): number {
  const matches = text.match(/[.!?。！？；;，,]/g)
  return matches?.length ?? 0
}

function isNaturalStoryVideoGenerationRequest(latestUserText: string): boolean {
  const normalized = latestUserText.toLowerCase()
  const hasProductionIntent = includesAnyMarker(normalized, NATURAL_STORY_VIDEO_PRODUCTION_MARKERS)
  const hasVideoOutputIntent = includesAnyMarker(normalized, NATURAL_STORY_VIDEO_OUTPUT_MARKERS)
  const storySignalCount = countMarkers(normalized, NATURAL_STORY_CONTENT_MARKERS)
  if (hasProductionIntent && hasVideoOutputIntent && storySignalCount >= 2) return true

  const compactLength = normalized.replace(/\s+/g, '').length
  const narrativeBoundaryCount = countNarrativeBoundaries(normalized)
  return compactLength >= 45 && narrativeBoundaryCount >= 3 && storySignalCount >= 4
}

function isForcedEditFirstCreativeDefaultRequest(latestUserText: string): boolean {
  const normalized = latestUserText.toLowerCase()
  if (includesAnyMarkerOrCompact(normalized, NON_EDIT_FIRST_OPERATIONAL_MARKERS)) return false

  const hasVideoOutputIntent = includesAnyMarker(normalized, NATURAL_STORY_VIDEO_OUTPUT_MARKERS)
  if (!hasVideoOutputIntent) return false

  const hasProductionIntent = includesAnyMarker(normalized, NATURAL_STORY_VIDEO_PRODUCTION_MARKERS)
  const hasPlanningIntent = includesAnyMarkerOrCompact(normalized, EDIT_FIRST_CREATIVE_PLANNING_MARKERS)
  const hasCreativeStyleIntent = includesAnyMarker(normalized, EDIT_FIRST_CREATIVE_STYLE_MARKERS)
  const storySignalCount = countMarkers(normalized, NATURAL_STORY_CONTENT_MARKERS)

  return hasProductionIntent || hasPlanningIntent || hasCreativeStyleIntent || storySignalCount > 0
}

function hasEditFirstTimelineContext(messages: UIMessage[]): boolean {
  return messages.slice(-8).some((message) => {
    return message.parts.some((part) => {
      if (!isRecord(part)) return false
      if (
        typeof part.type === 'string'
        && EDIT_FIRST_CONTEXT_DATA_PART_TYPES.some((type) => type === part.type)
      ) {
        return true
      }
      if (part.type !== 'text' || typeof part.text !== 'string') return false
      return includesAnyMarkerOrCompact(part.text, EDIT_FIRST_CONTEXT_TEXT_MARKERS)
    })
  })
}

function isEditFirstVideoContinuationRequest(latestUserText: string, messages: UIMessage[]): boolean {
  if (!hasEditFirstTimelineContext(messages)) return false
  return includesAnyMarkerOrCompact(latestUserText, EDIT_FIRST_VIDEO_CONTINUATION_MARKERS)
}

function buildDeterministicEditFirstRoute(params: {
  latestUserText: string
  allowedRequestedGroups: string[][]
  intent: ProjectAgentIntent
  reasoningTag: string
}): ProjectAgentRouteDecision {
  const reasoning = [params.reasoningTag]
  const requestedGroups = filterRequestedGroups({
    requestedGroups: [['skill']],
    allowedRequestedGroups: params.allowedRequestedGroups,
    reasoning,
  })

  return {
    intent: params.intent,
    domains: ['skill'],
    requestedGroups,
    needsClarification: false,
    clarifyingQuestion: null,
    reasoning,
    latestUserText: params.latestUserText,
  }
}

function buildPhaseSummary(phase: ProjectPhaseSnapshot): string {
  return [
    `phase=${phase.phase}`,
    `activePlanRuns=${String(phase.activePlanRunCount)}`,
    `failedItems=${phase.failedItems.join(';') || '-'}`,
    `staleArtifacts=${phase.staleArtifacts.join(';') || '-'}`,
    `actions.plan=${phase.availableActions.planMode.join(',') || '-'}`,
    `actions.act=${phase.availableActions.actMode.join(',') || '-'}`,
  ].join('\n')
}

function buildRouterPrompt(params: {
  locale: ProjectAgentLocale
  latestUserText: string
  conversationExcerpt: string
  phaseSummary: string
  context: ProjectAgentContext
  allowedRequestedGroups: string[][]
}): { system: string; prompt: string } {
  const episodeId = params.context.episodeId || 'none'
  const stage = params.context.currentStage || 'unknown'
  const interactionMode = params.context.interactionMode || 'auto'

  const groupList = JSON.stringify(params.allowedRequestedGroups)

  if (params.locale === 'en') {
    return {
      system: [
        'You are a strict project assistant router.',
        'Your task is to classify the user turn before the main assistant acts.',
        'If the request is ambiguous, set needsClarification=true and provide one short clarifyingQuestion.',
        'If any tool group might be needed, include it. Prefer recall over aggressive exclusion.',
        'For creative, production, selection, writing, storyboard, media, or multi-step goals, request only the ["skill"] group plus project read context.',
        'Do not request fixed-chain groups; legacy fixed-chain routing is forbidden.',
        'Do not rely on previous rule routing. Output only from the provided schema.',
        'requestedGroups is a list of groupPath arrays, e.g. ["skill"].',
        `Allowed requestedGroups (choose from this list): ${groupList}`,
      ].join('\n'),
      prompt: [
        `episodeId=${episodeId}`,
        `currentStage=${stage}`,
        `interactionMode=${interactionMode}`,
        '',
        'Phase summary:',
        params.phaseSummary,
        '',
        'Recent conversation excerpt:',
        params.conversationExcerpt || 'NONE',
        '',
        'Latest user request:',
        params.latestUserText || 'NONE',
      ].join('\n'),
    }
  }

  return {
    system: [
      '你是一个严格的项目 assistant 路由器。',
      '你的任务是在主 assistant 执行前，对当前用户请求做结构化分类。',
      '如果请求有歧义，必须设置 needsClarification=true，并提供一个简短的 clarifyingQuestion。',
      '如果某个工具 group 可能需要用到，就把它包含进去。宁可高召回，不要激进排除。',
      '对于创作、制作、选择、写作、分镜、媒体生成或多步骤目标，只请求 ["skill"] group 加项目读取上下文。',
      '不要请求固定链路 group；旧固定链路路由已禁止。',
      '禁止依赖旧的规则路由，必须只按 schema 输出。',
      'requestedGroups 是 groupPath 数组列表，例如 ["skill"]。',
      `允许的 requestedGroups（必须从该列表中选择）：${groupList}`,
    ].join('\n'),
    prompt: [
      `episodeId=${episodeId}`,
      `currentStage=${stage}`,
      `interactionMode=${interactionMode}`,
      '',
      '阶段摘要：',
      params.phaseSummary,
      '',
      '最近对话摘录：',
      params.conversationExcerpt || 'NONE',
      '',
      '最新用户请求：',
      params.latestUserText || 'NONE',
    ].join('\n'),
  }
}

export async function routeProjectAgentRequest(input: {
  messages: UIMessage[]
  phase: ProjectPhaseSnapshot
  context: ProjectAgentContext
  model: LanguageModel
  allowedRequestedGroups: string[][]
}): Promise<ProjectAgentRouteDecision> {
  const latestUserText = extractLatestUserText(input.messages)
  if (!latestUserText) {
    return {
      intent: 'query',
      domains: ['unknown'],
      requestedGroups: [],
      needsClarification: true,
      clarifyingQuestion: normalizeProjectAgentLocale(input.context.locale) === 'en'
        ? 'What do you want me to help with in this project?'
        : '你希望我在这个项目里帮你处理什么？',
      reasoning: ['router:empty-user-text'],
      latestUserText,
    }
  }

  if (isExplicitEditFirstTimelineRequest(latestUserText)) {
    return buildDeterministicEditFirstRoute({
      latestUserText,
      allowedRequestedGroups: input.allowedRequestedGroups,
      intent: 'plan',
      reasoningTag: 'router:deterministic-edit-first-video-director',
    })
  }

  if (isNaturalStoryVideoGenerationRequest(latestUserText)) {
    return buildDeterministicEditFirstRoute({
      latestUserText,
      allowedRequestedGroups: input.allowedRequestedGroups,
      intent: 'act',
      reasoningTag: 'router:deterministic-natural-story-video',
    })
  }

  if (isEditFirstVideoContinuationRequest(latestUserText, input.messages)) {
    return buildDeterministicEditFirstRoute({
      latestUserText,
      allowedRequestedGroups: input.allowedRequestedGroups,
      intent: 'act',
      reasoningTag: 'router:deterministic-edit-first-video-continuation',
    })
  }

  if (isForcedEditFirstCreativeDefaultRequest(latestUserText)) {
    return buildDeterministicEditFirstRoute({
      latestUserText,
      allowedRequestedGroups: input.allowedRequestedGroups,
      intent: 'plan',
      reasoningTag: 'router:deterministic-edit-first-creative-default',
    })
  }

  const locale = normalizeProjectAgentLocale(input.context.locale)
  const prompt = buildRouterPrompt({
    locale,
    latestUserText,
    conversationExcerpt: extractConversationExcerpt(input.messages),
    phaseSummary: buildPhaseSummary(input.phase),
    context: input.context,
    allowedRequestedGroups: input.allowedRequestedGroups,
  })

  const result = await generateObject({
    model: input.model,
    schema: routerSchema,
    system: prompt.system,
    prompt: prompt.prompt,
    temperature: 0,
  })

  const object = result.object
  const clarificationRequired = object.needsClarification
  const clarifyingQuestion = clarificationRequired
    ? (object.clarifyingQuestion?.trim()
      || (locale === 'en'
        ? 'Please clarify the exact action or outcome you want.'
        : '请补充你希望我执行的具体动作或目标结果。'))
    : null

  const reasoning = [...object.reasoning]
  const requestedGroups = filterRequestedGroups({
    requestedGroups: object.requestedGroups,
    allowedRequestedGroups: input.allowedRequestedGroups,
    reasoning,
  })

  return {
    intent: object.intent,
    domains: Array.from(new Set(object.domains)),
    requestedGroups,
    needsClarification: clarificationRequired,
    clarifyingQuestion,
    reasoning,
    latestUserText,
  }
}
