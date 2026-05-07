import { describe, expect, it } from 'vitest'
import type { UIMessage } from 'ai'
import {
  buildConfirmationActionKey,
  collectPendingConfirmationActions,
  removeConfirmationRequestFromMessages,
} from '@/features/project-workspace/components/workspace-assistant/approval-state'

function buildMessages(includeDuplicateOperation = false): UIMessage[] {
  return [
    {
      id: 'assistant-1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'plan created' },
      ],
    },
    {
      id: 'assistant-2',
      role: 'assistant',
      parts: [
        {
          type: 'data-confirmation-request',
          data: {
            operationId: 'regenerate_panel_image',
            summary: 'Need confirmation',
            argsHint: {
              panelId: 'panel-1',
              confirmed: true,
            },
          },
        },
      ],
    },
    ...(includeDuplicateOperation
      ? [{
          id: 'assistant-3',
          role: 'assistant' as const,
          parts: [
            {
              type: 'data-confirmation-request' as const,
              data: {
                operationId: 'regenerate_panel_image',
                summary: 'Need confirmation for a different panel',
                argsHint: {
                  panelId: 'panel-2',
                  confirmed: true,
                },
              },
            },
          ],
        }]
      : []),
  ]
}

describe('workspace assistant confirmation state', () => {
  it('collects pending confirmations from persisted messages', () => {
    const confirmations = collectPendingConfirmationActions(buildMessages())

    expect(confirmations).toHaveLength(1)
    expect(confirmations[0]?.operationId).toBe('regenerate_panel_image')
    expect(confirmations[0]?.actionKey).toBe(buildConfirmationActionKey(
      'assistant-2',
      'regenerate_panel_image',
    ))
  })

  it('removes resolved confirmation requests while preserving other messages', () => {
    const nextMessages = removeConfirmationRequestFromMessages(buildMessages(), 'regenerate_panel_image')

    expect(nextMessages).toHaveLength(1)
    expect(nextMessages[0]?.id).toBe('assistant-1')
  })

  it('can remove only the selected confirmation when duplicate operation ids are pending', () => {
    const nextMessages = removeConfirmationRequestFromMessages(buildMessages(true), {
      operationId: 'regenerate_panel_image',
      messageId: 'assistant-3',
    })

    expect(nextMessages.map((message) => message.id)).toEqual(['assistant-1', 'assistant-2'])
    expect(collectPendingConfirmationActions(nextMessages).map((item) => item.messageId)).toEqual(['assistant-2'])
  })
})
