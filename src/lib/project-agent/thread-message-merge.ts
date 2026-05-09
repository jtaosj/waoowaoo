import type { UIMessage } from 'ai'

interface MergeProjectAssistantThreadMessagesInput {
  readonly persistedMessages: readonly UIMessage[]
  readonly incomingMessages: readonly UIMessage[]
}

type UIMessagePart = UIMessage['parts'][number]

function messageId(message: UIMessage): string {
  return message.id.trim()
}

function readPartState(part: UIMessagePart): string | null {
  if (!('state' in part)) return null
  return typeof part.state === 'string' ? part.state : null
}

function isIncompleteAssistantMessage(message: UIMessage): boolean {
  if (message.role !== 'assistant') return false
  return message.parts.some((part) => {
    const state = readPartState(part)
    return state === 'streaming' || state === 'input-streaming' || state === 'input-available'
  })
}

function sanitizeMessages(messages: readonly UIMessage[]): UIMessage[] {
  return messages.filter((message) => !isIncompleteAssistantMessage(message))
}

export function mergeProjectAssistantThreadMessages(
  input: MergeProjectAssistantThreadMessagesInput,
): UIMessage[] {
  const persistedMessages = sanitizeMessages(input.persistedMessages)
  const incomingMessages = sanitizeMessages(input.incomingMessages)
  if (persistedMessages.length === 0) return incomingMessages
  if (incomingMessages.length === 0) return persistedMessages

  const incomingIds = new Set(incomingMessages.map((message) => messageId(message)))
  const persistedPrefix = persistedMessages.filter((message) => !incomingIds.has(messageId(message)))
  return [
    ...persistedPrefix,
    ...incomingMessages,
  ]
}
