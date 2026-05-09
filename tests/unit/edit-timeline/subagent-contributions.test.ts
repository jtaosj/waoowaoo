import { describe, expect, it } from 'vitest'
import {
  buildEditTimelineBlackboard,
  parseEditTimeline,
  type EditTimeline,
} from '@/lib/edit-timeline'
import type {
  EditTimelineAgentCrew,
  EditTimelineCreativeBrief,
} from '@/lib/project-agent/types'

const sourceStory = 'A retired toy repairman closes his tiny station kiosk before the last train, finds a paper crane tucked inside a broken music box, and follows the melody to a child waiting on the empty platform.'

const timelineInput: EditTimeline = {
  id: 'timeline-subagent-quality',
  title: 'Last train music box',
  aspectRatio: '9:16',
  fps: 24,
  segments: [
    {
      id: 'seg-kiosk',
      label: '0-4s',
      startMs: 0,
      durationMs: 4000,
      intent: 'The toy repairman closes the kiosk and notices the broken music box.',
      shotIds: ['shot-kiosk'],
    },
    {
      id: 'seg-crane',
      label: '4-8s',
      startMs: 4000,
      durationMs: 4000,
      intent: 'The paper crane unfolds beside the music box as the melody begins.',
      shotIds: ['shot-crane'],
    },
    {
      id: 'seg-platform',
      label: '8-12s',
      startMs: 8000,
      durationMs: 4000,
      intent: 'The repairman follows the melody to the child on the empty platform.',
      shotIds: ['shot-platform'],
    },
  ],
  shots: [
    {
      id: 'shot-kiosk',
      segmentId: 'seg-kiosk',
      title: 'Kiosk closes',
      goal: 'The repairman lowers the kiosk shutter and notices the broken music box glowing on his workbench.',
      track: 'video',
      order: 1,
      startMs: 0,
      durationMs: 4000,
      dependsOn: [],
      referenceIds: ['character-repairman', 'location-station', 'prop-music-box'],
      control: {
        prompt: 'OLD_TIMELINE_PROMPT_SHOULD_NOT_LEAK shot one raw prompt.',
        durationSeconds: 4,
        aspectRatio: '9:16',
        referenceImageRefs: [],
        characterRefIds: ['character-repairman'],
        performanceRefIds: [],
      },
    },
    {
      id: 'shot-crane',
      segmentId: 'seg-crane',
      title: 'Crane unfolds',
      goal: 'The repairman opens the music box and a folded paper crane lifts out while the tiny gears turn.',
      track: 'video',
      order: 2,
      startMs: 4000,
      durationMs: 4000,
      dependsOn: ['shot-kiosk'],
      referenceIds: ['character-repairman', 'location-station', 'prop-music-box', 'prop-paper-crane'],
      control: {
        prompt: 'OLD_TIMELINE_PROMPT_SHOULD_NOT_LEAK shot two raw prompt.',
        durationSeconds: 4,
        aspectRatio: '9:16',
        referenceImageRefs: [],
        characterRefIds: ['character-repairman'],
        performanceRefIds: [],
      },
    },
    {
      id: 'shot-platform',
      segmentId: 'seg-platform',
      title: 'Child on platform',
      goal: 'The repairman steps onto the empty platform and sees a child holding the matching paper crane.',
      track: 'video',
      order: 3,
      startMs: 8000,
      durationMs: 4000,
      dependsOn: ['shot-crane'],
      referenceIds: ['character-repairman', 'location-station', 'prop-paper-crane'],
      control: {
        prompt: 'OLD_TIMELINE_PROMPT_SHOULD_NOT_LEAK shot three raw prompt.',
        durationSeconds: 4,
        aspectRatio: '9:16',
        referenceImageRefs: [],
        characterRefIds: ['character-repairman'],
        performanceRefIds: [],
      },
    },
  ],
  references: [
    {
      id: 'character-repairman',
      kind: 'character',
      label: 'Retired toy repairman in a brown work apron',
      artifactRef: 'media:repairman',
    },
    {
      id: 'location-station',
      kind: 'location',
      label: 'Tiny station kiosk and empty last-train platform',
      artifactRef: 'media:station',
    },
    {
      id: 'prop-music-box',
      kind: 'prop',
      label: 'Broken brass music box',
      artifactRef: 'media:music-box',
    },
    {
      id: 'prop-paper-crane',
      kind: 'prop',
      label: 'White paper crane',
      artifactRef: 'media:paper-crane',
    },
  ],
  continuityBible: {
    characters: ['Retired toy repairman keeps the same gray hair, round glasses, brown work apron, and small screwdriver tucked in his chest pocket.'],
    locations: ['Tiny station kiosk and empty last-train platform remain the same late-night station environment.'],
    props: ['Broken brass music box and white paper crane stay visible across the sequence.'],
    visualRules: ['Vertical 9:16 frame, warm kiosk bulbs against cool platform lights, subject remains visible.'],
    audioRules: ['Silent video v1; sound is planned only.'],
  },
}

const creativeBrief: EditTimelineCreativeBrief = {
  theme: 'last-train toy repair mystery',
  protagonist: 'retired toy repairman',
  setting: 'tiny station kiosk and empty platform',
  mood: 'gentle mystery',
  twist: 'the child has the matching paper crane',
  targetDurationMs: 12_000,
  aspectRatio: '9:16',
  missingInfo: [],
  assumptions: ['Silent video v1 focuses on visible action before sound.'],
}

const agentCrew: EditTimelineAgentCrew = {
  director: {
    agentId: 'main-director',
    role: 'main-director',
    title: 'Main Director Agent',
    mission: 'Split the story into executable time blocks and assign specialist work.',
    summary: 'Three segments move from kiosk to paper crane to platform reveal.',
    shotIds: ['shot-kiosk', 'shot-crane', 'shot-platform'],
    outputs: [
      { shotId: 'shot-kiosk', text: '0-4s kiosk setup' },
      { shotId: 'shot-crane', text: '4-8s music box turn' },
      { shotId: 'shot-platform', text: '8-12s platform payoff' },
    ],
    status: 'drafted',
  },
  subagents: [],
  synthesis: 'The timeline is ready for prompt packaging and provider planning.',
}

const cameraTerms = /\b(close-up|wide|medium|over-shoulder|insert|locked|dolly|pan|tilt|rack focus|lighting|composition)\b/i

describe('edit-first subagent contributions', () => {
  it('writes role-specific segment contributions instead of repeating the source story', () => {
    const blackboard = buildEditTimelineBlackboard({
      timeline: parseEditTimeline(timelineInput),
      sourceStory,
      creativeBrief,
      agentCrew,
      risks: [],
    })

    expect(blackboard.segmentBlackboards).toHaveLength(3)

    for (const segment of blackboard.segmentBlackboards) {
      expect(segment.screenplay.visibleAction).not.toContain(sourceStory)
      expect(segment.screenplay.visibleAction).not.toMatch(cameraTerms)

      const cinematographyText = [
        segment.cinematography.camera,
        segment.cinematography.motion,
        segment.cinematography.composition,
        segment.cinematography.lighting,
      ].join(' ')
      expect(cinematographyText).toMatch(cameraTerms)
      expect(cinematographyText).not.toContain(segment.screenplay.visibleAction)

      expect(segment.continuity.characterContinuity).toMatch(/repairman|gray hair|round glasses|work apron/i)
      expect(segment.continuity.locationContinuity).toMatch(/station|kiosk|platform/i)
      expect(segment.continuity.propContinuity).toMatch(/music box|paper crane/i)
      expect(segment.continuity.styleContinuity).toMatch(/9:16|warm|cool|visible/i)

      const specialistTexts = [
        segment.screenplay.visibleAction,
        segment.cinematography.camera,
        segment.continuity.characterContinuity,
        segment.promptPackage.providerPrompt,
      ].map((text) => text.trim())
      expect(new Set(specialistTexts).size).toBe(specialistTexts.length)
    }
  })

  it('builds provider prompts from specialist outputs and never from old shot control prompts', () => {
    const blackboard = buildEditTimelineBlackboard({
      timeline: parseEditTimeline(timelineInput),
      sourceStory,
      creativeBrief,
      agentCrew,
      risks: [],
    })

    for (const segment of blackboard.segmentBlackboards) {
      expect(segment.promptPackage.providerPrompt).toContain(segment.screenplay.visibleAction)
      expect(segment.promptPackage.providerPrompt).toContain(segment.cinematography.camera)
      expect(segment.promptPackage.providerPrompt).toContain(segment.cinematography.motion)
      expect(segment.promptPackage.providerPrompt).toContain(segment.cinematography.composition)
      expect(segment.promptPackage.providerPrompt).toContain(segment.cinematography.lighting)
      expect(segment.promptPackage.providerPrompt).toContain(segment.continuity.characterContinuity)
      expect(segment.promptPackage.providerPrompt).toContain('Opening frame:')
      expect(segment.promptPackage.providerPrompt).toContain('Middle motion:')
      expect(segment.promptPackage.providerPrompt).toContain('Ending frame:')
      expect(segment.promptPackage.providerPrompt).toContain('one single continuous shot')
      expect(segment.promptPackage.providerPrompt).toContain('no jump cuts')
      expect(segment.promptPackage.providerPrompt).not.toContain('OLD_TIMELINE_PROMPT_SHOULD_NOT_LEAK')
      expect(segment.promptPackage.providerPrompt).not.toContain(sourceStory)
      expect(segment.promptPackage.imagePrompt).not.toBe(segment.promptPackage.providerPrompt)
    }
  })

  it('packages each shot as an executable film direction with purpose, visible action, continuity, and forbidden artifacts', () => {
    const blackboard = buildEditTimelineBlackboard({
      timeline: parseEditTimeline(timelineInput),
      sourceStory,
      creativeBrief,
      agentCrew,
      risks: [],
    })

    for (const segment of blackboard.segmentBlackboards) {
      const shot = timelineInput.shots.find((candidate) => candidate.id === segment.shotIds[0])
      expect(shot).toBeDefined()
      expect(segment.promptPackage.providerPrompt).toContain('Shot purpose:')
      expect(segment.promptPackage.providerPrompt).toContain(shot?.goal)
      expect(segment.promptPackage.providerPrompt).toContain('Visible subject action:')
      expect(segment.promptPackage.providerPrompt).toContain(segment.screenplay.visibleAction)
      expect(segment.promptPackage.providerPrompt).toContain('Continuity anchors:')
      expect(segment.promptPackage.providerPrompt).toContain(segment.continuity.characterContinuity)
      expect(segment.promptPackage.providerPrompt).toContain(segment.continuity.propContinuity)
      expect(segment.promptPackage.providerPrompt).toContain('Forbidden artifacts:')
      expect(segment.promptPackage.providerPrompt).toContain('no subtitles')
      expect(segment.promptPackage.providerPrompt).not.toContain('OLD_TIMELINE_PROMPT_SHOULD_NOT_LEAK')
    }
  })

  it('binds every specialist agent output to the owning segment or shot', () => {
    const blackboard = buildEditTimelineBlackboard({
      timeline: parseEditTimeline(timelineInput),
      sourceStory,
      creativeBrief,
      agentCrew,
      risks: [],
    })

    for (const segment of blackboard.segmentBlackboards) {
      for (const agentState of segment.agentStates) {
        for (const output of agentState.outputs) {
          expect(output).toMatch(new RegExp(`${segment.segmentId}|${segment.shotIds.join('|')}`))
        }
      }
    }

    const screenplayAgent = blackboard.agents.find((agent) => agent.role === 'screenplay-agent')
    const cinematographyAgent = blackboard.agents.find((agent) => agent.role === 'cinematography-agent')
    const continuityAgent = blackboard.agents.find((agent) => agent.role === 'continuity-agent')
    expect(screenplayAgent?.outputs.join('\n')).toMatch(/shot-kiosk|shot-crane|shot-platform/)
    expect(cinematographyAgent?.outputs.join('\n')).toMatch(/camera|motion|composition|lighting/i)
    expect(continuityAgent?.outputs.join('\n')).toMatch(/repairman|station|music box|paper crane/i)
  })
})
