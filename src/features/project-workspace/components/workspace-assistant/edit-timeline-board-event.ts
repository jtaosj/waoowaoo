'use client'

import type { EditTimelinePartData } from '@/lib/project-agent/types'

export const WORKSPACE_EDIT_TIMELINE_UPDATED_EVENT = 'workspace-edit-timeline:updated'

export interface WorkspaceEditTimelineUpdatedDetail {
  data: EditTimelinePartData
}

export type WorkspaceEditTimelineUpdatedEvent = CustomEvent<WorkspaceEditTimelineUpdatedDetail>

let latestWorkspaceEditTimeline: EditTimelinePartData | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isSameTimeline(current: EditTimelinePartData, incoming: EditTimelinePartData): boolean {
  return current.timeline.id === incoming.timeline.id
}

export function mergeWorkspaceEditTimelinePart(
  current: EditTimelinePartData | null,
  incoming: EditTimelinePartData,
): EditTimelinePartData {
  if (!current) return incoming

  if (!incoming.agentCrew && !isSameTimeline(current, incoming)) {
    return current.agentCrew ? current : incoming
  }

  return {
    ...current,
    ...incoming,
    sourceStory: incoming.sourceStory ?? current.sourceStory,
    creativeBrief: incoming.creativeBrief ?? current.creativeBrief,
    agentCrew: incoming.agentCrew ?? current.agentCrew,
    blackboard: incoming.blackboard ?? current.blackboard,
    workflow: incoming.workflow ?? current.workflow,
  }
}

export function publishWorkspaceEditTimeline(data: EditTimelinePartData): EditTimelinePartData {
  const previousTimeline = latestWorkspaceEditTimeline
  const nextTimeline = mergeWorkspaceEditTimelinePart(previousTimeline, data)
  latestWorkspaceEditTimeline = nextTimeline
  if (nextTimeline === previousTimeline) return nextTimeline
  if (typeof window === 'undefined') return nextTimeline
  window.dispatchEvent(new CustomEvent<WorkspaceEditTimelineUpdatedDetail>(
    WORKSPACE_EDIT_TIMELINE_UPDATED_EVENT,
    { detail: { data: nextTimeline } },
  ))
  return nextTimeline
}

export function getLatestWorkspaceEditTimeline(): EditTimelinePartData | null {
  return latestWorkspaceEditTimeline
}

export function isWorkspaceEditTimelineUpdatedEvent(event: Event): event is WorkspaceEditTimelineUpdatedEvent {
  if (event.type !== WORKSPACE_EDIT_TIMELINE_UPDATED_EVENT) return false
  if (typeof CustomEvent === 'undefined' || !(event instanceof CustomEvent)) return false
  const detail: unknown = event.detail
  return isRecord(detail) && isRecord(detail.data)
}
