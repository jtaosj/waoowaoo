'use client'

import type { UIMessage } from 'ai'
import type {
  ConfirmationRequestPartData,
} from '@/lib/project-agent/types'

export interface PendingConfirmationAction {
  messageId: string
  actionKey: string
  operationId: string
  data: ConfirmationRequestPartData
}

function isConfirmationRequestPart(
  part: unknown,
): part is { type: 'data-confirmation-request'; data: ConfirmationRequestPartData } {
  if (!part || typeof part !== 'object' || Array.isArray(part)) return false
  const record = part as Record<string, unknown>
  if (record.type !== 'data-confirmation-request') return false
  if (!record.data || typeof record.data !== 'object' || Array.isArray(record.data)) return false
  const data = record.data as Record<string, unknown>
  return typeof data.operationId === 'string' && typeof data.summary === 'string'
}

export function collectPendingConfirmationActions(messages: UIMessage[]): PendingConfirmationAction[] {
  const actions: PendingConfirmationAction[] = []

  for (const message of messages) {
    for (const part of message.parts) {
      if (!isConfirmationRequestPart(part)) continue
      actions.push({
        messageId: message.id,
        actionKey: buildConfirmationActionKey(message.id, part.data.operationId),
        operationId: part.data.operationId,
        data: part.data,
      })
    }
  }

  return actions
}

export function buildConfirmationActionKey(messageId: string, operationId: string): string {
  return `confirm:${encodeURIComponent(messageId)}:${encodeURIComponent(operationId)}`
}

export function removeConfirmationRequestFromMessages(
  messages: UIMessage[],
  target: string | {
    operationId: string
    messageId?: string | null
  },
): UIMessage[] {
  const operationId = typeof target === 'string' ? target : target.operationId
  const messageId = typeof target === 'string' ? null : target.messageId ?? null
  return messages.flatMap((message) => {
    const nextParts = message.parts.filter((part) => (
      !isConfirmationRequestPart(part)
      || part.data.operationId !== operationId
      || (messageId !== null && message.id !== messageId)
    ))
    if (nextParts.length === 0) return []
    return [{ ...message, parts: nextParts }]
  })
}
