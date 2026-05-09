import { describe, expect, it } from 'vitest'
import { ARTIFACT_TYPES } from '@/lib/artifact-system/types'
import {
  compileEditTimelineToExecutablePlan,
  parseEditTimeline,
  type EditTimeline,
} from '@/lib/edit-timeline'

const baseTimeline: EditTimeline = {
  id: 'timeline-1',
  title: 'Pilot cold open',
  aspectRatio: '16:9',
  fps: 24,
  segments: [
    {
      id: 'seg-opening',
      label: 'Opening hook',
      startMs: 0,
      durationMs: 10_000,
      intent: 'Establish the mystery before dialogue explains it.',
      shotIds: ['open-shot', 'reveal-shot'],
    },
  ],
  shots: [
    {
      id: 'open-shot',
      segmentId: 'seg-opening',
      title: 'Door opens',
      goal: 'A quiet door opens into bright corridor light.',
      track: 'video',
      order: 1,
      startMs: 0,
      durationMs: 5_000,
      dependsOn: [],
      referenceIds: ['character-ava', 'style-noir'],
      control: {
        prompt: 'Slow dolly toward an opening door, restrained noir lighting.',
        firstFrameRef: 'media:first-frame',
        cameraMotion: 'slow dolly in',
        providerHints: {
          model: 'veo-fast-preview',
        },
      },
    },
    {
      id: 'reveal-shot',
      segmentId: 'seg-opening',
      title: 'Ava reveal',
      goal: 'Ava steps into the light without breaking identity continuity.',
      track: 'video',
      order: 2,
      startMs: 5_000,
      durationMs: 5_000,
      dependsOn: ['open-shot'],
      referenceIds: ['character-ava', 'location-hallway'],
      control: {
        prompt: 'Medium reveal of Ava entering the corridor light.',
        lastFrameRef: 'media:last-frame',
        characterRefIds: ['character-ava'],
        cameraMotion: 'locked medium shot',
      },
    },
  ],
  references: [
    {
      id: 'character-ava',
      kind: 'character',
      label: 'Ava identity reference',
      artifactRef: 'media:ava-ref',
    },
    {
      id: 'style-noir',
      kind: 'style',
      label: 'Noir lighting board',
      artifactRef: 'artifact:style-noir',
    },
    {
      id: 'location-hallway',
      kind: 'location',
      label: 'Hospital hallway',
      artifactRef: 'artifact:hallway',
    },
  ],
  continuityBible: {
    characters: ['Ava keeps the same face, coat, and calm posture.'],
    locations: ['The corridor light direction stays consistent.'],
    visualRules: ['No handheld shake in this segment.'],
    audioRules: ['Keep the room tone under dialogue level.'],
  },
}

describe('edit-first timeline compiler', () => {
  it('compiles shot nodes into executable PlanRun steps with timeline controls and dependencies', () => {
    const plan = compileEditTimelineToExecutablePlan(baseTimeline, {
      skillId: 'media-generation',
      materializeOperationId: 'generate_panel_video',
    })

    expect(plan.goal).toBe('Edit-first timeline: Pilot cold open')
    expect(plan.steps).toHaveLength(2)
    expect(plan.steps[0]).toMatchObject({
      stepKey: 'shot_open_shot_materialize',
      skillId: 'media-generation',
      operationId: 'generate_panel_video',
      outputArtifacts: [ARTIFACT_TYPES.PANEL_VIDEO],
    })
    expect(plan.steps[0].input).toMatchObject({
      editFirst: true,
      timelineId: 'timeline-1',
      segmentId: 'seg-opening',
      shotId: 'open-shot',
      referenceIds: ['character-ava', 'style-noir'],
      shotGoal: 'A quiet door opens into bright corridor light.',
      durationSeconds: 5,
      controlPayload: expect.objectContaining({
        prompt: 'Slow dolly toward an opening door, restrained noir lighting.',
        durationSeconds: 5,
        firstFrameRef: 'media:first-frame',
      }),
      references: [
        expect.objectContaining({ id: 'character-ava' }),
        expect.objectContaining({ id: 'style-noir' }),
      ],
      continuityBible: baseTimeline.continuityBible,
    })
    expect(plan.steps[1]).toMatchObject({
      stepKey: 'shot_reveal_shot_materialize',
      dependsOn: ['shot_open_shot_materialize'],
      outputArtifacts: [ARTIFACT_TYPES.PANEL_VIDEO],
    })
  })

  it('passes explicit provider video targets into materialization step inputs', () => {
    const plan = compileEditTimelineToExecutablePlan(baseTimeline, {
      skillId: 'media-generation',
      materializeOperationId: 'generate_panel_video',
      materializeInput: {
        common: {
          videoModel: 'google::veo-3.1-generate-preview',
          generationOptions: {
            duration: 2,
            resolution: '480p',
          },
        },
        byShotId: {
          'open-shot': {
            panelId: 'panel-open',
          },
          'reveal-shot': {
            panelId: 'panel-reveal',
          },
        },
      },
    })

    expect(plan.steps[0].input).toMatchObject({
      editFirst: true,
      shotId: 'open-shot',
      panelId: 'panel-open',
      videoModel: 'google::veo-3.1-generate-preview',
      generationOptions: {
        duration: 2,
        resolution: '480p',
      },
    })
    expect(plan.steps[1].input).toMatchObject({
      editFirst: true,
      shotId: 'reveal-shot',
      panelId: 'panel-reveal',
      videoModel: 'google::veo-3.1-generate-preview',
    })
  })

  it('adds evaluation steps after materialization when an evaluation operation is provided', () => {
    const plan = compileEditTimelineToExecutablePlan(baseTimeline, {
      skillId: 'media-generation',
      materializeOperationId: 'generate_panel_video',
      evaluateOperationId: 'evaluate_panel_video_against_timeline',
    })

    expect(plan.steps.map((step) => step.stepKey)).toEqual([
      'shot_open_shot_materialize',
      'shot_open_shot_evaluate',
      'shot_reveal_shot_materialize',
      'shot_reveal_shot_evaluate',
    ])
    expect(plan.steps[1]).toMatchObject({
      stepKey: 'shot_open_shot_evaluate',
      dependsOn: ['shot_open_shot_materialize'],
      outputArtifacts: [ARTIFACT_TYPES.SHOT_PLAN],
    })
    expect(plan.steps[2]).toMatchObject({
      stepKey: 'shot_reveal_shot_materialize',
      dependsOn: ['shot_open_shot_materialize'],
    })
    expect(plan.steps[3].input).toMatchObject({
      editFirst: true,
      timelineId: 'timeline-1',
      shotId: 'reveal-shot',
      materializeStepKey: 'shot_reveal_shot_materialize',
    })
  })

  it('fails explicitly when a shot references an unknown dependency', () => {
    const timeline = {
      ...baseTimeline,
      shots: [
        {
          ...baseTimeline.shots[0],
          dependsOn: ['missing-shot'],
        },
      ],
    }

    expect(() => parseEditTimeline(timeline)).toThrow(
      'EDIT_TIMELINE_UNKNOWN_SHOT_DEPENDENCY:open-shot:missing-shot',
    )
  })

  it('fails explicitly when segment shot lists reference a missing shot', () => {
    const timeline = {
      ...baseTimeline,
      segments: [
        {
          ...baseTimeline.segments[0],
          shotIds: ['open-shot', 'missing-shot'],
        },
      ],
    }

    expect(() => parseEditTimeline(timeline)).toThrow(
      'EDIT_TIMELINE_UNKNOWN_SEGMENT_SHOT:seg-opening:missing-shot',
    )
  })

  it('fails explicitly when a shot is not listed in its segment shotIds', () => {
    const timeline = {
      ...baseTimeline,
      segments: [
        {
          ...baseTimeline.segments[0],
          shotIds: ['open-shot'],
        },
      ],
    }

    expect(() => parseEditTimeline(timeline)).toThrow(
      'EDIT_TIMELINE_SHOT_NOT_LISTED_IN_SEGMENT:reveal-shot:seg-opening',
    )
  })

  it('fails explicitly when a shot time range extends past its segment range', () => {
    const timeline = {
      ...baseTimeline,
      segments: [
        {
          ...baseTimeline.segments[0],
          durationMs: 9_000,
        },
      ],
    }

    expect(() => parseEditTimeline(timeline)).toThrow(
      'EDIT_TIMELINE_SHOT_END_AFTER_SEGMENT:reveal-shot:seg-opening',
    )
  })
})
