import { describe, expect, it } from 'vitest'
import type { UIMessage } from 'ai'
import { mergeProjectAssistantThreadMessages } from '@/lib/project-agent/thread-message-merge'

describe('mergeProjectAssistantThreadMessages', () => {
  it('prepends persisted workspace context before a short incoming confirmation', () => {
    const persistedMessages: UIMessage[] = [
      {
        id: 'assistant-edit-timeline',
        role: 'assistant',
        parts: [
          {
            type: 'data-edit-timeline',
            data: { timeline: { id: 'timeline-1' } },
          },
        ],
      },
    ]
    const incomingMessages: UIMessage[] = [
      {
        id: 'user-confirm',
        role: 'user',
        parts: [{ type: 'text', text: '生成视频' }],
      },
    ]

    expect(mergeProjectAssistantThreadMessages({ persistedMessages, incomingMessages })).toEqual([
      persistedMessages[0],
      incomingMessages[0],
    ])
  })

  it('does not duplicate persisted messages that the client already sent', () => {
    const sharedAssistantMessage: UIMessage = {
      id: 'assistant-edit-timeline',
      role: 'assistant',
      parts: [{ type: 'text', text: '已生成时间线' }],
    }
    const incomingUserMessage: UIMessage = {
      id: 'user-confirm',
      role: 'user',
      parts: [{ type: 'text', text: '提交生成视频' }],
    }

    expect(mergeProjectAssistantThreadMessages({
      persistedMessages: [sharedAssistantMessage],
      incomingMessages: [sharedAssistantMessage, incomingUserMessage],
    })).toEqual([sharedAssistantMessage, incomingUserMessage])
  })

  it('removes incomplete persisted assistant tool calls before appending a new user request', () => {
    const stuckAssistantMessage: UIMessage = {
      id: 'assistant-stuck',
      role: 'assistant',
      parts: [
        { type: 'text', text: '', state: 'done' },
        {
          type: 'tool-invoke_operation',
          toolCallId: 'tool-call-1',
          state: 'input-streaming',
          input: '{"operationId":"validate_edit_timeline"',
        },
      ],
    }
    const incomingUserMessage: UIMessage = {
      id: 'user-new-story',
      role: 'user',
      parts: [{ type: 'text', text: 'A janitor follows a paper crane through an empty subway.' }],
    }

    expect(mergeProjectAssistantThreadMessages({
      persistedMessages: [stuckAssistantMessage],
      incomingMessages: [incomingUserMessage],
    })).toEqual([incomingUserMessage])
  })

  it('removes incomplete incoming assistant tool calls before keeping the fresh user request', () => {
    const completedPlanMessage: UIMessage = {
      id: 'assistant-plan',
      role: 'assistant',
      parts: [{ type: 'text', text: '已生成剪辑先行时间线。' }],
    }
    const staleIncomingAssistantMessage: UIMessage = {
      id: 'assistant-stale-incoming',
      role: 'assistant',
      parts: [
        {
          type: 'tool-invoke_operation',
          toolCallId: 'tool-call-stale',
          state: 'input-available',
          input: {
            operationId: 'validate_edit_timeline',
          },
        },
      ],
    }
    const freshUserMessage: UIMessage = {
      id: 'user-fresh-story',
      role: 'user',
      parts: [{ type: 'text', text: 'A florist follows a blue moth into a closed train station.' }],
    }

    expect(mergeProjectAssistantThreadMessages({
      persistedMessages: [completedPlanMessage],
      incomingMessages: [staleIncomingAssistantMessage, freshUserMessage],
    })).toEqual([completedPlanMessage, freshUserMessage])
  })
})
