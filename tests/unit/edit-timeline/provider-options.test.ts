import { describe, expect, it } from 'vitest'
import { validateAiOptions } from '@/lib/ai-exec/normalize'
import { buildMediaOptionSchema } from '@/lib/ai-providers/shared/option-schema'
import {
  compileEditTimelineToExecutablePlan,
  mapControlPayloadToVideoProviderInput,
  type EditTimeline,
} from '@/lib/edit-timeline'

function readStepInput(stepInput: unknown): Record<string, unknown> {
  if (!stepInput || typeof stepInput !== 'object' || Array.isArray(stepInput)) {
    throw new Error('expected plan step input object')
  }
  return stepInput as Record<string, unknown>
}

const timeline: EditTimeline = {
  id: 'timeline-provider-contract',
  title: 'Provider payload contract',
  aspectRatio: '16:9',
  fps: 24,
  segments: [
    {
      id: 'seg-1',
      label: 'Single controllable beat',
      startMs: 0,
      durationMs: 8_000,
      intent: 'Prove edit-first controls can reach provider execution.',
      shotIds: ['shot-1'],
    },
  ],
  shots: [
    {
      id: 'shot-1',
      segmentId: 'seg-1',
      title: 'Cross hallway',
      goal: 'The subject crosses a hallway with locked camera motion.',
      track: 'video',
      order: 1,
      startMs: 0,
      durationMs: 8_000,
      dependsOn: [],
      referenceIds: [],
      control: {
        prompt: 'The subject crosses the hallway.',
        durationSeconds: 8,
        firstFrameRef: 'media:first-frame',
        lastFrameRef: 'media:last-frame',
        characterRefIds: ['character:ava'],
        performanceRefIds: ['performance:walk'],
        cameraMotion: 'locked camera',
        subjectMotion: 'the subject walks from left to right',
        sceneMotion: 'fluorescent lights flicker subtly',
        negativePrompt: 'no washed-out frames',
        providerHints: {
          modelPreference: 'fast-preview',
        },
      },
    },
  ],
  references: [],
}

describe('edit-first video provider option mapping', () => {
  it('maps compiled controlPayload into current video provider execution input without leaking timeline-only keys', () => {
    const plan = compileEditTimelineToExecutablePlan(timeline, {
      skillId: 'media-generation',
      materializeOperationId: 'generate_panel_video',
    })
    const stepInput = readStepInput(plan.steps[0].input)

    const mapped = mapControlPayloadToVideoProviderInput(stepInput.controlPayload)

    expect(mapped).toEqual({
      executionMode: 'firstlastframe',
      imageUrl: 'media:first-frame',
      options: {
        prompt: [
          'The subject crosses the hallway.',
          'the subject walks from left to right',
          'locked camera',
          'fluorescent lights flicker subtly',
        ].join('\n'),
        duration: 8,
        aspectRatio: '16:9',
        lastFrameImageUrl: 'media:last-frame',
      },
      retainedTimelineControls: {
        characterRefIds: ['character:ava'],
        performanceRefIds: ['performance:walk'],
        negativePrompt: 'no washed-out frames',
        providerHints: {
          modelPreference: 'fast-preview',
        },
      },
    })
    expect(Object.keys(mapped.options).sort()).toEqual([
      'aspectRatio',
      'duration',
      'lastFrameImageUrl',
      'prompt',
    ])
    expect(JSON.stringify(mapped.options)).not.toContain('no washed-out frames')
    expect(() => validateAiOptions({
      schema: buildMediaOptionSchema('video'),
      options: mapped.options,
      context: 'edit-timeline:video-provider',
    })).not.toThrow()
  })

  it('fails explicitly instead of dropping unsupported frame controls that the current video provider schema cannot carry', () => {
    expect(() => mapControlPayloadToVideoProviderInput({
      prompt: 'The subject turns around.',
      referenceImageRefs: ['media:style-reference'],
    })).toThrow('EDIT_TIMELINE_VIDEO_PROVIDER_UNSUPPORTED_CONTROL:referenceImageRefs')

    expect(() => mapControlPayloadToVideoProviderInput({
      prompt: 'The subject turns around.',
      durationSeconds: 4.5,
    })).toThrow('EDIT_TIMELINE_VIDEO_PROVIDER_DURATION_NON_INTEGER:4.5')
  })

  it('fails explicitly when a last frame is provided without a first frame', () => {
    expect(() => mapControlPayloadToVideoProviderInput({
      prompt: 'The subject reaches the door.',
      lastFrameRef: 'media:last-frame',
    })).toThrow('EDIT_TIMELINE_VIDEO_PROVIDER_LAST_FRAME_REQUIRES_FIRST_FRAME')
  })
})
