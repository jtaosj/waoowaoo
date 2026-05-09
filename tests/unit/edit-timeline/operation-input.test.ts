import { describe, expect, it } from 'vitest'
import {
  buildGeneratePanelVideoInputFromControl,
  buildGeneratePanelVideoInputFromEditFirstStepInput,
  compileEditTimelineToExecutablePlan,
  type EditTimeline,
} from '@/lib/edit-timeline'

function readStepInput(stepInput: unknown): Record<string, unknown> {
  if (!stepInput || typeof stepInput !== 'object' || Array.isArray(stepInput)) {
    throw new Error('expected plan step input object')
  }
  return stepInput as Record<string, unknown>
}

const timeline: EditTimeline = {
  id: 'timeline-operation-input',
  title: 'Operation input bridge',
  aspectRatio: '16:9',
  fps: 24,
  segments: [
    {
      id: 'seg-1',
      label: 'Bridge beat',
      startMs: 0,
      durationMs: 8_000,
      intent: 'Bridge edit-first controls into an executable video task.',
      shotIds: ['shot-1'],
    },
  ],
  shots: [
    {
      id: 'shot-1',
      segmentId: 'seg-1',
      title: 'Reach the terminal pose',
      goal: 'The subject arrives at the exact terminal composition.',
      track: 'video',
      order: 1,
      startMs: 0,
      durationMs: 8_000,
      dependsOn: [],
      referenceIds: [],
      control: {
        prompt: 'A precise motion bridge between the two frames.',
        durationSeconds: 8,
        firstFrameRef: 'media:first-frame',
        lastFrameRef: 'media:last-frame',
        cameraMotion: 'slow push-in',
        subjectMotion: 'the subject reaches the marked position',
      },
    },
  ],
  references: [],
}

function readControlPayload(): unknown {
  const plan = compileEditTimelineToExecutablePlan(timeline, {
    skillId: 'media-generation',
    materializeOperationId: 'generate_panel_video',
  })
  const stepInput = readStepInput(plan.steps[0].input)
  return stepInput.controlPayload
}

describe('edit-first generate_panel_video operation input builder', () => {
  it('materializes first-last-frame controls into the task envelope without leaking timeline refs into generationOptions', () => {
    const operationInput = buildGeneratePanelVideoInputFromControl({
      confirmed: true,
      target: { panelId: 'panel-1' },
      videoModel: 'google::veo-3.1-generate-preview',
      firstLastFrameModel: 'google::veo-3.1-generate-preview',
      sourceFrameRef: 'media:first-frame',
      mediaRefs: {
        'media:last-frame': 'https://cdn.example/terminal-frame.png',
      },
      controlPayload: readControlPayload(),
    })

    expect(operationInput).toEqual({
      confirmed: true,
      panelId: 'panel-1',
      videoModel: 'google::veo-3.1-generate-preview',
      firstLastFrame: {
        flModel: 'google::veo-3.1-generate-preview',
        lastFrameImageUrl: 'https://cdn.example/terminal-frame.png',
        customPrompt: [
          'A precise motion bridge between the two frames.',
          'the subject reaches the marked position',
          'slow push-in',
        ].join('\n'),
      },
      generationOptions: {
        duration: 8,
        aspectRatio: '16:9',
      },
    })
    expect(operationInput.generationOptions).not.toHaveProperty('lastFrameImageUrl')
    expect(JSON.stringify(operationInput.generationOptions)).not.toContain('media:last-frame')
    expect(JSON.stringify(operationInput)).not.toContain('media:last-frame')
  })

  it('fails explicitly when symbolic terminal frame material is not resolved', () => {
    expect(() => buildGeneratePanelVideoInputFromControl({
      target: { panelId: 'panel-1' },
      videoModel: 'google::veo-3.1-generate-preview',
      firstLastFrameModel: 'google::veo-3.1-generate-preview',
      sourceFrameRef: 'media:first-frame',
      mediaRefs: {},
      controlPayload: readControlPayload(),
    })).toThrow('EDIT_TIMELINE_GENERATE_PANEL_VIDEO_LAST_FRAME_UNRESOLVED:media:last-frame')
  })

  it('fails explicitly when a terminal frame is requested without a first frame', () => {
    expect(() => buildGeneratePanelVideoInputFromControl({
      target: { panelId: 'panel-1' },
      videoModel: 'google::veo-3.1-generate-preview',
      firstLastFrameModel: 'google::veo-3.1-generate-preview',
      mediaRefs: {
        'media:last-frame': 'https://cdn.example/terminal-frame.png',
      },
      controlPayload: {
        prompt: 'A first-last-frame shot with a missing source frame.',
        durationSeconds: 8,
        aspectRatio: '16:9',
        lastFrameRef: 'media:last-frame',
      },
    })).toThrow('EDIT_TIMELINE_VIDEO_PROVIDER_LAST_FRAME_REQUIRES_FIRST_FRAME')
  })

  it('preserves explicit edit-first generationOptions and lets them override control-derived options', () => {
    const operationInput = buildGeneratePanelVideoInputFromEditFirstStepInput({
      panelId: 'panel-1',
      videoModel: 'google::veo-3.1-generate-preview',
      generationOptions: {
        duration: 5,
        resolution: '720p',
        generateAudio: false,
      },
      controlPayload: {
        prompt: 'A direct text-to-video shot.',
        negativePrompt: 'no blank frame',
        durationSeconds: 8,
        aspectRatio: '16:9',
      },
    })

    expect(operationInput).toMatchObject({
      panelId: 'panel-1',
      videoModel: 'google::veo-3.1-generate-preview',
      customPrompt: 'A direct text-to-video shot.',
      generationOptions: {
        duration: 5,
        aspectRatio: '16:9',
        resolution: '720p',
        generateAudio: false,
      },
    })
    expect(JSON.stringify(operationInput)).not.toContain('no blank frame')
  })

  it('fails explicitly when edit-first generationOptions contain non-scalar values', () => {
    expect(() => buildGeneratePanelVideoInputFromEditFirstStepInput({
      panelId: 'panel-1',
      videoModel: 'google::veo-3.1-generate-preview',
      generationOptions: {
        resolution: '720p',
        nested: { value: 'bad' },
      },
      controlPayload: {
        prompt: 'A direct text-to-video shot.',
        durationSeconds: 8,
        aspectRatio: '16:9',
      },
    })).toThrow('EDIT_TIMELINE_GENERATE_PANEL_VIDEO_GENERATION_OPTIONS_INVALID:nested')

    expect(() => buildGeneratePanelVideoInputFromEditFirstStepInput({
      panelId: 'panel-1',
      videoModel: 'google::veo-3.1-generate-preview',
      generationOptions: {
        generateAudio: null,
      },
      controlPayload: {
        prompt: 'A direct text-to-video shot.',
        durationSeconds: 8,
        aspectRatio: '16:9',
      },
    })).toThrow('EDIT_TIMELINE_GENERATE_PANEL_VIDEO_GENERATION_OPTIONS_INVALID:generateAudio')
  })
})
