import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EditTimelinePartData } from '@/lib/project-agent/types'

function buildTimelineData(
  agentCrew: EditTimelinePartData['agentCrew'],
  overrides: Partial<EditTimelinePartData> = {},
): EditTimelinePartData {
  return {
    timeline: {
      id: 'timeline-event-test',
      title: '事件桥测试',
      aspectRatio: '9:16',
      fps: 24,
      segments: [],
        shots: [],
        references: [],
        continuityBible: {
          characters: [],
          locations: [],
          props: [],
          visualRules: [],
          audioRules: [],
        },
    },
    sourceStory: '客户原始故事：一个女生深夜完成自己的第一支 AI 短片。',
    unresolvedRefs: [],
    risks: [],
    estimatedTaskCount: 0,
    ...(agentCrew ? { agentCrew } : {}),
    ...overrides,
  }
}

const agentCrew: NonNullable<EditTimelinePartData['agentCrew']> = {
  director: {
    agentId: 'main-director',
    role: 'main-director',
    title: '主 Agent',
    mission: '拆分并管理子 Agent。',
    summary: '主 Agent 已生成时间线。',
    shotIds: [],
    outputs: [],
    status: 'drafted',
  },
  subagents: [],
  synthesis: '主 Agent 综合输出。',
}

const blackboard: NonNullable<EditTimelinePartData['blackboard']> = {
  id: 'blackboard-timeline-event-test',
  timelineId: 'timeline-event-test',
  version: 'edit-timeline-blackboard-v1',
  sourceStory: '客户原始故事：一个女生深夜完成自己的第一支 AI 短片。',
  status: 'planned',
  agents: [],
  macroScript: [],
  segmentBlackboards: [],
  shots: [],
  providerExperiments: [],
  finalCritic: {
    agentId: 'film-critic-agent',
    status: 'planned',
    score: 88,
    issues: [],
    nextOptimizationTarget: 'ready-for-provider',
    evidenceRefs: [],
  },
  nextOptimizationTarget: 'ready-for-provider',
}

function installWindowTarget(): EventTarget {
  const target = new EventTarget()
  vi.stubGlobal('window', target)
  return target
}

describe('workspace edit timeline board event bridge', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('stores the latest agent crew timeline so the workspace can render after the assistant event fires', async () => {
    const target = installWindowTarget()
    const events: Event[] = []
    target.addEventListener('workspace-edit-timeline:updated', (event) => {
      events.push(event)
    })
    const {
      getLatestWorkspaceEditTimeline,
      publishWorkspaceEditTimeline,
    } = await import('@/features/project-workspace/components/workspace-assistant/edit-timeline-board-event')
    const data = buildTimelineData(agentCrew, { blackboard })

    publishWorkspaceEditTimeline(data)

    expect(events).toHaveLength(1)
    expect(getLatestWorkspaceEditTimeline()).toBe(data)
  })

  it('merges a follow-up non-agent timeline part without clearing source story or agent cards', async () => {
    installWindowTarget()
    const {
      getLatestWorkspaceEditTimeline,
      publishWorkspaceEditTimeline,
    } = await import('@/features/project-workspace/components/workspace-assistant/edit-timeline-board-event')
    const data = buildTimelineData(agentCrew, { blackboard })
    const compiledData = buildTimelineData(undefined, {
      sourceStory: undefined,
      estimatedTaskCount: 4,
      plan: {
        goal: 'Edit-first timeline: compiled',
        estimatedStepCount: 4,
      },
      confirmationSummary: {
        timelineId: 'timeline-event-test',
        timelineTitle: '事件桥测试',
        totalDurationMs: 15_000,
        aspectRatio: '9:16',
        segmentCount: 1,
        shotCount: 4,
        providerTaskCount: 4,
        effects: {
          billable: false,
          externalSideEffects: false,
          longRunning: false,
        },
        redoCandidates: [],
        blockers: [],
        unresolvedRefs: [],
        shots: [],
      },
    })

    publishWorkspaceEditTimeline(data)
    publishWorkspaceEditTimeline(compiledData)

    expect(getLatestWorkspaceEditTimeline()).toMatchObject({
      sourceStory: data.sourceStory,
      agentCrew,
      blackboard,
      estimatedTaskCount: 4,
      plan: {
        goal: 'Edit-first timeline: compiled',
      },
      confirmationSummary: {
        providerTaskCount: 4,
      },
    })
  })
})
