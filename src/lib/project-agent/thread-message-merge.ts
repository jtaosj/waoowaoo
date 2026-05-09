import type { UIMessage } from 'ai'
import {
  mergeProjectAssistantMessageVersions,
  sanitizeProjectAssistantMessages,
} from '@/lib/project-agent/ui-message-sanitize'

interface MergeProjectAssistantThreadMessagesInput {
  readonly persistedMessages: readonly UIMessage[]
  readonly incomingMessages: readonly UIMessage[]
}

function messageId(message: UIMessage): string {
  return message.id.trim()
}

export function mergeProjectAssistantThreadMessages(
  input: MergeProjectAssistantThreadMessagesInput,
): UIMessage[] {
  const persistedMessages = sanitizeProjectAssistantMessages(input.persistedMessages)
  const incomingMessages = sanitizeProjectAssistantMessages(input.incomingMessages)
  if (persistedMessages.length === 0) return incomingMessages
  if (incomingMessages.length === 0) return persistedMessages

  const merged = new Map<string, UIMessage>()
  for (const message of persistedMessages) {
    merged.set(messageId(message), message)
  }
  for (const message of incomingMessages) {
    const id = messageId(message)
    const current = merged.get(id)
    const next = current ? mergeProjectAssistantMessageVersions(current, message) : message
    if (next) merged.set(id, next)
  }

  return Array.from(merged.values())
}
