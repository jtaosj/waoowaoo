import { NextRequest, NextResponse } from 'next/server'
import { safeValidateUIMessages, type UIMessage } from 'ai'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuth } from '@/lib/api-auth'
import { getUserModelConfig } from '@/lib/config-service'
import { createProjectAgentChatResponse } from '@/lib/project-agent'
import { normalizeProjectAgentLocale } from '@/lib/project-agent/locale'
import { compressMessages, shouldCompressMessages } from '@/lib/project-agent/message-compression'
import { resolveProjectAgentLanguageModel } from '@/lib/project-agent/model'
import { mergeProjectAssistantThreadMessages } from '@/lib/project-agent/thread-message-merge'
import {
  clearProjectAssistantThread,
  loadProjectAssistantThread,
  saveProjectAssistantThread,
} from '@/lib/project-agent/persistence'
import { writeWorkspaceAssistantThreadLog } from '@/lib/project-agent/thread-log'

type RequestBody = {
  messages?: unknown
  context?: unknown
  episodeId?: string | null
  locale?: string | null
}

function mapProjectAgentError(error: unknown): ApiError {
  if (error instanceof Error) {
    if (error.message === 'PROJECT_AGENT_MODEL_NOT_CONFIGURED') {
      return new ApiError('MISSING_CONFIG', {
        code: error.message,
        message: 'analysisModel is required before using project assistant',
      })
    }
    if (
      error.message === 'PROJECT_AGENT_INVALID_MESSAGES'
      || error.message === 'PROJECT_AGENT_EMPTY_MESSAGES'
      || error.message === 'PROJECT_AGENT_EPISODE_REQUIRED'
      || error.message === 'PROJECT_ASSISTANT_INVALID_THREAD_MESSAGES'
      || error.message === 'PROJECT_AGENT_TOOL_SELECTION_INVALID'
      || error.message === 'PROJECT_AGENT_TOOL_SELECTION_TOO_LARGE'
      || error.message === 'PROJECT_AGENT_MESSAGE_SUMMARY_EMPTY'
    ) {
      return new ApiError('INVALID_PARAMS', {
        code: error.message,
        message: error.message,
      })
    }
  }

  return new ApiError('EXTERNAL_ERROR', {
    code: 'PROJECT_AGENT_RUNTIME_FAILED',
    message: error instanceof Error ? error.message : String(error),
  })
}

function readEpisodeIdFromQuery(request: NextRequest): string | null {
  return request.nextUrl.searchParams.get('episodeId')?.trim() || null
}

function readEpisodeIdFromBody(body: RequestBody): string | null {
  if (typeof body.episodeId === 'string' && body.episodeId.trim()) {
    return body.episodeId.trim()
  }
  if (body.context && typeof body.context === 'object' && !Array.isArray(body.context)) {
    const contextEpisodeId = (body.context as Record<string, unknown>).episodeId
    if (typeof contextEpisodeId === 'string' && contextEpisodeId.trim()) {
      return contextEpisodeId.trim()
    }
  }
  return null
}

function readLocaleFromBody(body: RequestBody): 'zh' | 'en' {
  if (body.context && typeof body.context === 'object') {
    return normalizeProjectAgentLocale((body.context as Record<string, unknown>).locale)
  }
  return normalizeProjectAgentLocale(body.locale)
}

async function validateThreadMessages(messages: unknown): Promise<UIMessage[]> {
  const validation = await safeValidateUIMessages({ messages })
  if (!validation.success) {
    throw new Error('PROJECT_AGENT_INVALID_MESSAGES')
  }
  return validation.data
}

async function compressValidatedThreadMessagesIfNeeded(params: {
  userId: string
  locale: 'zh' | 'en'
  messages: UIMessage[]
}) {
  if (!shouldCompressMessages(params.messages)) {
    return params.messages
  }

  const userConfig = await getUserModelConfig(params.userId)
  const analysisModelKey = userConfig.analysisModel?.trim() || ''
  if (!analysisModelKey) {
    throw new Error('PROJECT_AGENT_MODEL_NOT_CONFIGURED')
  }

  const resolved = await resolveProjectAgentLanguageModel({
    userId: params.userId,
    analysisModelKey,
  })

  return await compressMessages({
    messages: params.messages,
    locale: params.locale,
    model: resolved.languageModel,
  })
}

async function compressThreadMessagesIfNeeded(params: {
  userId: string
  locale: 'zh' | 'en'
  messages: unknown
}) {
  const messages = await validateThreadMessages(params.messages)
  return await compressValidatedThreadMessagesIfNeeded({
    userId: params.userId,
    locale: params.locale,
    messages,
  })
}

export const runtime = 'nodejs'

export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  try {
    const thread = await loadProjectAssistantThread({
      projectId,
      userId: authResult.session.user.id,
      episodeId: readEpisodeIdFromQuery(request),
      assistantId: 'workspace-command',
    })
    return NextResponse.json({ thread })
  } catch (error) {
    throw mapProjectAgentError(error)
  }
})

export const PUT = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    throw new ApiError('INVALID_PARAMS', {
      code: 'BODY_PARSE_FAILED',
      field: 'body',
      message: 'request body must be valid JSON',
    })
  }

  try {
    const locale = readLocaleFromBody(body)
    const messages = await compressThreadMessagesIfNeeded({
      userId: authResult.session.user.id,
      locale,
      messages: body.messages ?? [],
    })
    const thread = await saveProjectAssistantThread({
      projectId,
      userId: authResult.session.user.id,
      episodeId: readEpisodeIdFromBody(body),
      assistantId: 'workspace-command',
      messages,
    })
    await writeWorkspaceAssistantThreadLog(thread)
    return NextResponse.json({ thread })
  } catch (error) {
    throw mapProjectAgentError(error)
  }
})

export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  try {
    await clearProjectAssistantThread({
      projectId,
      userId: authResult.session.user.id,
      episodeId: readEpisodeIdFromQuery(request),
      assistantId: 'workspace-command',
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    throw mapProjectAgentError(error)
  }
})

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    throw new ApiError('INVALID_PARAMS', {
      code: 'BODY_PARSE_FAILED',
      field: 'body',
      message: 'request body must be valid JSON',
    })
  }

  try {
    const locale = readLocaleFromBody(body)
    const incomingMessages = await validateThreadMessages(body.messages)
    const episodeId = readEpisodeIdFromBody(body)
    const persistedThread = await loadProjectAssistantThread({
      projectId,
      userId: authResult.session.user.id,
      episodeId,
      assistantId: 'workspace-command',
    })
    const mergedMessages = mergeProjectAssistantThreadMessages({
      persistedMessages: persistedThread?.messages ?? [],
      incomingMessages,
    })
    const messages = await compressValidatedThreadMessagesIfNeeded({
      userId: authResult.session.user.id,
      locale,
      messages: mergedMessages,
    })
    const thread = await saveProjectAssistantThread({
      projectId,
      userId: authResult.session.user.id,
      episodeId,
      assistantId: 'workspace-command',
      messages,
    })
    await writeWorkspaceAssistantThreadLog(thread)
    return await createProjectAgentChatResponse({
      request,
      userId: authResult.session.user.id,
      projectId,
      context: body.context,
      messages,
    })
  } catch (error) {
    throw mapProjectAgentError(error)
  }
})
