import type { UIMessage } from 'ai'

type UIMessagePart = UIMessage['parts'][number]

type UnknownRecord = { [key: string]: unknown }

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readPartState(part: UIMessagePart): string | null {
  if (!('state' in part)) return null
  return typeof part.state === 'string' ? part.state : null
}

function readPartText(part: UIMessagePart): string | null {
  if (!isRecord(part)) return null
  if (part.type !== 'text') return null
  return typeof part.text === 'string' ? part.text : null
}

function isIncompleteAssistantPart(part: UIMessagePart): boolean {
  const state = readPartState(part)
  return state === 'streaming' || state === 'input-streaming' || state === 'input-available'
}

function isMeaningfulAssistantPart(part: UIMessagePart): boolean {
  const text = readPartText(part)
  if (text !== null) return text.trim().length > 0
  return true
}

function readPartType(part: UIMessagePart): string {
  return typeof part.type === 'string' ? part.type : 'unknown'
}

function readToolCallId(part: UIMessagePart): string | null {
  if (!isRecord(part)) return null
  const record: UnknownRecord = part
  const toolCallId = record.toolCallId
  return typeof toolCallId === 'string' && toolCallId.trim()
    ? toolCallId.trim()
    : null
}

function stringifyForKey(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function partMergeKey(part: UIMessagePart): string {
  const type = readPartType(part)
  if (type.startsWith('data-')) return type

  const toolCallId = readToolCallId(part)
  if (toolCallId) return `${type}:${toolCallId}`

  const text = readPartText(part)
  if (text !== null) return `${type}:${text}`

  return `${type}:${stringifyForKey(part)}`
}

function partRichnessScore(part: UIMessagePart): number {
  const type = readPartType(part)
  const serialized = stringifyForKey(part)
  const dataBonus = type.startsWith('data-') ? 10_000 : 0
  const textBonus = readPartText(part)?.trim().length ?? 0
  return dataBonus + serialized.length + textBonus
}

export function sanitizeProjectAssistantMessage(message: UIMessage): UIMessage | null {
  if (message.role !== 'assistant') return message

  const parts = message.parts
    .filter((part) => !isIncompleteAssistantPart(part))
    .filter(isMeaningfulAssistantPart)

  if (parts.length === 0) return null
  if (parts.length === message.parts.length) return message

  return {
    ...message,
    parts,
  }
}

export function sanitizeProjectAssistantMessages(messages: readonly UIMessage[]): UIMessage[] {
  const sanitizedMessages: UIMessage[] = []
  for (const message of messages) {
    const sanitizedMessage = sanitizeProjectAssistantMessage(message)
    if (sanitizedMessage) sanitizedMessages.push(sanitizedMessage)
  }
  return sanitizedMessages
}

export function mergeProjectAssistantMessageVersions(
  current: UIMessage,
  incoming: UIMessage,
): UIMessage | null {
  const sanitizedCurrent = sanitizeProjectAssistantMessage(current)
  const sanitizedIncoming = sanitizeProjectAssistantMessage(incoming)
  if (!sanitizedCurrent) return sanitizedIncoming
  if (!sanitizedIncoming) return sanitizedCurrent
  if (sanitizedCurrent.id !== sanitizedIncoming.id) return sanitizedIncoming

  const mergedParts = new Map<string, UIMessagePart>()
  for (const part of sanitizedCurrent.parts) {
    mergedParts.set(partMergeKey(part), part)
  }
  for (const part of sanitizedIncoming.parts) {
    const key = partMergeKey(part)
    const existing = mergedParts.get(key)
    if (!existing || partRichnessScore(part) > partRichnessScore(existing)) {
      mergedParts.set(key, part)
    }
  }

  return {
    ...sanitizedCurrent,
    ...sanitizedIncoming,
    parts: Array.from(mergedParts.values()),
  }
}
