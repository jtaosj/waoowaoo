import type { UIMessage } from 'ai'
import type { AgentRuntimeContextPartData } from '@/lib/project-agent/types'
import {
  mergeProjectAssistantMessageVersions,
  sanitizeProjectAssistantMessage,
} from '@/lib/project-agent/ui-message-sanitize'

type UnknownObject = { [key: string]: unknown }

function isRecord(value: unknown): value is UnknownObject {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readCustomMetadata(message: UIMessage): UnknownObject | null {
  const metadata = message.metadata
  if (!isRecord(metadata)) return null
  const custom = metadata.custom
  return isRecord(custom) ? custom : null
}

export function isWorkspaceAssistantSummaryMessage(message: UIMessage): boolean {
  return readCustomMetadata(message)?.projectAgentConversationSummary === true
}

export function buildWorkspaceAssistantRawContextStorageKey(params: {
  projectId: string
  episodeId?: string
}): string {
  return `workspace-assistant:raw-context:${params.projectId}:${params.episodeId || 'global'}`
}

export function mergeWorkspaceAssistantRawMessages(params: {
  current: UIMessage[]
  incoming: UIMessage[]
}): UIMessage[] {
  const merged = new Map<string, UIMessage>()
  for (const message of params.current) {
    const sanitizedMessage = sanitizeProjectAssistantMessage(message)
    if (sanitizedMessage) merged.set(sanitizedMessage.id, sanitizedMessage)
  }

  for (const message of params.incoming) {
    if (isWorkspaceAssistantSummaryMessage(message) && merged.size > 0 && !merged.has(message.id)) {
      continue
    }
    const current = merged.get(message.id)
    const sanitizedMessage = current
      ? mergeProjectAssistantMessageVersions(current, message)
      : sanitizeProjectAssistantMessage(message)
    if (sanitizedMessage) merged.set(sanitizedMessage.id, sanitizedMessage)
  }

  return Array.from(merged.values())
}

export function buildWorkspaceAssistantRequestMessages(params: {
  rawContextMessages: UIMessage[]
  outgoingMessages: UIMessage[]
}): UIMessage[] {
  return mergeWorkspaceAssistantRawMessages({
    current: params.rawContextMessages,
    incoming: params.outgoingMessages,
  })
}

export interface WorkspaceAssistantSendRequestBodyParams {
  baseBody?: unknown
  context: Record<string, unknown>
  id?: unknown
  rawContextMessages: UIMessage[]
  outgoingMessages: UIMessage[]
  trigger?: unknown
  messageId?: unknown
  metadata?: unknown
}

function normalizeBaseBody(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function readContextEpisodeId(context: Record<string, unknown>): string | null {
  const value = context.episodeId
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function buildWorkspaceAssistantSendRequestBody(
  params: WorkspaceAssistantSendRequestBodyParams,
): Record<string, unknown> {
  const episodeId = readContextEpisodeId(params.context)
  return {
    ...normalizeBaseBody(params.baseBody),
    context: params.context,
    ...(episodeId ? { episodeId } : {}),
    id: params.id,
    messages: buildWorkspaceAssistantRequestMessages({
      rawContextMessages: params.rawContextMessages,
      outgoingMessages: params.outgoingMessages,
    }),
    trigger: params.trigger,
    messageId: params.messageId,
    metadata: params.metadata,
  }
}

export function serializeWorkspaceAssistantRawContext(messages: UIMessage[]): string {
  return JSON.stringify(messages, null, 2)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readPartText(part: unknown): string | null {
  if (!isRecord(part)) return null
  if (part.type !== 'text') return null
  const text = readString(part.text).trim()
  return text || null
}

export function serializeWorkspaceAssistantDialogue(messages: UIMessage[]): string {
  const sections: string[] = []
  for (const [index, message] of messages.entries()) {
    if (message.role !== 'user' && message.role !== 'assistant') continue
    const text = message.parts
      .map((part) => readPartText(part))
      .filter((value): value is string => Boolean(value))
      .join('\n\n')
      .trim()
    if (!text) continue
    sections.push([
      `#${index + 1} ${message.role.toUpperCase()}`,
      text,
    ].join('\n'))
  }
  return sections.join('\n\n---\n\n')
}

function isAgentRuntimeContextPartData(value: unknown): value is AgentRuntimeContextPartData {
  if (!isRecord(value)) return false
  return (
    typeof value.requestId === 'string'
    && typeof value.systemPrompt === 'string'
    && Array.isArray(value.selectedTools)
  )
}

export function extractWorkspaceAssistantRuntimeContexts(messages: UIMessage[]): AgentRuntimeContextPartData[] {
  const contexts: AgentRuntimeContextPartData[] = []
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isRecord(part)) continue
      if (part.type !== 'data-agent-runtime-context') continue
      if (isAgentRuntimeContextPartData(part.data)) contexts.push(part.data)
    }
  }
  return contexts
}
