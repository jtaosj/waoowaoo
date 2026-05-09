import { describe, expect, it } from 'vitest'
import {
  buildEditTimelineConfirmationSummary,
  compileEditTimelineToExecutablePlan,
  type EditTimeline,
} from '@/lib/edit-timeline'

const timeline: EditTimeline = {
  id: 'timeline-confirmation',
  title: 'Glass door reversal',
  aspectRatio: '9:16',
  fps: 24,
  segments: [
    {
      id: 'seg-hook',
      label: 'Hook and reveal',
      startMs: 0,
      durationMs: 15_000,
      intent: 'Mislead the viewer and then reveal the hidden witness.',
      shotIds: ['shot-hook', 'shot-reveal'],
    },
  ],
  shots: [
    {
      id: 'shot-hook',
      segmentId: 'seg-hook',
      title: 'Wrong clue',
      goal: 'The lead finds a receipt that points to the wrong suspect.',
      track: 'video',
      order: 1,
      startMs: 0,
      durationMs: 7_000,
      dependsOn: [],
      referenceIds: ['character-lead'],
      control: {
        prompt: 'Close shot of the lead finding the receipt.',
        firstFrameRef: 'media:first-frame',
      },
    },
    {
      id: 'shot-reveal',
      segmentId: 'seg-hook',
      title: 'Witness reveal',
      goal: 'The witness steps out from behind the glass door.',
      track: 'video',
      order: 2,
      startMs: 7_000,
      durationMs: 8_000,
      dependsOn: ['shot-hook'],
      referenceIds: ['character-lead', 'location-room'],
      control: {
        prompt: 'Medium reveal of the witness stepping out.',
        firstFrameRef: 'media:reveal-start',
        lastFrameRef: 'media:reveal-end',
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
    {
      id: 'location-room',
      kind: 'location',
      label: 'Apartment room',
      artifactRef: 'artifact:apartment-room',
    },
  ],
}

describe('edit-first confirmation summary', () => {
  it('summarizes the real provider task draft the user is about to confirm', () => {
    const plan = compileEditTimelineToExecutablePlan(timeline, {
      skillId: 'media-generation',
      materializeOperationId: 'generate_panel_video',
    })

    const summary = buildEditTimelineConfirmationSummary({
      timeline,
      plan,
      materializedRefs: {
        'media:first-frame': 'https://cdn.example/start.png',
        'media:reveal-start': 'https://cdn.example/reveal-start.png',
        'media:reveal-end': 'https://cdn.example/reveal-end.png',
        'media:lead-ref': 'https://cdn.example/lead.png',
        'artifact:apartment-room': 'https://cdn.example/room.png',
      },
    })

    expect(summary).toMatchObject({
      timelineId: 'timeline-confirmation',
      timelineTitle: 'Glass door reversal',
      totalDurationMs: 15_000,
      aspectRatio: '9:16',
      segmentCount: 1,
      shotCount: 2,
      providerTaskCount: 2,
      blockers: [],
      effects: {
        billable: true,
        externalSideEffects: true,
        longRunning: true,
      },
      redoCandidates: ['shot-hook', 'shot-reveal'],
    })
    expect(summary.shots).toEqual([
      expect.objectContaining({
        shotId: 'shot-hook',
        shotTitle: 'Wrong clue',
        providerMode: 'first-frame',
        operationId: 'generate_panel_video',
        referenceIds: ['character-lead'],
        firstFrame: {
          ref: 'media:first-frame',
          resolvedRef: 'https://cdn.example/start.png',
          status: 'ready',
        },
      }),
      expect.objectContaining({
        shotId: 'shot-reveal',
        shotTitle: 'Witness reveal',
        providerMode: 'first-last-frame',
        operationId: 'generate_panel_video',
        lastFrame: {
          ref: 'media:reveal-end',
          resolvedRef: 'https://cdn.example/reveal-end.png',
          status: 'ready',
        },
      }),
    ])
  })

  it('surfaces unresolved symbolic terminal frames as blockers instead of hiding them', () => {
    const plan = compileEditTimelineToExecutablePlan(timeline, {
      skillId: 'media-generation',
      materializeOperationId: 'generate_panel_video',
    })

    const summary = buildEditTimelineConfirmationSummary({
      timeline,
      plan,
      materializedRefs: {
        'media:first-frame': 'https://cdn.example/start.png',
        'media:reveal-start': 'https://cdn.example/reveal-start.png',
        'media:lead-ref': 'https://cdn.example/lead.png',
        'artifact:apartment-room': 'https://cdn.example/room.png',
      },
    })

    expect(summary.blockers).toEqual([
      {
        code: 'EDIT_TIMELINE_LAST_FRAME_UNRESOLVED',
        message: 'EDIT_TIMELINE_LAST_FRAME_UNRESOLVED:shot-reveal:media:reveal-end',
      },
    ])
    expect(summary.shots[1]?.lastFrame).toMatchObject({
      ref: 'media:reveal-end',
      status: 'unresolved',
    })
  })
})
