import { describe, expect, it } from 'vitest'
import {
  buildEditTimelineBlackboard,
  editTimelineBlackboardSchema,
  mergeEditTimelineBlackboardRuntimeEvidence,
  parseEditTimeline,
  type EditTimeline,
} from '@/lib/edit-timeline'
import type {
  EditTimelineAgentCrew,
  EditTimelineCreativeBrief,
} from '@/lib/project-agent/types'

const timelineInput: EditTimeline = {
  id: 'timeline-blackboard',
  title: 'Rain convenience store loop',
  aspectRatio: '9:16',
  fps: 24,
  segments: [
    {
      id: 'seg-setup',
      label: '0-3s',
      startMs: 0,
      durationMs: 3000,
      intent: 'Establish the rainy convenience store and the repeated cashier line.',
      shotIds: ['shot-setup'],
    },
    {
      id: 'seg-reveal',
      label: '3-6s',
      startMs: 3000,
      durationMs: 3000,
      intent: 'Reveal the same protagonist outside the glass door.',
      shotIds: ['shot-reveal'],
    },
  ],
  shots: [
    {
      id: 'shot-setup',
      segmentId: 'seg-setup',
      title: 'Frozen checkout',
      goal: 'Show the young customer noticing that the cashier repeats one sentence.',
      track: 'video',
      order: 1,
      startMs: 0,
      durationMs: 3000,
      dependsOn: [],
      referenceIds: ['character-customer', 'location-store'],
      editorial: {
        visual: 'Rainy night convenience store, fluorescent ceiling lights, the young customer faces the cashier across the counter.',
        story: 'The cashier repeats the same line while the customer notices time is stuck at 3:07.',
        sound: 'Silent v1; keep visual-only timing for provider generation.',
        caption: 'Time stops at 3:07.',
      },
      control: {
        prompt: 'A young customer stands at a convenience store checkout on a rainy night.',
        durationSeconds: 3,
        aspectRatio: '9:16',
        referenceImageRefs: [],
        characterRefIds: ['character-customer'],
        performanceRefIds: [],
      },
    },
    {
      id: 'shot-reveal',
      segmentId: 'seg-reveal',
      title: 'Self outside the glass',
      goal: 'The customer turns and sees another version of himself outside the door.',
      track: 'video',
      order: 2,
      startMs: 3000,
      durationMs: 3000,
      dependsOn: ['shot-setup'],
      referenceIds: ['character-customer', 'location-store'],
      editorial: {
        visual: 'Over-shoulder shot from inside the store toward the rain-streaked glass door; the same customer stands outside.',
        story: 'The reveal connects directly to the previous look toward the door.',
        sound: 'Silent v1; do not require dialogue or lip sync.',
        caption: 'Outside, he is already waiting.',
      },
      control: {
        prompt: 'Over-shoulder reveal toward a rain-streaked glass door.',
        durationSeconds: 3,
        aspectRatio: '9:16',
        firstFrameRef: 'media:door-start',
        referenceImageRefs: ['media:customer-ref'],
        characterRefIds: ['character-customer'],
        performanceRefIds: [],
      },
    },
  ],
  references: [
    {
      id: 'character-customer',
      kind: 'character',
      label: 'Young customer in dark rain jacket',
      artifactRef: 'media:customer-ref',
    },
    {
      id: 'location-store',
      kind: 'location',
      label: 'Rainy convenience store',
      artifactRef: 'media:store-ref',
    },
  ],
  continuityBible: {
    characters: ['Young customer keeps the same dark rain jacket, short black hair, and wet umbrella.'],
    locations: ['Convenience store counter, fluorescent lights, glass door, wet street outside stay continuous.'],
    props: ['Phone screen reads 3:07.'],
    visualRules: ['Vertical 9:16 frame; subject remains centered and visible.'],
    audioRules: ['Silent video v1; no dialogue generation required.'],
  },
}

const creativeBrief: EditTimelineCreativeBrief = {
  theme: 'Rain night convenience store time loop',
  protagonist: 'young customer',
  setting: 'rainy convenience store',
  mood: 'suspense reveal',
  twist: 'the protagonist sees himself outside',
  targetDurationMs: 6000,
  aspectRatio: '9:16',
  missingInfo: [],
  assumptions: ['Silent-video v1 focuses on visual continuity before sound and subtitles.'],
}

const agentCrew: EditTimelineAgentCrew = {
  director: {
    agentId: 'main-director',
    role: 'main-director',
    title: 'Main Director Agent',
    mission: 'Split the story into executable time blocks and assign specialist work.',
    summary: 'Two shots progress from frozen checkout to the glass-door reveal.',
    shotIds: ['shot-setup', 'shot-reveal'],
    outputs: [
      { shotId: 'shot-setup', text: '0-3s setup' },
      { shotId: 'shot-reveal', text: '3-6s reveal' },
    ],
    status: 'drafted',
  },
  subagents: [],
  synthesis: 'The timeline is ready for prompt packaging and provider planning.',
}

describe('EditTimelineBlackboard', () => {
  it('records true subagent ownership, shot dependencies, prompt packages, provider placeholders, and critic scoring', () => {
    const timeline = parseEditTimeline(timelineInput)

    const blackboard = buildEditTimelineBlackboard({
      timeline,
      sourceStory: '雨夜，一个年轻人走进便利店，发现收银员一直重复同一句话。他低头看手机，发现时间停在凌晨 3:07。',
      creativeBrief,
      agentCrew,
      risks: [],
    })

    expect(editTimelineBlackboardSchema.parse(blackboard)).toEqual(blackboard)
    expect(blackboard.agents.map((agent) => agent.role)).toEqual([
      'main-director',
      'screenplay-agent',
      'cinematography-agent',
      'continuity-agent',
      'prompt-engineer-agent',
      'sound-agent',
      'provider-production-agent',
      'film-critic-agent',
    ])
    expect(blackboard.macroScript).toEqual([
      expect.objectContaining({
        segmentId: 'seg-setup',
        startMs: 0,
        endMs: 3000,
        beatGoal: expect.stringContaining('rainy convenience store'),
        storyFunction: 'setup',
        dependencies: [],
      }),
      expect.objectContaining({
        segmentId: 'seg-reveal',
        startMs: 3000,
        endMs: 6000,
        beatGoal: expect.stringContaining('same protagonist outside'),
        storyFunction: 'payoff',
        dependencies: ['seg-setup'],
      }),
    ])
    expect(blackboard.segmentBlackboards).toHaveLength(2)
    expect(blackboard.segmentBlackboards.map((segment) => segment.segmentId)).toEqual([
      'seg-setup',
      'seg-reveal',
    ])
    for (const segmentBlackboard of blackboard.segmentBlackboards) {
      expect(segmentBlackboard.agentStates.map((agent) => agent.role)).toEqual([
        'screenplay-agent',
        'cinematography-agent',
        'continuity-agent',
        'prompt-engineer-agent',
        'sound-agent',
        'provider-production-agent',
        'film-critic-agent',
      ])
      expect(segmentBlackboard.screenplay.visibleAction.trim().length).toBeGreaterThan(0)
      expect(segmentBlackboard.cinematography.camera.trim().length).toBeGreaterThan(0)
      expect(segmentBlackboard.continuity.styleContinuity.trim().length).toBeGreaterThan(0)
      expect(segmentBlackboard.promptPackage.imagePrompt).toContain('first frame')
      expect(segmentBlackboard.promptPackage.imagePrompt).not.toBe(segmentBlackboard.promptPackage.providerPrompt)
      expect(segmentBlackboard.promptPackage.providerPrompt).toContain('subject visible')
      expect(segmentBlackboard.soundPlan.blocking).toBe(false)
      expect(segmentBlackboard.providerTask.status).toBe('planned')
      expect(segmentBlackboard.quality.score).toBeGreaterThan(0)

      const screenplayAgent = segmentBlackboard.agentStates.find((agent) => agent.role === 'screenplay-agent')
      const cinematographyAgent = segmentBlackboard.agentStates.find((agent) => agent.role === 'cinematography-agent')
      const continuityAgent = segmentBlackboard.agentStates.find((agent) => agent.role === 'continuity-agent')
      const promptEngineerAgent = segmentBlackboard.agentStates.find((agent) => agent.role === 'prompt-engineer-agent')

      expect(screenplayAgent?.outputs).toEqual(expect.arrayContaining([
        expect.stringMatching(/^visible-action:/),
      ]))
      expect(cinematographyAgent?.outputs).toEqual(expect.arrayContaining([
        expect.stringMatching(/^camera:/),
        expect.stringMatching(/^motion:/),
        expect.stringMatching(/^lighting:/),
        expect.stringMatching(/^transition-hook:/),
      ]))
      expect(continuityAgent?.outputs).toEqual(expect.arrayContaining([
        expect.stringMatching(/^character-continuity:/),
        expect.stringMatching(/^location-continuity:/),
        expect.stringMatching(/^prop-continuity:/),
        expect.stringMatching(/^style-continuity:/),
      ]))
      expect(promptEngineerAgent?.outputs).toEqual(expect.arrayContaining([
        expect.stringMatching(/^image-prompt:/),
        expect.stringMatching(/^video-prompt:/),
        expect.stringMatching(/^negative-prompt:/),
      ]))

      const specialistOutputs = [
        segmentBlackboard.screenplay.visibleAction,
        segmentBlackboard.cinematography.camera,
        segmentBlackboard.continuity.characterContinuity,
        segmentBlackboard.promptPackage.providerPrompt,
      ].map((value) => value.trim())
      expect(new Set(specialistOutputs).size).toBe(specialistOutputs.length)
    }
    expect(blackboard.shots).toHaveLength(2)

    const reveal = blackboard.shots.find((shot) => shot.shotId === 'shot-reveal')
    expect(reveal).toMatchObject({
      ownerAgentId: 'prompt-engineer-agent',
      dependencyShotIds: ['shot-setup'],
      readiness: 'ready',
      providerTask: {
        provider: null,
        model: null,
        taskId: null,
        outputUrl: null,
        status: 'planned',
      },
    })
    expect(reveal?.promptPackage).toMatchObject({
      subject: expect.stringContaining('customer'),
      action: expect.stringContaining('sees another version'),
      scene: expect.stringContaining('rain'),
      camera: expect.stringContaining('over-shoulder'),
      motion: expect.stringContaining('turns'),
      continuity: expect.stringContaining('dark rain jacket'),
      referencePolicy: 'image-to-video',
    })
    expect(reveal?.promptPackage.imagePrompt).toContain('first frame')
    expect(reveal?.promptPackage.imagePrompt).toContain('over-shoulder')
    expect(reveal?.promptPackage.providerPrompt).toContain('9:16')
    expect(reveal?.promptPackage.providerPrompt).toContain('subject visible')
    expect(reveal?.quality.score).toBeGreaterThanOrEqual(80)

    expect(blackboard.finalCritic.status).toBe('planned')
    expect(blackboard.finalCritic.score).toBe(0)
    expect(blackboard.finalCritic.evidenceRefs).toEqual([])
    expect(blackboard.agents.find((agent) => agent.role === 'film-critic-agent')?.outputs).toEqual(
      expect.arrayContaining([
        expect.stringContaining('final review pending final.video evidence'),
      ]),
    )
    expect(blackboard.nextOptimizationTarget).toBe('awaiting-final-video-evidence')
  })

  it('merges real provider task evidence, final video evidence, and earliest runtime blockers without inventing success', () => {
    const timeline = parseEditTimeline(timelineInput)

    const plannedBlackboard = buildEditTimelineBlackboard({
      timeline,
      sourceStory: '雨夜，一个年轻人走进便利店，发现收银员一直重复同一句话。他低头看手机，发现时间停在凌晨 3:07。',
      creativeBrief,
      agentCrew,
      risks: [],
    })

    const productionBlackboard = mergeEditTimelineBlackboardRuntimeEvidence(plannedBlackboard, {
      providerTasks: [
        {
          shotId: 'shot-setup',
          provider: 'ark',
          model: 'doubao-seedance-1-0-lite-t2v',
          taskId: 'task-shot-setup',
          outputUrl: 'https://cdn.example.test/shot-setup.mp4',
          status: 'succeeded',
          criticScore: 86,
        },
        {
          shotId: 'shot-reveal',
          provider: 'ark',
          model: 'doubao-seedance-2-0-fast-260128',
          taskId: 'task-shot-reveal',
          outputUrl: null,
          status: 'failed',
          blocker: 'MODEL_NOT_OPEN',
          criticScore: 12,
        },
      ],
      finalVideo: {
        url: 'https://cdn.example.test/final.mp4',
        evidenceRefs: ['.agent/evidence/loop/final-video-playback.png'],
        score: 64,
        issues: ['shot-reveal:MODEL_NOT_OPEN'],
      },
    })

    expect(editTimelineBlackboardSchema.parse(productionBlackboard)).toEqual(productionBlackboard)

    const setup = productionBlackboard.shots.find((shot) => shot.shotId === 'shot-setup')
    expect(setup?.providerTask).toEqual({
      provider: 'ark',
      model: 'doubao-seedance-1-0-lite-t2v',
      taskId: 'task-shot-setup',
      outputUrl: 'https://cdn.example.test/shot-setup.mp4',
      status: 'succeeded',
      blocker: null,
    })
    expect(setup?.quality.score).toBe(86)

    const reveal = productionBlackboard.shots.find((shot) => shot.shotId === 'shot-reveal')
    expect(reveal?.status).toBe('blocked')
    expect(reveal?.providerTask).toMatchObject({
      provider: 'ark',
      model: 'doubao-seedance-2-0-fast-260128',
      taskId: 'task-shot-reveal',
      outputUrl: null,
      status: 'failed',
      blocker: 'MODEL_NOT_OPEN',
    })
    expect(reveal?.quality).toMatchObject({
      score: 12,
      redoReason: 'MODEL_NOT_OPEN',
    })

    expect(productionBlackboard.providerExperiments).toHaveLength(2)
    const revealSegment = productionBlackboard.segmentBlackboards.find((segment) => segment.segmentId === 'seg-reveal')
    expect(revealSegment?.providerTask).toMatchObject({
      provider: 'ark',
      model: 'doubao-seedance-2-0-fast-260128',
      taskId: 'task-shot-reveal',
      outputUrl: null,
      status: 'failed',
      blocker: 'MODEL_NOT_OPEN',
    })
    expect(revealSegment?.quality).toMatchObject({
      score: 12,
      redoReason: 'MODEL_NOT_OPEN',
    })
    expect(productionBlackboard.providerExperiments[0]).toMatchObject({
      shotId: 'shot-setup',
      provider: 'ark',
      model: 'doubao-seedance-1-0-lite-t2v',
      inputPrompt: expect.stringContaining('Silent 9:16 cinematic video shot.'),
      taskId: 'task-shot-setup',
      outputUrl: 'https://cdn.example.test/shot-setup.mp4',
      criticScore: 86,
      status: 'succeeded',
      blocker: null,
    })
    expect(productionBlackboard.providerExperiments[1]).toMatchObject({
      shotId: 'shot-reveal',
      taskId: 'task-shot-reveal',
      outputUrl: null,
      criticScore: 12,
      status: 'failed',
      blocker: 'MODEL_NOT_OPEN',
    })

    expect(productionBlackboard.finalCritic).toMatchObject({
      status: 'blocked',
      score: 0,
      nextOptimizationTarget: 'shot-reveal:MODEL_NOT_OPEN',
      evidenceRefs: [
        'https://cdn.example.test/final.mp4',
        '.agent/evidence/loop/final-video-playback.png',
      ],
    })
    expect(productionBlackboard.finalCritic.issues).toContain('shot-reveal:MODEL_NOT_OPEN')
    expect(productionBlackboard.nextOptimizationTarget).toBe('shot-reveal:MODEL_NOT_OPEN')
  })
})
