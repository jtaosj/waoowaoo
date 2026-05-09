import { describe, expect, it } from 'vitest'
import type { ProjectClip, ProjectPanel, ProjectShot, ProjectStoryboard } from '@/types/project'
import {
  buildWorkspaceNodeCanvasProjection,
} from '@/features/project-workspace/canvas/hooks/useWorkspaceNodeCanvasProjection'
import type { EditTimelinePartData } from '@/lib/project-agent/types'

function t(key: string, values?: Record<string, string | number>): string {
  if (!values) return key
  return `${key}:${JSON.stringify(values)}`
}

function createClip(id: string, content: string): ProjectClip {
  return {
    id,
    summary: `${id} summary`,
    location: null,
    characters: null,
    props: null,
    content,
    screenplay: null,
  }
}

function createShot(id: string, shotId: string): ProjectShot {
  return {
    id,
    shotId,
    srtStart: 1,
    srtEnd: 3,
    srtDuration: 2,
    sequence: 'prompt sequence',
    locations: 'prompt location',
    characters: 'prompt character',
    plot: 'prompt plot',
    pov: 'prompt pov',
    imagePrompt: 'prompt image text',
    scale: 'medium',
    module: 'module-a',
    focus: 'robot light',
    zhSummarize: 'prompt summary',
    imageUrl: null,
    media: null,
  }
}

function createPanel(input: Partial<ProjectPanel> & Pick<ProjectPanel, 'id' | 'panelIndex'>): ProjectPanel {
  return {
    id: input.id,
    storyboardId: input.storyboardId ?? 'storyboard-1',
    panelIndex: input.panelIndex,
    panelNumber: input.panelNumber ?? input.panelIndex + 1,
    shotType: input.shotType ?? null,
    cameraMove: input.cameraMove ?? null,
    description: input.description ?? null,
    location: input.location ?? null,
    characters: input.characters ?? null,
    props: input.props ?? null,
    srtSegment: input.srtSegment ?? null,
    srtStart: input.srtStart ?? null,
    srtEnd: input.srtEnd ?? null,
    duration: input.duration ?? null,
    imagePrompt: input.imagePrompt ?? null,
    imageUrl: input.imageUrl ?? null,
    candidateImages: input.candidateImages ?? null,
    media: input.media ?? null,
    imageHistory: input.imageHistory ?? null,
    videoPrompt: input.videoPrompt ?? null,
    firstLastFramePrompt: input.firstLastFramePrompt ?? null,
    videoUrl: input.videoUrl ?? null,
    videoModel: input.videoModel ?? null,
    videoErrorCode: input.videoErrorCode ?? null,
    videoErrorMessage: input.videoErrorMessage ?? null,
    videoGenerationMode: input.videoGenerationMode ?? null,
    lastVideoGenerationOptions: input.lastVideoGenerationOptions ?? null,
    videoMedia: input.videoMedia ?? null,
    lipSyncVideoUrl: input.lipSyncVideoUrl ?? null,
    lipSyncVideoMedia: input.lipSyncVideoMedia ?? null,
    lipSyncErrorCode: input.lipSyncErrorCode ?? null,
    lipSyncErrorMessage: input.lipSyncErrorMessage ?? null,
    linkedToNextPanel: input.linkedToNextPanel ?? null,
    sketchImageUrl: input.sketchImageUrl ?? null,
    sketchImageMedia: input.sketchImageMedia ?? null,
    previousImageUrl: input.previousImageUrl ?? null,
    previousImageMedia: input.previousImageMedia ?? null,
    photographyRules: input.photographyRules ?? null,
    actingNotes: input.actingNotes ?? null,
    imageTaskRunning: input.imageTaskRunning ?? false,
    videoTaskRunning: input.videoTaskRunning ?? false,
    imageErrorMessage: input.imageErrorMessage ?? null,
  }
}

function createStoryboard(input: {
  readonly id: string
  readonly clipId: string
  readonly panels: ProjectPanel[]
}): ProjectStoryboard {
  return {
    id: input.id,
    episodeId: 'episode-1',
    clipId: input.clipId,
    storyboardTextJson: null,
    panelCount: input.panels.length,
    storyboardImageUrl: null,
    candidateImages: null,
    lastError: null,
    photographyPlan: null,
    panels: input.panels,
  }
}

function createEditTimelineData(): EditTimelinePartData {
  return {
    sourceStory: '客户原文：她在凌晨三点的办公室里快要放弃，直到屏幕上的第一支 AI 短片让她重新想起自己为什么创作。',
    timeline: {
      id: 'timeline-canvas-test',
      title: '深夜创作反转',
      aspectRatio: '9:16',
      fps: 24,
      segments: [
        {
          id: 'seg-pressure',
          label: '压抑开场',
          startMs: 0,
          durationMs: 3_000,
          intent: '表现压抑、疲惫、被工作困住。',
          shotIds: ['shot-pressure'],
        },
        {
          id: 'seg-return',
          label: '重新点亮',
          startMs: 3_000,
          durationMs: 3_000,
          intent: '第一支 AI 短片让创作欲望回来。',
          shotIds: ['shot-return'],
        },
      ],
      shots: [
        {
          id: 'shot-pressure',
          segmentId: 'seg-pressure',
          title: '深夜办公室',
          goal: '表现压抑、疲惫、被工作困住。',
          track: 'video',
          order: 1,
          startMs: 0,
          durationMs: 3_000,
          dependsOn: [],
          inputArtifacts: [],
          outputArtifacts: [],
          referenceIds: [],
          editorial: {
            visual: '深夜办公室，女生坐在电脑前，窗外下雨。',
            story: '表现压抑、疲惫、被工作困住。',
            sound: '低频环境音、雨声、键盘声。',
            caption: '我好像快忘了，自己为什么想创作。',
          },
          control: {
            prompt: '深夜办公室。',
            referenceImageRefs: [],
            characterRefIds: [],
            performanceRefIds: [],
          },
        },
        {
          id: 'shot-return',
          segmentId: 'seg-return',
          title: '屏幕点亮',
          goal: '重新找回创作欲。',
          track: 'video',
          order: 2,
          startMs: 3_000,
          durationMs: 3_000,
          dependsOn: [],
          inputArtifacts: [],
          outputArtifacts: [],
          referenceIds: [],
          editorial: {
            visual: '屏幕暖光照亮她的脸。',
            story: '她被第一支短片重新打动。',
            sound: '音乐从低落转明亮。',
            caption: '原来我还想继续。',
          },
          control: {
            prompt: '屏幕暖光。',
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
    estimatedTaskCount: 1,
    agentCrew: {
      director: {
        agentId: 'main-director',
        role: 'main-director',
        title: '主 Agent',
        mission: '理解故事并分发任务。',
        summary: '主 Agent 已拆出压抑开场。',
        shotIds: ['shot-pressure', 'shot-return'],
        outputs: [
          { shotId: 'shot-pressure', text: '0-3s 压抑开场。' },
          { shotId: 'shot-return', text: '3-6s 重新点亮。' },
        ],
        status: 'drafted',
      },
      subagents: [
        {
          agentId: 'visual-director',
          role: 'visual-director',
          title: '画面 Agent',
          mission: '负责画面描述。',
          summary: '画面 Agent 负责办公室和雨夜氛围。',
          shotIds: ['shot-pressure', 'shot-return'],
          outputs: [
            { shotId: 'shot-pressure', text: '深夜办公室，窗外下雨。' },
            { shotId: 'shot-return', text: '屏幕暖光照亮她的脸。' },
          ],
          status: 'drafted',
        },
      ],
      synthesis: '主 Agent 综合专业 Agent 输出。',
    },
  }
}

describe('workspace node canvas projection', () => {
  it('shows only the story input node when the episode has no story data', () => {
    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: '',
      clips: [],
      storyboards: [],
      savedLayouts: [],
      translate: t,
    })

    expect(projection.nodes.map((node) => node.id)).toEqual(['story:episode-1'])
    expect(projection.edges).toEqual([])
    expect(projection.nodes[0].data.action).toBeUndefined()
  })

  it('projects real story, clips, shots, image nodes, video nodes, and final timeline without mock data', () => {
    const finalVideoUrl = '/api/final-video/editor-final.mp4'
    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: 'A real story',
      clips: [
        createClip('clip-1', 'first clip content'),
        createClip('clip-2', 'second clip content'),
      ],
      storyboards: [
        createStoryboard({
          id: 'storyboard-1',
          clipId: 'clip-1',
          panels: [
            createPanel({
              id: 'panel-2',
              panelIndex: 1,
              description: 'second panel',
              videoUrl: 'https://example.com/panel-2.mp4',
            }),
            createPanel({
              id: 'panel-1',
              panelIndex: 0,
              description: 'first panel',
              imageUrl: 'https://example.com/panel-1.png',
            }),
          ],
        }),
      ],
      finalVideo: {
        editorProjectId: 'editor-final',
        url: finalVideoUrl,
        status: 'completed',
        updatedAt: '2026-05-09T12:00:00.000Z',
      },
      savedLayouts: [],
      translate: t,
    })

    expect(projection.nodes.map((node) => node.id)).toEqual([
      'story:episode-1',
      'analysis:episode-1',
      'clip:clip-1',
      'clip:clip-2',
      'shot:panel-1',
      'shot:panel-2',
      'image:panel-1',
      'video:panel-1',
      'video:panel-2',
      'final:episode-1',
    ])
    expect(projection.edges.map((edge) => `${edge.source}->${edge.target}`)).toContain('story:episode-1->analysis:episode-1')
    expect(projection.edges.map((edge) => `${edge.source}->${edge.target}`)).toContain('clip:clip-1->shot:panel-1')
    expect(projection.edges.map((edge) => `${edge.source}->${edge.target}`)).toContain('video:panel-2->final:episode-1')

    const shotNode = projection.nodes.find((node) => node.id === 'shot:panel-1')
    const imageNode = projection.nodes.find((node) => node.id === 'image:panel-1')
    const videoNode = projection.nodes.find((node) => node.id === 'video:panel-1')
    const finalNode = projection.nodes.find((node) => node.id === 'final:episode-1')
    expect(shotNode?.data.action).toEqual({ type: 'generate_image', panelId: 'panel-1' })
    expect(imageNode?.data.action).toEqual({ type: 'generate_image', panelId: 'panel-1' })
    expect(videoNode?.data.action).toBeUndefined()
    expect(finalNode?.data.finalDetails?.finalVideo).toEqual({
      editorProjectId: 'editor-final',
      url: finalVideoUrl,
      status: 'completed',
      updatedAt: '2026-05-09T12:00:00.000Z',
    })
    expect(finalNode?.data.height).toBeGreaterThan(300)
  })

  it('normalizes stored final videos to the project video proxy for browser playback', () => {
    const projection = buildWorkspaceNodeCanvasProjection({
      projectId: 'project-1',
      episodeId: 'episode-1',
      storyText: 'A real story',
      clips: [createClip('clip-1', 'first clip content')],
      storyboards: [
        createStoryboard({
          id: 'storyboard-1',
          clipId: 'clip-1',
          panels: [
            createPanel({
              id: 'panel-1',
              panelIndex: 0,
              description: 'first panel',
              videoUrl: 'https://example.com/panel-1.mp4',
            }),
          ],
        }),
      ],
      finalVideo: {
        editorProjectId: 'editor-final',
        url: 'http://localhost:19000/waoowaoo/final-videos/episode-1/editor-final.mp4?X-Amz-Signature=signature',
        status: 'completed',
        updatedAt: '2026-05-09T12:00:00.000Z',
      },
      savedLayouts: [],
      translate: t,
    })

    const finalNode = projection.nodes.find((node) => node.id === 'final:episode-1')

    expect(finalNode?.data.finalDetails?.finalVideo?.url)
      .toBe('/api/projects/project-1/video-proxy?key=final-videos%2Fepisode-1%2Feditor-final.mp4')
    expect(finalNode?.data.height).toBeGreaterThan(300)
  })

  it('projects edit timeline results into draggable workspace nodes instead of an external board', () => {
    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: '',
      editTimelineData: createEditTimelineData(),
      clips: [],
      storyboards: [],
      savedLayouts: [],
      translate: t,
    })

    const storyNode = projection.nodes.find((node) => node.id === 'story:episode-1')
    const dispatchNode = projection.nodes.find((node) => node.id === 'edit-agent:main-director:dispatch')
    const visualAgentNode = projection.nodes.find((node) => node.id === 'edit-agent:visual-director')
    const synthesisNode = projection.nodes.find((node) => node.id === 'edit-agent:main-director:synthesis')
    const segmentNode = projection.nodes.find((node) => node.id === 'edit-segment:seg-pressure')
    const secondSegmentNode = projection.nodes.find((node) => node.id === 'edit-segment:seg-return')

    expect(storyNode?.data.body).toContain('客户原文：她在凌晨三点的办公室里快要放弃')
    expect(dispatchNode).toMatchObject({
      type: 'workspaceNode',
      draggable: true,
      data: {
        kind: 'editTimelineAgent',
        title: 'nodes.editAgent.dispatchTitle:{"title":"主 Agent"}',
        body: '理解故事并分发任务。',
        editTimelineAgentDetails: expect.objectContaining({
          phase: 'dispatch',
          decision: 'nodes.editAgent.dispatchDecision',
        }),
      },
    })
    expect(visualAgentNode).toMatchObject({
      data: {
        kind: 'editTimelineAgent',
        editTimelineAgentDetails: expect.objectContaining({
          phase: 'specialist',
          outputs: expect.arrayContaining([
            expect.objectContaining({ shotId: 'shot-return', text: '屏幕暖光照亮她的脸。' }),
          ]),
        }),
      },
    })
    expect(synthesisNode).toMatchObject({
      type: 'workspaceNode',
      draggable: true,
      data: {
        kind: 'editTimelineAgent',
        title: 'nodes.editAgent.synthesisTitle:{"title":"主 Agent"}',
        body: '主 Agent 综合专业 Agent 输出。',
        editTimelineAgentDetails: expect.objectContaining({
          phase: 'synthesis',
          decision: 'nodes.editAgent.synthesisDecision',
        }),
      },
    })
    expect(segmentNode).toMatchObject({
      type: 'workspaceNode',
      draggable: true,
      data: {
        kind: 'editTimelineSegment',
        title: '压抑开场',
        body: '表现压抑、疲惫、被工作困住。',
      },
    })
    expect(secondSegmentNode).toMatchObject({
      type: 'workspaceNode',
      draggable: true,
      data: {
        kind: 'editTimelineSegment',
        title: '重新点亮',
      },
    })
    expect(segmentNode?.data.editTimelineSegmentDetails?.shots[0]?.visual).toContain('深夜办公室')
    expect(projection.edges.map((edge) => `${edge.source}->${edge.target}`)).toContain('analysis:episode-1->edit-agent:main-director:dispatch')
    expect(projection.edges.map((edge) => `${edge.source}->${edge.target}`)).toContain('edit-agent:main-director:dispatch->edit-agent:visual-director')
    expect(projection.edges.map((edge) => `${edge.source}->${edge.target}`)).toContain('edit-agent:visual-director->edit-agent:main-director:synthesis')
    expect(projection.edges.map((edge) => `${edge.source}->${edge.target}`)).toContain('edit-agent:main-director:synthesis->edit-segment:seg-pressure')
    expect(projection.edges.map((edge) => `${edge.source}->${edge.target}`)).toContain('edit-segment:seg-pressure->edit-segment:seg-return')
    expect(projection.edges.map((edge) => `${edge.source}->${edge.target}`)).not.toContain('edit-agent:visual-director->edit-segment:seg-pressure')
    expect(projection.edges.map((edge) => `${edge.source}->${edge.target}`)).not.toContain('edit-agent:main-director:synthesis->edit-segment:seg-return')
  })

  it('separates same-column cards so the workspace is readable', () => {
    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: 'A real story',
      clips: [createClip('clip-1', 'first clip content')],
      storyboards: [
        createStoryboard({
          id: 'storyboard-1',
          clipId: 'clip-1',
          panels: [
            createPanel({ id: 'panel-1', panelIndex: 0, imageUrl: 'https://example.com/1.png' }),
            createPanel({ id: 'panel-2', panelIndex: 1, imageUrl: 'https://example.com/2.png' }),
            createPanel({ id: 'panel-3', panelIndex: 2, imageUrl: 'https://example.com/3.png' }),
          ],
        }),
      ],
      savedLayouts: [],
      translate: t,
    })
    const byColumn = new Map<number, Array<{ readonly id: string; readonly top: number; readonly bottom: number }>>()
    projection.nodes.forEach((node) => {
      const column = node.position.x
      const list = byColumn.get(column) ?? []
      list.push({ id: node.id, top: node.position.y, bottom: node.position.y + node.data.height })
      byColumn.set(column, list)
    })

    byColumn.forEach((nodesInColumn) => {
      const sorted = [...nodesInColumn].sort((left, right) => left.top - right.top)
      sorted.forEach((node, index) => {
        const previous = sorted[index - 1]
        if (!previous) return
        expect(node.top, `${previous.id} should not overlap ${node.id}`).toBeGreaterThanOrEqual(previous.bottom + 32)
      })
    })
  })

  it('renders plan-stage edit timeline shots even before provider control payloads exist', () => {
    const planStageTimeline = {
      ...createEditTimelineData(),
      timeline: {
        ...createEditTimelineData().timeline,
        shots: [
          {
            id: 'shot-pressure',
            segmentId: 'seg-pressure',
            title: '深夜办公室',
            goal: '表现压抑、疲惫、被工作困住。',
            track: 'video',
            order: 1,
            startMs: 0,
            durationMs: 3_000,
            dependsOn: [],
            inputArtifacts: [],
            outputArtifacts: [],
            referenceIds: [],
            visual: '计划阶段画面描述。',
          },
        ],
      },
    } as unknown as EditTimelinePartData
    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: '',
      editTimelineData: planStageTimeline,
      clips: [],
      storyboards: [],
      savedLayouts: [],
      translate: t,
    })

    const segmentNode = projection.nodes.find((node) => node.id === 'edit-segment:seg-pressure')

    expect(segmentNode?.data.editTimelineSegmentDetails?.shots[0]?.visual).toBe('计划阶段画面描述。')
  })

  it('creates a video node for an image-ready panel without submitting a model-less quick action', () => {
    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: 'A real story',
      clips: [createClip('clip-1', 'first clip content')],
      storyboards: [
        createStoryboard({
          id: 'storyboard-1',
          clipId: 'clip-1',
          panels: [
            createPanel({
              id: 'panel-1',
              panelIndex: 0,
              description: 'first panel',
              imageUrl: 'https://example.com/panel-1.png',
            }),
          ],
        }),
      ],
      savedLayouts: [],
      translate: t,
    })

    const videoNode = projection.nodes.find((node) => node.id === 'video:panel-1')

    expect(videoNode?.data.kind).toBe('videoClip')
    expect(videoNode?.data.previewImageUrl).toBe('https://example.com/panel-1.png')
    expect(videoNode?.data.action).toBeUndefined()
    expect(projection.edges.map((edge) => `${edge.source}->${edge.target}`)).toContain('image:panel-1->video:panel-1')
  })

  it('uses saved layout only for node position and preserves business ordering', () => {
    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: 'A real story',
      clips: [createClip('clip-1', 'clip content')],
      storyboards: [
        createStoryboard({
          id: 'storyboard-1',
          clipId: 'clip-1',
          panels: [
            createPanel({ id: 'panel-late', panelIndex: 9, panelNumber: 9 }),
            createPanel({ id: 'panel-early', panelIndex: 0, panelNumber: 1 }),
          ],
        }),
      ],
      savedLayouts: [
        {
          nodeKey: 'shot:panel-early',
          x: 999,
          y: 888,
          width: 320,
          height: 214,
          zIndex: 0,
          locked: false,
          collapsed: false,
        },
      ],
      translate: t,
    })

    const shotNodes = projection.nodes.filter((node) => node.data.kind === 'shot')
    expect(shotNodes.map((node) => node.id)).toEqual(['shot:panel-early', 'shot:panel-late'])
    expect(shotNodes[0].position).toEqual({ x: 999, y: 888 })
  })

  it('projects full non-voice business details into typed node data', () => {
    const screenplay = JSON.stringify({
      scenes: [
        {
          scene_number: 1,
          heading: { int_ext: 'EXT', location: '城市街道_雨夜', time: '夜晚' },
          description: '雨夜街道',
          characters: ['小机器人', '小女孩'],
          content: [
            { type: 'action', text: '小机器人举起发光路灯。' },
            { type: 'dialogue', character: '小女孩', text: '我们到家了吗？' },
          ],
        },
      ],
    })
    const clip: ProjectClip = {
      ...createClip('clip-rich', 'original clip text'),
      summary: 'rich summary',
      location: '["城市街道_雨夜"]',
      characters: JSON.stringify([{ name: '小机器人', appearance: '初始形象' }]),
      props: '["发光路灯"]',
      screenplay,
      start: 2,
      end: 8,
      duration: 6,
      shotCount: 5,
    }
    const panel = createPanel({
      id: 'panel-rich',
      panelIndex: 0,
      shotType: '全景',
      cameraMove: '缓慢推进',
      description: 'rich panel description',
      location: '城市街道_雨夜',
      characters: JSON.stringify([{ name: '小女孩', appearance: '初始形象' }]),
      props: '["发光路灯"]',
      srtSegment: '小女孩说话',
      srtStart: 2,
      srtEnd: 4,
      duration: 2,
      imagePrompt: 'rich image prompt',
      videoPrompt: 'rich video prompt',
      candidateImages: JSON.stringify(['https://example.com/a.png', 'PENDING:1']),
      imageHistory: 'image history json',
      sketchImageUrl: 'https://example.com/sketch.png',
      previousImageUrl: 'https://example.com/previous.png',
      firstLastFramePrompt: 'first last prompt',
      videoUrl: 'https://example.com/video.mp4',
      videoGenerationMode: 'firstlastframe',
      lastVideoGenerationOptions: { duration: 5, enhance: true },
      lipSyncVideoUrl: 'https://example.com/lip.mp4',
      videoModel: 'video-model',
      linkedToNextPanel: true,
      photographyRules: 'photo rules',
      actingNotes: 'acting notes',
      imageErrorMessage: 'image failed',
      videoErrorMessage: 'video failed',
      lipSyncErrorMessage: 'lip failed',
    })

    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: 'story',
      clips: [clip],
      storyboards: [{
        ...createStoryboard({ id: 'storyboard-rich', clipId: 'clip-rich', panels: [panel] }),
        storyboardTextJson: 'storyboard json',
        photographyPlan: 'photography plan',
        lastError: 'storyboard failed',
      }],
      shots: [createShot('shot-rich', '01')],
      savedLayouts: [],
      translate: t,
    })

    const clipNode = projection.nodes.find((node) => node.id === 'clip:clip-rich')
    expect(clipNode?.data.body).toContain('"scenes"')
    expect(clipNode?.data.scriptDetails?.screenplayText).toBe(screenplay)
    expect(clipNode?.data.scriptDetails?.originalText).toBe('original clip text')
    expect(clipNode?.data.scriptDetails?.characters).toEqual([{ name: '小机器人', appearance: '初始形象' }])
    expect(clipNode?.data.scriptDetails?.locations).toEqual(['城市街道_雨夜'])
    expect(clipNode?.data.scriptDetails?.props).toEqual(['发光路灯'])
    expect(clipNode?.data.scriptDetails?.scenes[0]?.lines).toEqual([
      { kind: 'action', speaker: null, text: '小机器人举起发光路灯。' },
      { kind: 'dialogue', speaker: '小女孩', text: '我们到家了吗？' },
    ])

    const shotNode = projection.nodes.find((node) => node.id === 'shot:panel-rich')
    expect(shotNode?.data.shotDetails).toMatchObject({
      shotType: '全景',
      cameraMove: '缓慢推进',
      location: '城市街道_雨夜',
      srtSegment: '小女孩说话',
      imagePrompt: 'rich image prompt',
      videoPrompt: 'rich video prompt',
      photographyRules: 'photo rules',
      actingNotes: 'acting notes',
      storyboardTextJson: 'storyboard json',
      photographyPlan: 'photography plan',
      errorMessage: 'image failed',
    })
    expect(shotNode?.data.shotDetails?.characters).toEqual([{ name: '小女孩', appearance: '初始形象' }])
    expect(shotNode?.data.shotDetails?.promptShot?.plot).toBe('prompt plot')

    const imageNode = projection.nodes.find((node) => node.id === 'image:panel-rich')
    expect(imageNode?.data.imageDetails).toMatchObject({
      imagePrompt: 'rich image prompt',
      candidateImages: ['https://example.com/a.png', 'PENDING:1'],
      imageHistory: 'image history json',
      sketchImageUrl: 'https://example.com/sketch.png',
      previousImageUrl: 'https://example.com/previous.png',
      errorMessage: 'image failed',
    })

    const videoNode = projection.nodes.find((node) => node.id === 'video:panel-rich')
    expect(videoNode?.data.videoDetails).toMatchObject({
      videoPrompt: 'rich video prompt',
      firstLastFramePrompt: 'first last prompt',
      videoGenerationMode: 'firstlastframe',
      videoUrl: 'https://example.com/video.mp4',
      videoModel: 'video-model',
      linkedToNextPanel: true,
      errorMessage: 'video failed',
    })
    expect(videoNode?.data.videoDetails).not.toHaveProperty('lipSyncVideoUrl')
    expect(videoNode?.data.videoDetails).not.toHaveProperty('lipSyncErrorMessage')
    expect(videoNode?.data.videoDetails?.lastVideoGenerationOptions).toEqual([
      { kind: 'text', speaker: 'duration', text: '5' },
      { kind: 'text', speaker: 'enhance', text: 'true' },
    ])

    const finalNode = projection.nodes.find((node) => node.id === 'final:episode-1')
    expect(finalNode?.data.finalDetails).toMatchObject({
      totalShots: 1,
      totalImages: 1,
      totalVideos: 1,
      totalDuration: 2,
    })
    expect(projection.nodes.some((node) => node.data.kind === 'finalTimeline')).toBe(true)
    expect(projection.nodes.some((node) => String(node.id).startsWith('voice:'))).toBe(false)
  })
})
