import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UIMessage } from 'ai'
import { PROJECT_PHASE, type ProjectPhaseSnapshot } from '@/lib/project-agent/project-phase'

const aiMock = vi.hoisted(() => ({
  generateObject: vi.fn(),
}))

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    generateObject: aiMock.generateObject,
  }
})

import { routeProjectAgentRequest } from '@/lib/project-agent/router'

function buildPhaseSnapshot(): ProjectPhaseSnapshot {
  return {
    phase: PROJECT_PHASE.STORYBOARD_READY,
    progress: {
      clipCount: 1,
      screenplayClipCount: 1,
      storyboardCount: 1,
      panelCount: 10,
      voiceLineCount: 0,
    },
    activePlanRuns: [],
    activePlanRunCount: 0,
    failedItems: [],
    staleArtifacts: [],
    availableActions: {
      actMode: ['regenerate_panel_image'],
      planMode: [],
    },
  }
}

function buildUserMessage(text: string): UIMessage {
  return {
    id: 'm-user-1',
    role: 'user',
    parts: [{ type: 'text', text }],
  }
}

function buildAssistantMessage(id: string, parts: ReadonlyArray<unknown>): UIMessage {
  return {
    id,
    role: 'assistant',
    parts,
  } as unknown as UIMessage
}

describe('routeProjectAgentRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('[clear storyboard edit request] -> returns categories without clarification', async () => {
    aiMock.generateObject.mockResolvedValueOnce({
      object: {
        intent: 'act',
        domains: ['storyboard', 'asset'],
        requestedGroups: [['storyboard', 'edit'], ['asset', 'character']],
        needsClarification: false,
        clarifyingQuestion: null,
        reasoning: ['user wants to update storyboard text'],
      },
    })

    const route = await routeProjectAgentRequest({
      messages: [buildUserMessage('把角色A的人设应用到第12镜并修改镜头描述。')],
      phase: buildPhaseSnapshot(),
      context: { episodeId: 'ep-1', currentStage: 'storyboard-edit', locale: 'zh' },
      model: {} as never,
      allowedRequestedGroups: [['storyboard', 'edit'], ['asset', 'character'], ['project', 'read']],
    })

    expect(route.intent).toBe('act')
    expect(route.domains).toEqual(['storyboard', 'asset'])
    expect(route.requestedGroups).toEqual([['storyboard', 'edit'], ['asset', 'character']])
    expect(route.needsClarification).toBe(false)
    expect(route.clarifyingQuestion).toBeNull()
  })

  it('[ambiguous output without clarification] -> does not force clarification in router layer', async () => {
    aiMock.generateObject.mockResolvedValueOnce({
      object: {
        intent: 'query',
        domains: ['unknown'],
        requestedGroups: [['project', 'read']],
        needsClarification: false,
        clarifyingQuestion: null,
        reasoning: ['request is vague'],
      },
    })

    const route = await routeProjectAgentRequest({
      messages: [buildUserMessage('帮我处理一下这个项目')],
      phase: buildPhaseSnapshot(),
      context: { currentStage: 'config', locale: 'zh' },
      model: {} as never,
      allowedRequestedGroups: [['project', 'read'], ['skill'], ['storyboard', 'edit']],
    })

    expect(route.needsClarification).toBe(false)
    expect(route.clarifyingQuestion).toBeNull()
  })

  it('[open creative film plan request] -> forces edit-first skill without structured model router', async () => {
    const route = await routeProjectAgentRequest({
      messages: [buildUserMessage('给我一个希区柯克风格的恐怖短片计划。')],
      phase: buildPhaseSnapshot(),
      context: { currentStage: 'concept', locale: 'zh', interactionMode: 'plan' },
      model: {} as never,
      allowedRequestedGroups: [['project', 'read'], ['skill']],
    })

    expect(aiMock.generateObject).not.toHaveBeenCalled()
    expect(route.intent).toBe('plan')
    expect(route.domains).toEqual(['skill'])
    expect(route.requestedGroups).toEqual([['skill']])
    expect(route.reasoning).toContain('router:deterministic-edit-first-creative-default')
  })

  it('[explicit edit-first timeline request] -> routes to skill without structured model router', async () => {
    const route = await routeProjectAgentRequest({
      messages: [buildUserMessage('请加载 edit-first-video-director，然后生成一个 EditTimeline 剪辑时间线。')],
      phase: buildPhaseSnapshot(),
      context: { currentStage: 'storyboard-edit', locale: 'zh', interactionMode: 'plan' },
      model: {} as never,
      allowedRequestedGroups: [['project', 'read'], ['skill']],
    })

    expect(aiMock.generateObject).not.toHaveBeenCalled()
    expect(route.intent).toBe('plan')
    expect(route.domains).toEqual(['skill'])
    expect(route.requestedGroups).toEqual([['skill']])
    expect(route.needsClarification).toBe(false)
    expect(route.reasoning).toContain('router:deterministic-edit-first-video-director')
  })

  it('[natural story video request] -> routes to edit-first skill without requiring explicit keywords', async () => {
    const route = await routeProjectAgentRequest({
      messages: [buildUserMessage('一个刚毕业的女生在深夜办公室加班，情绪低落。她看到屏幕上空白的创作页面，开始输入自己的故事。随着 AI 工具生成画面，她的情绪从疲惫转向兴奋，最后短片完成，屏幕光照亮她的脸。')],
      phase: buildPhaseSnapshot(),
      context: { currentStage: 'storyboard-edit', locale: 'zh', interactionMode: 'auto' },
      model: {} as never,
      allowedRequestedGroups: [['project', 'read'], ['skill']],
    })

    expect(aiMock.generateObject).not.toHaveBeenCalled()
    expect(route.intent).toBe('act')
    expect(route.domains).toEqual(['skill'])
    expect(route.requestedGroups).toEqual([['skill']])
    expect(route.needsClarification).toBe(false)
    expect(route.reasoning).toContain('router:deterministic-natural-story-video')
  })

  it('[standalone narrative story seed] -> routes to edit-first skill without structured schema router', async () => {
    const route = await routeProjectAgentRequest({
      messages: [buildUserMessage('雨夜，一个年轻人走进便利店，发现收银员一直重复同一句话。他低头看手机，发现时间停在凌晨 3:07。货架尽头传来敲玻璃的声音，他转身，看见另一个自己站在门外。')],
      phase: buildPhaseSnapshot(),
      context: { currentStage: 'storyboard-edit', locale: 'zh', interactionMode: 'auto' },
      model: {} as never,
      allowedRequestedGroups: [['project', 'read'], ['skill']],
    })

    expect(aiMock.generateObject).not.toHaveBeenCalled()
    expect(route.intent).toBe('act')
    expect(route.domains).toEqual(['skill'])
    expect(route.requestedGroups).toEqual([['skill']])
    expect(route.needsClarification).toBe(false)
    expect(route.reasoning).toContain('router:deterministic-natural-story-video')
  })

  it('[consumer natural-language film request] -> routes to edit-first without agent or tool names', async () => {
    const route = await routeProjectAgentRequest({
      messages: [buildUserMessage('帮我把下面这个剧情拍成 15 秒竖屏短片：地铁末班车里，清洁工捡到一块还在发烫的旧怀表，窗外站名开始倒退，他抬头看见年轻时的自己站在下一节车厢门口。')],
      phase: buildPhaseSnapshot(),
      context: { currentStage: 'storyboard-edit', locale: 'zh', interactionMode: 'auto' },
      model: {} as never,
      allowedRequestedGroups: [['project', 'read'], ['skill']],
    })

    expect(aiMock.generateObject).not.toHaveBeenCalled()
    expect(route.intent).toBe('act')
    expect(route.domains).toEqual(['skill'])
    expect(route.requestedGroups).toEqual([['skill']])
    expect(route.reasoning).toContain('router:deterministic-natural-story-video')
  })

  it('[edit-first continuation after timeline output] -> routes generate video confirmation without structured model router', async () => {
    const route = await routeProjectAgentRequest({
      messages: [
        buildAssistantMessage('m-assistant-1', [
          { type: 'text', text: '已生成剪辑时间线，确认后可以提交生成视频。' },
          {
            type: 'data-edit-timeline',
            data: {
              timeline: { id: 'timeline-1' },
              agentCrew: { synthesis: 'main director synthesis' },
            },
          },
        ]),
        buildUserMessage('生成视频'),
      ],
      phase: buildPhaseSnapshot(),
      context: { currentStage: 'storyboard-edit', locale: 'zh', interactionMode: 'auto' },
      model: {} as never,
      allowedRequestedGroups: [['project', 'read'], ['skill']],
    })

    expect(aiMock.generateObject).not.toHaveBeenCalled()
    expect(route.intent).toBe('act')
    expect(route.domains).toEqual(['skill'])
    expect(route.requestedGroups).toEqual([['skill']])
    expect(route.needsClarification).toBe(false)
    expect(route.reasoning).toContain('router:deterministic-edit-first-video-continuation')
  })

  it('[edit-first continuation typo variants] -> routes video execution without structured model router', async () => {
    for (const userText of ['生成视屏', '生产视频', '生产视屏']) {
      vi.clearAllMocks()

      const route = await routeProjectAgentRequest({
        messages: [
          buildAssistantMessage('m-assistant-1', [
            { type: 'text', text: '已生成剪辑时间线，确认后可以提交生成视频。' },
            {
              type: 'data-edit-timeline',
              data: {
                timeline: { id: 'timeline-1' },
                agentCrew: { synthesis: 'main director synthesis' },
              },
            },
          ]),
          buildUserMessage(userText),
        ],
        phase: buildPhaseSnapshot(),
        context: { currentStage: 'storyboard-edit', locale: 'zh', interactionMode: 'auto' },
        model: {} as never,
        allowedRequestedGroups: [['project', 'read'], ['skill']],
      })

      expect(aiMock.generateObject).not.toHaveBeenCalled()
      expect(route.intent).toBe('act')
      expect(route.domains).toEqual(['skill'])
      expect(route.requestedGroups).toEqual([['skill']])
      expect(route.reasoning).toContain('router:deterministic-edit-first-video-continuation')
    }
  })

  it('[standalone short generate video request] -> enters edit-first skill even before context exists', async () => {
    const route = await routeProjectAgentRequest({
      messages: [buildUserMessage('生成视频')],
      phase: buildPhaseSnapshot(),
      context: { currentStage: 'storyboard-edit', locale: 'zh', interactionMode: 'auto' },
      model: {} as never,
      allowedRequestedGroups: [['project', 'read'], ['skill']],
    })

    expect(aiMock.generateObject).not.toHaveBeenCalled()
    expect(route.intent).toBe('plan')
    expect(route.domains).toEqual(['skill'])
    expect(route.requestedGroups).toEqual([['skill']])
    expect(route.needsClarification).toBe(false)
    expect(route.reasoning).toContain('router:deterministic-edit-first-creative-default')
  })

  it('[non-creative video status question] -> keeps normal router instead of forcing edit-first production', async () => {
    aiMock.generateObject.mockResolvedValueOnce({
      object: {
        intent: 'query',
        domains: ['task'],
        requestedGroups: [['project', 'read']],
        needsClarification: false,
        clarifyingQuestion: null,
        reasoning: ['user asks about an existing task'],
      },
    })

    const route = await routeProjectAgentRequest({
      messages: [buildUserMessage('这个视频任务为什么失败了？')],
      phase: buildPhaseSnapshot(),
      context: { currentStage: 'storyboard-edit', locale: 'zh', interactionMode: 'auto' },
      model: {} as never,
      allowedRequestedGroups: [['project', 'read'], ['skill']],
    })

    expect(aiMock.generateObject).toHaveBeenCalledTimes(1)
    expect(route.intent).toBe('query')
    expect(route.domains).toEqual(['task'])
    expect(route.requestedGroups).toEqual([['project', 'read']])
  })

  it('[empty user text] -> returns direct clarification without model call', async () => {
    const route = await routeProjectAgentRequest({
      messages: [{
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'hello' }],
      }],
      phase: buildPhaseSnapshot(),
      context: { locale: 'en' },
      model: {} as never,
      allowedRequestedGroups: [['project', 'read']],
    })

    expect(aiMock.generateObject).not.toHaveBeenCalled()
    expect(route.needsClarification).toBe(true)
    expect(route.clarifyingQuestion).toBe('What do you want me to help with in this project?')
  })
})
