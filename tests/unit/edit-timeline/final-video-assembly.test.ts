import { describe, expect, it } from 'vitest'
import type { EditTimeline } from '@/lib/edit-timeline'
import {
  buildTimelineVideoEditorProject,
  type TimelinePanelVideoSource,
} from '@/lib/edit-timeline/final-video-assembly'

const productDemoTimeline: EditTimeline = {
  id: 'timeline-product-demo',
  title: 'Coffee machine product demo',
  aspectRatio: '16:9',
  fps: 24,
  segments: [
    {
      id: 'seg-setup',
      label: 'Setup',
      startMs: 0,
      durationMs: 4_000,
      intent: 'Show the machine receiving beans.',
      shotIds: ['shot-beans'],
    },
    {
      id: 'seg-output',
      label: 'Output',
      startMs: 4_000,
      durationMs: 4_000,
      intent: 'Show the coffee pouring into a cup.',
      shotIds: ['shot-pour'],
    },
  ],
  shots: [
    {
      id: 'shot-beans',
      segmentId: 'seg-setup',
      title: 'Beans enter grinder',
      goal: 'Show beans dropping into the grinder.',
      track: 'video',
      order: 1,
      startMs: 0,
      durationMs: 4_000,
      dependsOn: [],
      inputArtifacts: [],
      outputArtifacts: [],
      referenceIds: [],
      editorial: {
        visual: 'Macro shot of beans entering the grinder.',
        story: 'Establish the first product step.',
        sound: 'Soft grinder startup.',
        caption: 'Fresh beans in.',
      },
      control: {
        prompt: 'Macro shot of beans entering a coffee grinder.',
        durationSeconds: 4,
        aspectRatio: '16:9',
        referenceImageRefs: [],
        characterRefIds: [],
        performanceRefIds: [],
      },
    },
    {
      id: 'shot-pour',
      segmentId: 'seg-output',
      title: 'Coffee pours',
      goal: 'Show finished coffee pouring into a glass cup.',
      track: 'video',
      order: 2,
      startMs: 4_000,
      durationMs: 4_000,
      dependsOn: ['shot-beans'],
      inputArtifacts: [],
      outputArtifacts: [],
      referenceIds: [],
      editorial: {
        visual: 'Clean hero shot of coffee pouring into a clear cup.',
        story: 'Complete the product promise.',
        sound: 'Warm pour and soft finish.',
        caption: 'One tap, ready.',
      },
      control: {
        prompt: 'Clean product shot of coffee pouring into a cup.',
        durationSeconds: 4,
        aspectRatio: '16:9',
        referenceImageRefs: [],
        characterRefIds: [],
        performanceRefIds: [],
      },
    },
  ],
  references: [],
  continuityBible: {},
}

const panelVideos: TimelinePanelVideoSource[] = [
  {
    shotId: 'shot-beans',
    panelId: 'panel-beans',
    storyboardId: 'storyboard-product',
    panelIndex: 0,
    videoUrl: '/api/files/videos/panel-beans.mp4',
  },
  {
    shotId: 'shot-pour',
    panelId: 'panel-pour',
    storyboardId: 'storyboard-product',
    panelIndex: 1,
    videoUrl: '/api/files/videos/panel-pour.mp4',
  },
]

describe('final video assembly helpers', () => {
  it('builds a generic video editor project from shot-bound provider artifacts', () => {
    const project = buildTimelineVideoEditorProject({
      episodeId: 'episode-product',
      timeline: productDemoTimeline,
      panelVideos,
      editorProjectId: 'editor-product',
    })

    expect(project).toMatchObject({
      id: 'editor-product',
      episodeId: 'episode-product',
      schemaVersion: '1.0',
      config: {
        fps: 24,
        width: 1920,
        height: 1080,
      },
    })
    expect(project.timeline).toEqual([
      expect.objectContaining({
        id: 'clip-shot-beans',
        src: '/api/files/videos/panel-beans.mp4',
        durationInFrames: 96,
        attachment: {
          subtitle: {
            text: 'Fresh beans in.',
            style: 'cinematic',
          },
        },
        metadata: {
          panelId: 'panel-beans',
          storyboardId: 'storyboard-product',
          description: 'Show beans dropping into the grinder.',
        },
      }),
      expect.objectContaining({
        id: 'clip-shot-pour',
        src: '/api/files/videos/panel-pour.mp4',
        durationInFrames: 96,
        attachment: {
          subtitle: {
            text: 'One tap, ready.',
            style: 'cinematic',
          },
        },
        metadata: {
          panelId: 'panel-pour',
          storyboardId: 'storyboard-product',
          description: 'Show finished coffee pouring into a glass cup.',
        },
      }),
    ])
    expect(JSON.stringify(project)).not.toContain('刚毕业')
    expect(JSON.stringify(project)).not.toContain('深夜办公室')
  })

  it('explicitly fails when a shot has no completed provider video artifact', () => {
    expect(() => buildTimelineVideoEditorProject({
      episodeId: 'episode-product',
      timeline: productDemoTimeline,
      panelVideos: panelVideos.slice(0, 1),
    })).toThrow('EDIT_TIMELINE_FINAL_VIDEO_PANEL_VIDEO_MISSING:shot-pour')
  })
})
