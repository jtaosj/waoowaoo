import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { EditTimelineDataCard } from '@/features/project-workspace/components/workspace-assistant/EditTimelineDataCard'
import {
  buildEditTimelineBlackboard,
  mergeEditTimelineBlackboardRuntimeEvidence,
} from '@/lib/edit-timeline'
import type { EditTimelinePartData } from '@/lib/project-agent/types'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (!values) return key
    return `${key}:${JSON.stringify(values)}`
  },
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: ({ name }: { readonly name: string }) => <span data-icon={name} />,
}))

const data: EditTimelinePartData = {
  timeline: {
    id: 'timeline-ui',
    title: 'Receipt reversal',
    aspectRatio: '9:16',
    fps: 24,
    segments: [
      {
        id: 'seg-main',
        label: 'Hook',
        startMs: 0,
        durationMs: 15_000,
        intent: 'Show the clue and reveal the hidden witness.',
        shotIds: ['shot-hook', 'shot-reveal'],
      },
    ],
    shots: [
      {
        id: 'shot-hook',
        segmentId: 'seg-main',
        title: 'Wrong clue',
        goal: 'The clue points to the wrong suspect.',
        track: 'video',
        order: 1,
        startMs: 0,
        durationMs: 7_000,
        dependsOn: [],
        inputArtifacts: [],
        outputArtifacts: [],
        referenceIds: ['character-lead'],
        editorial: {
          visual: '深夜办公室，女生坐在电脑前，桌面凌乱，窗外下雨。',
          story: '表现压抑、疲惫、被工作困住。',
          sound: '低频环境音、雨声、键盘声。',
          caption: '我好像快忘了，自己为什么想创作。',
        },
        control: {
          prompt: 'Close shot of a receipt.',
          referenceImageRefs: [],
          characterRefIds: [],
          performanceRefIds: [],
        },
      },
      {
        id: 'shot-reveal',
        segmentId: 'seg-main',
        title: 'Witness reveal',
        goal: 'Reveal the hidden witness.',
        track: 'video',
        order: 2,
        startMs: 7_000,
        durationMs: 8_000,
        dependsOn: ['shot-hook'],
        inputArtifacts: [],
        outputArtifacts: [],
        referenceIds: [],
        control: {
          prompt: 'Medium reveal behind the glass door.',
          firstFrameRef: 'media:reveal-start',
          lastFrameRef: 'media:reveal-end',
          referenceImageRefs: [],
          characterRefIds: [],
          performanceRefIds: [],
        },
      },
    ],
    references: [
      {
        id: 'character-lead',
        kind: 'character',
        label: 'Lead identity',
        artifactRef: 'media:lead-ref',
      },
    ],
    continuityBible: {
      characters: [],
      locations: [],
      props: [],
      visualRules: [],
      audioRules: [],
    },
  },
  unresolvedRefs: ['media:reveal-end'],
  risks: [
    {
      code: 'EDIT_TIMELINE_LAST_FRAME_UNRESOLVED',
      message: 'EDIT_TIMELINE_LAST_FRAME_UNRESOLVED:shot-reveal:media:reveal-end',
    },
  ],
  estimatedTaskCount: 2,
  creativeBrief: {
    theme: '雨夜旧相机预告未来',
    protagonist: '高中生',
    setting: '雨夜便利店',
    mood: '悬疑反转',
    twist: '照片里出现十分钟后的自己',
    targetDurationMs: 15_000,
    aspectRatio: '9:16',
    missingInfo: [],
    assumptions: ['Agent 将故事拆成开端、升级、反转三个节拍。'],
  },
  confirmationSummary: {
    timelineId: 'timeline-ui',
    timelineTitle: 'Receipt reversal',
    totalDurationMs: 15_000,
    aspectRatio: '9:16',
    segmentCount: 1,
    shotCount: 2,
    providerTaskCount: 2,
    effects: {
      billable: true,
      externalSideEffects: true,
      longRunning: true,
    },
    blockers: [
      {
        code: 'EDIT_TIMELINE_LAST_FRAME_UNRESOLVED',
        message: 'EDIT_TIMELINE_LAST_FRAME_UNRESOLVED:shot-reveal:media:reveal-end',
      },
    ],
    unresolvedRefs: ['media:reveal-end'],
    redoCandidates: ['shot-hook', 'shot-reveal'],
    shots: [
      {
        shotId: 'shot-hook',
        segmentId: 'seg-main',
        shotTitle: 'Wrong clue',
        startMs: 0,
        durationMs: 7_000,
        operationId: 'generate_panel_video',
        providerMode: 'text-to-video',
        referenceIds: ['character-lead'],
        firstFrame: { ref: null, resolvedRef: null, status: 'not_required' },
        lastFrame: { ref: null, resolvedRef: null, status: 'not_required' },
        referenceImages: [],
        referenceAssets: [
          {
            referenceId: 'character-lead',
            label: 'Lead identity',
            artifactRef: 'media:lead-ref',
            resolvedRef: null,
            status: 'unresolved',
          },
        ],
        canRedo: true,
      },
      {
        shotId: 'shot-reveal',
        segmentId: 'seg-main',
        shotTitle: 'Witness reveal',
        startMs: 7_000,
        durationMs: 8_000,
        operationId: 'generate_panel_video',
        providerMode: 'first-last-frame',
        referenceIds: [],
        firstFrame: { ref: 'media:reveal-start', resolvedRef: null, status: 'unresolved' },
        lastFrame: { ref: 'media:reveal-end', resolvedRef: null, status: 'unresolved' },
        referenceImages: [],
        referenceAssets: [],
        canRedo: true,
      },
    ],
  },
}

if (!data.creativeBrief) {
  throw new Error('TEST_CREATIVE_BRIEF_REQUIRED')
}
data.blackboard = mergeEditTimelineBlackboardRuntimeEvidence(buildEditTimelineBlackboard({
  timeline: data.timeline,
  sourceStory: '雨夜便利店里，收银员重复同一句话，主角看见另一个自己站在门外。',
  creativeBrief: data.creativeBrief,
  risks: [],
}), {
  providerTasks: [
    {
      shotId: 'shot-hook',
      provider: 'ark',
      model: 'doubao-seedance-1-0-lite-t2v',
      taskId: 'task-shot-hook',
      outputUrl: 'https://cdn.example.test/shot-hook.mp4',
      status: 'succeeded',
      criticScore: 84,
    },
    {
      shotId: 'shot-reveal',
      provider: 'ark',
      model: 'doubao-seedance-2-0-fast-260128',
      taskId: 'task-shot-reveal',
      outputUrl: null,
      status: 'failed',
      blocker: 'MODEL_NOT_OPEN',
      criticScore: 18,
    },
  ],
  finalVideo: {
    url: 'https://cdn.example.test/final-video.mp4',
    evidenceRefs: ['.agent/evidence/loop/final-video-playback.png'],
    score: 58,
    issues: ['shot-reveal:MODEL_NOT_OPEN'],
  },
})

describe('workspace assistant edit timeline card', () => {
  it('renders a visible timeline strip and provider task summary', () => {
    const html = renderToStaticMarkup(<EditTimelineDataCard data={data} />)

    expect(html).toContain('cards.editTimeline.title')
    expect(html).toContain('Receipt reversal')
    expect(html).toContain('Wrong clue')
    expect(html).toContain('Witness reveal')
    expect(html).toContain('cards.editTimeline.storyUnderstanding')
    expect(html).toContain('高中生')
    expect(html).toContain('雨夜便利店')
    expect(html).toContain('cards.editTimeline.visual')
    expect(html).toContain('深夜办公室，女生坐在电脑前')
    expect(html).toContain('cards.editTimeline.story')
    expect(html).toContain('表现压抑、疲惫')
    expect(html).toContain('cards.editTimeline.sound')
    expect(html).toContain('低频环境音、雨声')
    expect(html).toContain('cards.editTimeline.caption')
    expect(html).toContain('我好像快忘了')
    expect(html).toContain('cards.editTimeline.providerTaskCount')
    expect(html).toContain('cards.blackboard.title')
    expect(html).toContain('cards.blackboard.nextOptimization')
    expect(html).toContain('cards.blackboard.criticStatus')
    expect(html).not.toContain('cards.blackboard.criticScore')
    expect(html).toContain('cards.blackboard.roles.filmCriticAgent')
    expect(html).toContain('cards.blackboard.screenplay')
    expect(html).toContain('cards.blackboard.cinematography')
    expect(html).toContain('cards.blackboard.continuity')
    expect(html).toContain('cards.blackboard.providerPrompt')
    expect(html).toContain('cards.blackboard.shotScore')
    expect(html).toContain('cards.blackboard.providerTask')
    expect(html).toContain('task-shot-hook')
    expect(html).toContain('https://cdn.example.test/shot-hook.mp4')
    expect(html).toContain('MODEL_NOT_OPEN')
    expect(html).toContain('cards.blackboard.redoReason')
    expect(html).toContain('cards.blackboard.finalVideoPreview')
    expect(html).toContain('<video')
    expect(html).toContain('controls=""')
    expect(html).toContain('preload="metadata"')
    expect(html).toContain('cards.blackboard.finalEvidence')
    expect(html).toContain('https://cdn.example.test/final-video.mp4')
    expect(html).toContain('.agent/evidence/loop/final-video-playback.png')
    expect(html).toContain('cards.editTimeline.blockers')
    expect(html).toContain('data-icon="timeline"')
  })

  it('does not render a final critic score before final video evidence is scored', () => {
    if (!data.creativeBrief) {
      throw new Error('TEST_CREATIVE_BRIEF_REQUIRED')
    }
    const plannedData: EditTimelinePartData = {
      ...data,
      blackboard: buildEditTimelineBlackboard({
        timeline: data.timeline,
        sourceStory: 'A courier waits under neon rain while a clerk sketches a comic panel.',
        creativeBrief: data.creativeBrief,
        risks: [],
      }),
    }

    const html = renderToStaticMarkup(<EditTimelineDataCard data={plannedData} />)

    expect(html).toContain('cards.blackboard.criticStatus')
    expect(html).toContain('cards.blackboard.status.planned')
    expect(html).toContain('cards.blackboard.finalVideoPending')
    expect(html).not.toContain('cards.blackboard.criticScore')
    expect(html).not.toContain('cards.blackboard.shotScore')
    expect(html).not.toContain('cards.blackboard.finalEvidence')
  })
})
