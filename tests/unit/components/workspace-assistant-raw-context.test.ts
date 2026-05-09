import { describe, expect, it } from 'vitest'
import type { UIMessage } from 'ai'
import {
  buildWorkspaceAssistantRawContextStorageKey,
  buildWorkspaceAssistantRequestMessages,
  buildWorkspaceAssistantSendRequestBody,
  extractWorkspaceAssistantRuntimeContexts,
  mergeWorkspaceAssistantRawMessages,
  serializeWorkspaceAssistantDialogue,
  serializeWorkspaceAssistantRawContext,
} from '@/features/project-workspace/components/workspace-assistant/assistant-raw-context'

function buildMessage(params: {
  id: string
  role: UIMessage['role']
  text: string
  summary?: boolean
}): UIMessage {
  return {
    id: params.id,
    role: params.role,
    ...(params.summary
      ? {
          metadata: {
            custom: {
              projectAgentConversationSummary: true,
            },
          },
        }
      : {}),
    parts: [{ type: 'text', text: params.text }],
  }
}

describe('workspace assistant raw context helpers', () => {
  it('uses a project and episode scoped local storage key', () => {
    expect(buildWorkspaceAssistantRawContextStorageKey({
      projectId: 'project-1',
      episodeId: 'episode-1',
    })).toBe('workspace-assistant:raw-context:project-1:episode-1')
    expect(buildWorkspaceAssistantRawContextStorageKey({
      projectId: 'project-1',
    })).toBe('workspace-assistant:raw-context:project-1:global')
  })

  it('keeps existing raw messages instead of replacing them with compressed summaries', () => {
    const current = [
      buildMessage({ id: 'user-1', role: 'user', text: 'first raw turn' }),
      buildMessage({ id: 'assistant-1', role: 'assistant', text: 'first raw answer' }),
    ]
    const incoming = [
      buildMessage({ id: 'summary-1', role: 'system', text: 'compressed old turns', summary: true }),
      buildMessage({ id: 'user-2', role: 'user', text: 'latest raw turn' }),
    ]

    const merged = mergeWorkspaceAssistantRawMessages({ current, incoming })

    expect(merged.map((message) => message.id)).toEqual(['user-1', 'assistant-1', 'user-2'])
  })

  it('keeps raw edit-first data parts when sending a short generation confirmation', () => {
    const editTimelineMessage: UIMessage = {
      id: 'assistant-edit-timeline',
      role: 'assistant',
      parts: [
        {
          type: 'data-edit-timeline',
          data: {
            operationId: 'create_edit_timeline_plan',
            timeline: {
              title: 'Generic timeline',
              aspectRatio: '9:16',
              segments: [],
              shots: [{ id: 'shot-1', title: 'Opening', durationSec: 3 }],
              references: [],
              metadata: {},
            },
            agentCrew: {
              director: {
                agentId: 'main-director',
                role: 'main-director',
                title: 'Project Agent',
                mission: 'Plan the creative task.',
                summary: 'Ready to compile generation tasks.',
                shotIds: ['shot-1'],
                outputs: [],
                status: 'drafted',
              },
              subagents: [],
              synthesis: 'Compile confirmed timeline into provider work.',
            },
            unresolvedRefs: [],
            risks: [],
            estimatedTaskCount: 1,
          },
        },
      ],
    }
    const outgoingMessages = [
      buildMessage({ id: 'user-confirm', role: 'user', text: '生成视频' }),
    ]

    const merged = buildWorkspaceAssistantRequestMessages({
      rawContextMessages: [editTimelineMessage],
      outgoingMessages,
    })

    expect(merged.map((message) => message.id)).toEqual(['assistant-edit-timeline', 'user-confirm'])
    expect(merged[0]?.parts[0]?.type).toBe('data-edit-timeline')
  })

  it('builds assistant send requests with explicit context and raw edit-first timeline messages', () => {
    const editTimelineMessage: UIMessage = {
      id: 'assistant-edit-timeline',
      role: 'assistant',
      parts: [
        {
          type: 'data-edit-timeline',
          data: {
            operationId: 'create_edit_timeline_plan',
            timeline: {
              id: 'timeline-1',
              title: 'Generic timeline',
              aspectRatio: '9:16',
              fps: 24,
              segments: [],
              shots: [],
              references: [],
              continuityBible: {},
            },
            unresolvedRefs: [],
            risks: [],
            estimatedTaskCount: 1,
          },
        },
      ],
    }
    const outgoingMessages = [
      buildMessage({ id: 'user-confirm', role: 'user', text: '生成视频' }),
    ]

    const body = buildWorkspaceAssistantSendRequestBody({
      baseBody: { context: { stale: true } },
      context: {
        locale: 'zh',
        projectId: 'project-1',
        episodeId: 'episode-1',
        interactionMode: 'auto',
      },
      id: 'chat-1',
      rawContextMessages: [editTimelineMessage],
      outgoingMessages,
      trigger: 'submit-message',
      messageId: 'user-confirm',
      metadata: { source: 'test' },
    })

    expect(body.context).toEqual({
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      interactionMode: 'auto',
    })
    expect(body.episodeId).toBe('episode-1')
    expect(body.messages).toEqual([editTimelineMessage, outgoingMessages[0]])
    expect(body.trigger).toBe('submit-message')
    expect(body.messageId).toBe('user-confirm')
    expect(body.metadata).toEqual({ source: 'test' })
  })

  it('serializes raw messages as readable JSON for the debug window', () => {
    const serialized = serializeWorkspaceAssistantRawContext([
      buildMessage({ id: 'user-1', role: 'user', text: '检查上下文' }),
    ])

    expect(serialized).toContain('"id": "user-1"')
    expect(serialized).toContain('"text": "检查上下文"')
  })

  it('serializes plain user and assistant dialogue text by turn', () => {
    const text = serializeWorkspaceAssistantDialogue([
      buildMessage({ id: 'user-1', role: 'user', text: '写第一幕' }),
      buildMessage({ id: 'assistant-1', role: 'assistant', text: '好的，这是第一幕。' }),
    ])

    expect(text).toContain('#1 USER')
    expect(text).toContain('写第一幕')
    expect(text).toContain('#2 ASSISTANT')
    expect(text).toContain('好的，这是第一幕。')
  })

  it('extracts actual model runtime context data parts from messages', () => {
    const messages: UIMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [
          {
            type: 'data-agent-runtime-context',
            data: {
              requestId: 'req-1',
              modelKey: 'llm::mock',
              locale: 'zh',
              projectId: 'project-1',
              interactionMode: 'auto',
              systemPrompt: 'system text',
              rawMessages: [],
              runtimeMessages: [],
              modelMessages: [{ role: 'user', content: 'hello' }],
              projectContext: {},
              projectPhase: {},
              route: {},
              selectedTools: [{ operationId: 'get_project_phase', description: 'Get phase' }],
            },
          },
        ],
      },
    ]

    expect(extractWorkspaceAssistantRuntimeContexts(messages)).toEqual([
      expect.objectContaining({
        requestId: 'req-1',
        systemPrompt: 'system text',
        selectedTools: [{ operationId: 'get_project_phase', description: 'Get phase' }],
      }),
    ])
  })
})
