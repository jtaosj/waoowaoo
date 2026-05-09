import { describe, expect, it } from 'vitest'
import type { UIMessage } from 'ai'
import { extractLatestWorkspaceEditTimelineFromMessages } from '@/features/project-workspace/components/workspace-assistant/workspace-edit-timeline-message-parts'
import { buildEditTimelineBlackboard } from '@/lib/edit-timeline'
import type { EditTimelinePartData } from '@/lib/project-agent/types'

function buildTimelineData(id: string, sourceStory: string): EditTimelinePartData {
  return {
    sourceStory,
    timeline: {
      id,
      title: `Timeline ${id}`,
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
    unresolvedRefs: [],
    risks: [],
    estimatedTaskCount: 0,
  }
}

function buildTimelineDataWithShots(id: string): EditTimelinePartData {
  return {
    sourceStory: '一个创作者把整理好的时间线生成视频。',
    timeline: {
      id,
      title: `Timeline ${id}`,
      aspectRatio: '9:16',
      fps: 24,
      segments: [
        {
          id: 'segment-1',
          label: '开场',
          startMs: 0,
          durationMs: 3000,
          intent: '建立角色处境。',
          shotIds: ['shot-1'],
        },
        {
          id: 'segment-2',
          label: '转折',
          startMs: 3000,
          durationMs: 3000,
          intent: '让角色开始行动。',
          shotIds: ['shot-2'],
        },
      ],
      shots: [
        {
          id: 'shot-1',
          segmentId: 'segment-1',
          title: '压抑开场',
          goal: '表现角色疲惫但仍想创作。',
          track: 'video',
          order: 0,
          startMs: 0,
          durationMs: 3000,
          dependsOn: [],
          inputArtifacts: [],
          outputArtifacts: [],
          referenceIds: [],
          editorial: {
            visual: '夜晚室内，冷色光，角色独自面对屏幕。',
            story: '角色陷入停滞，准备寻找新的表达方式。',
            sound: '低频环境声和轻微键盘声。',
            caption: '我还能把故事讲出来吗？',
          },
          control: {
            prompt: '冷色夜晚室内，角色坐在屏幕前，电影感竖屏构图。',
            referenceImageRefs: [],
            characterRefIds: [],
            performanceRefIds: [],
          },
        },
        {
          id: 'shot-2',
          segmentId: 'segment-2',
          title: '主动输入',
          goal: '表现角色开始输入并看到希望。',
          track: 'video',
          order: 1,
          startMs: 3000,
          durationMs: 3000,
          dependsOn: ['shot-1'],
          inputArtifacts: [],
          outputArtifacts: [],
          referenceIds: [],
          editorial: {
            visual: '屏幕光变亮，手指快速输入，画面节奏加快。',
            story: '角色从停滞转入主动创造。',
            sound: '键盘声更清晰，音乐开始上扬。',
            caption: '把脑子里的画面写下来。',
          },
          control: {
            prompt: '竖屏近景，屏幕光映在脸上，手指快速输入文字。',
            referenceImageRefs: [],
            characterRefIds: [],
            performanceRefIds: [],
          },
        },
      ],
      references: [],
      continuityBible: {
        characters: [],
        locations: [],
        props: [],
        visualRules: [],
        audioRules: [],
      },
    },
    unresolvedRefs: [],
    risks: [],
    estimatedTaskCount: 2,
  }
}

const agentCrew: NonNullable<EditTimelinePartData['agentCrew']> = {
  director: {
    agentId: 'main-director',
    role: 'main-director',
    title: '主 Agent',
    mission: '决定时间线并分发任务。',
    summary: '主 Agent 已完成时间切分。',
    shotIds: ['shot-1'],
    outputs: [{ shotId: 'shot-1', text: '0-3s 开场。' }],
    status: 'drafted',
  },
  subagents: [{
    agentId: 'visual-director',
    role: 'visual-director',
    title: '画面 Agent',
    mission: '负责画面。',
    summary: '画面 Agent 已输出画面方案。',
    shotIds: ['shot-1'],
    outputs: [{ shotId: 'shot-1', text: '深夜办公室。' }],
    status: 'drafted',
  }],
  synthesis: '主 Agent 综合专业 Agent 输出。',
}

const creativeBrief: NonNullable<EditTimelinePartData['creativeBrief']> = {
  theme: '创作者把整理好的时间线生成视频',
  protagonist: '创作者',
  setting: '夜晚室内',
  mood: '停滞后重新行动',
  twist: '输入文字后看到希望',
  targetDurationMs: 6000,
  aspectRatio: '9:16',
  missingInfo: [],
  assumptions: [],
}

function buildAssistantMessage(id: string, parts: ReadonlyArray<unknown>): UIMessage {
  return {
    id,
    role: 'assistant',
    parts,
  } as unknown as UIMessage
}

describe('workspace edit timeline message parts', () => {
  it('extracts the newest data-edit-timeline part directly from assistant messages', () => {
    const older = buildTimelineData('older', '旧故事')
    const latest = buildTimelineData('latest', '客户最新故事')
    const messages = [
      buildAssistantMessage('m1', [{ type: 'data-edit-timeline', data: older }]),
      buildAssistantMessage('m2', [{ type: 'text', text: '普通文字' }]),
      buildAssistantMessage('m3', [{ type: 'data-edit-timeline', data: latest }]),
    ]

    expect(extractLatestWorkspaceEditTimelineFromMessages(messages)).toBe(latest)
  })

  it('merges earlier agent crew data with later timeline-only parts from assistant messages', () => {
    const planned = {
      ...buildTimelineData('timeline-merge', '客户原始故事'),
      agentCrew,
    }
    const compiled = {
      ...buildTimelineData('timeline-merge', ''),
      sourceStory: undefined,
      estimatedTaskCount: 4,
    }
    const messages = [
      buildAssistantMessage('m1', [{ type: 'data-edit-timeline', data: planned }]),
      buildAssistantMessage('m2', [{ type: 'data-edit-timeline', data: compiled }]),
    ]

    expect(extractLatestWorkspaceEditTimelineFromMessages(messages)).toMatchObject({
      sourceStory: '客户原始故事',
      agentCrew,
      estimatedTaskCount: 4,
    })
  })

  it('derives agent crew cards from a saved timeline when previous assistant data omitted agentCrew', () => {
    const timelineOnly = buildTimelineDataWithShots('timeline-derived')
    const messages = [
      buildAssistantMessage('m1', [{ type: 'data-edit-timeline', data: timelineOnly }]),
    ]

    const result = extractLatestWorkspaceEditTimelineFromMessages(messages)

    expect(result?.agentCrew?.director).toMatchObject({
      agentId: 'main-director',
      role: 'main-director',
      shotIds: ['shot-1', 'shot-2'],
    })
    expect(result?.agentCrew?.subagents.map((agent) => agent.agentId)).toEqual([
      'visual-director',
      'story-editor',
      'sound-designer',
      'subtitle-writer',
    ])
    expect(result?.agentCrew?.subagents.every((agent) => (
      agent.status === 'drafted'
      && agent.outputs.map((output) => output.shotId).join(',') === 'shot-1,shot-2'
    ))).toBe(true)
  })

  it('derives specialist agent crew cards from blackboard when available', () => {
    const timelineWithBlackboard = buildTimelineDataWithShots('timeline-blackboard')
    timelineWithBlackboard.creativeBrief = creativeBrief
    timelineWithBlackboard.blackboard = buildEditTimelineBlackboard({
      timeline: timelineWithBlackboard.timeline,
      sourceStory: timelineWithBlackboard.sourceStory ?? '',
      creativeBrief,
      risks: [],
    })
    const messages = [
      buildAssistantMessage('m1', [{ type: 'data-edit-timeline', data: timelineWithBlackboard }]),
    ]

    const result = extractLatestWorkspaceEditTimelineFromMessages(messages)

    expect(result?.agentCrew?.synthesis).toContain('blackboard')
    expect(result?.agentCrew?.subagents.map((agent) => agent.role).sort()).toEqual([
      'cinematography-agent',
      'continuity-agent',
      'prompt-engineer-agent',
      'screenplay-agent',
      'sound-agent',
    ])
    expect(result?.agentCrew?.subagents.find((agent) => agent.role === 'screenplay-agent')?.outputs[0]?.text)
      .toContain('表现角色疲惫但仍想创作')
    expect(result?.agentCrew?.subagents.find((agent) => agent.role === 'prompt-engineer-agent')?.outputs[0]?.text)
      .toContain('Silent 9:16 cinematic video shot')
  })

  it('ignores malformed data parts instead of publishing incomplete workspace state', () => {
    const messages = [
      buildAssistantMessage('m1', [{ type: 'data-edit-timeline', data: { timeline: null } }]),
      buildAssistantMessage('m2', [{ type: 'text', text: 'no timeline' }]),
    ]

    expect(extractLatestWorkspaceEditTimelineFromMessages(messages)).toBeNull()
  })
})
