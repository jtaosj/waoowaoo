import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { NodeProps } from '@xyflow/react'
import WorkspaceNode from '@/features/project-workspace/canvas/nodes/WorkspaceNode'
import type { WorkspaceCanvasFlowNode, WorkspaceCanvasNodeData } from '@/features/project-workspace/canvas/node-canvas-types'

vi.mock('@xyflow/react', () => ({
  Handle: () => <span data-testid="handle" />,
  Position: { Left: 'left', Right: 'right' },
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (!values) return key
    return `${key}:${JSON.stringify(values)}`
  },
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: ({ name }: { readonly name: string }) => <span data-icon={name} />,
}))

vi.mock('@/features/project-workspace/canvas/details/StoryDetail', () => ({
  default: ({
    projectId,
    storyText,
    episodeName,
    variant,
  }: {
    readonly projectId: string
    readonly storyText: string
    readonly episodeName?: string
    readonly variant?: 'panel' | 'node'
  }) => (
    <div data-testid="story-detail" data-variant={variant}>
      {projectId}:{episodeName}:{storyText}
    </div>
  ),
}))

function renderNode(data: WorkspaceCanvasNodeData): string {
  const props = { data } as NodeProps<WorkspaceCanvasFlowNode>
  return renderToStaticMarkup(<WorkspaceNode {...props} />)
}

describe('workspace node rendering', () => {
  it('renders story input controls inline without opening a detail action', () => {
    const html = renderNode({
      kind: 'storyInput',
      projectId: 'project-1',
      episodeName: 'Episode 1',
      layoutNodeType: 'story',
      targetType: 'episode',
      targetId: 'episode-1',
      title: 'Story node',
      eyebrow: 'Story',
      body: 'inline story body',
      meta: '12 chars',
      statusLabel: 'Ready',
      width: 960,
      height: 600,
      nodeId: 'story:episode-1',
    })

    expect(html).toContain('data-testid="story-detail"')
    expect(html).toContain('data-variant="node"')
    expect(html).toContain('project-1:Episode 1:inline story body')
    expect(html).toContain('rounded-[24px]')
    expect(html).toContain('border-slate-200')
    expect(html).not.toContain('nodeFields.openDetails')
  })

  it('renders script clip structure instead of only the summary body', () => {
    const html = renderNode({
      kind: 'scriptClip',
      layoutNodeType: 'scriptClip',
      targetType: 'clip',
      targetId: 'clip-1',
      title: 'Script node',
      eyebrow: 'Script',
      body: 'screenplay raw',
      meta: 'clip #1',
      statusLabel: 'Ready',
      width: 320,
      height: 360,
      indexLabel: 'C1',
      scriptDetails: {
        originalText: 'original source text',
        screenplayText: 'screenplay raw',
        scenes: [{
          sceneNumber: 1,
          heading: 'EXT · Street · Night',
          description: 'rain street',
          characters: ['Robot'],
          lines: [{ kind: 'dialogue', speaker: 'Girl', text: 'hello' }],
        }],
        characters: [{ name: 'Robot', appearance: 'Default' }],
        locations: ['Street'],
        props: ['Lamp'],
        timeRange: '1s - 3s',
        duration: 2,
        shotCount: 1,
      },
    })

    expect(html).toContain('Robot / Default')
    expect(html).toContain('EXT · Street · Night')
    expect(html).toContain('original source text')
    expect(html).toContain('hello')
  })

  it('keeps compact node content readable inside a scrollable body region', () => {
    const html = renderNode({
      kind: 'analysis',
      layoutNodeType: 'analysis',
      targetType: 'episode',
      targetId: 'episode-1',
      title: 'Analysis node',
      eyebrow: 'Analysis',
      body: 'Detailed structure summary that should remain readable even when the card is compact.',
      meta: 'analysis',
      statusLabel: 'Ready',
      width: 320,
      height: 214,
      nodeId: 'analysis:episode-1',
    })

    expect(html).toContain('flex min-h-0 h-full flex-col')
    expect(html).toContain('min-h-0 flex-1 overflow-hidden')
    expect(html).toContain('nodrag nowheel min-h-0 flex-1 overflow-y-auto')
    expect(html).toContain('Detailed structure summary')
  })

  it('renders shot, image, video, and final details without stage containers', () => {
    const shotHtml = renderNode({
      kind: 'shot',
      layoutNodeType: 'shot',
      targetType: 'panel',
      targetId: 'panel-1',
      title: 'Shot node',
      eyebrow: 'Shot',
      body: 'shot description',
      meta: 'location',
      statusLabel: 'Ready',
      width: 320,
      height: 380,
      shotDetails: {
        shotType: 'wide',
        cameraMove: 'push in',
        characters: [{ name: 'Girl' }],
        location: 'Street',
        props: ['Lamp'],
        srtSegment: 'dialogue text',
        imagePrompt: 'image prompt',
        videoPrompt: 'video prompt',
        photographyRules: 'photo rules',
        actingNotes: 'acting notes',
        promptShot: {
          plot: 'prompt plot',
        },
      },
    })
    const imageHtml = renderNode({
      kind: 'imageAsset',
      layoutNodeType: 'imageAsset',
      targetType: 'panel',
      targetId: 'panel-1',
      title: 'Image node',
      eyebrow: 'Image',
      body: 'image body',
      meta: 'bound',
      statusLabel: 'Ready',
      width: 300,
      height: 390,
      imageDetails: {
        imagePrompt: 'image prompt',
        candidateImages: ['https://example.com/a.png'],
        imageHistory: 'history',
        sketchImageUrl: 'https://example.com/sketch.png',
        previousImageUrl: 'https://example.com/previous.png',
      },
    })
    const videoHtml = renderNode({
      kind: 'videoClip',
      layoutNodeType: 'videoClip',
      targetType: 'panel',
      targetId: 'panel-1',
      title: 'Video node',
      eyebrow: 'Video',
      body: 'video body',
      meta: 'bound',
      statusLabel: 'Ready',
      width: 300,
      height: 410,
      videoDetails: {
        videoPrompt: 'video prompt',
        firstLastFramePrompt: 'first last prompt',
        videoGenerationMode: 'firstlastframe',
        videoUrl: 'https://example.com/video.mp4',
      },
    })
    const finalHtml = renderNode({
      kind: 'finalTimeline',
      layoutNodeType: 'finalTimeline',
      targetType: 'episode',
      targetId: 'episode-1',
      title: 'Final node',
      eyebrow: 'Final',
      body: 'final body',
      meta: 'order',
      statusLabel: 'Ready',
      width: 340,
      height: 280,
      finalDetails: {
        totalShots: 1,
        totalImages: 1,
        totalVideos: 1,
        totalDuration: 2,
        orderedVideoLabels: ['panel-1'],
        finalVideo: {
          editorProjectId: 'editor-final',
          url: '/api/final-video/editor-final.mp4',
          status: 'completed',
        },
      },
    })

    expect(shotHtml).toContain('photo rules')
    expect(shotHtml).toContain('acting notes')
    expect(imageHtml).toContain('history')
    expect(imageHtml).toContain('https://example.com/sketch.png')
    expect(videoHtml).toContain('first last prompt')
    expect(videoHtml).not.toContain('lip.mp4')
    expect(finalHtml).toContain('panel-1')
    expect(finalHtml).toContain('<video')
    expect(finalHtml).toContain('src="/api/final-video/editor-final.mp4"')
    expect(finalHtml).toContain('controls=""')
    expect(finalHtml).toContain('finalVideoPlayer')
    expect(`${shotHtml}${imageHtml}${videoHtml}${finalHtml}`).not.toContain('StoryboardStage')
  })

  it('shows an explicit final video pending state instead of a fake player', () => {
    const html = renderNode({
      kind: 'finalTimeline',
      layoutNodeType: 'finalTimeline',
      targetType: 'episode',
      targetId: 'episode-1',
      title: 'Final node',
      eyebrow: 'Final',
      body: 'final body',
      meta: 'order',
      statusLabel: 'Ready',
      width: 340,
      height: 300,
      finalDetails: {
        totalShots: 1,
        totalImages: 1,
        totalVideos: 1,
        totalDuration: 2,
        orderedVideoLabels: ['panel-1'],
        finalVideo: {
          editorProjectId: 'editor-final',
          url: 'final-videos/editor-final.mp4',
          status: 'rendering',
        },
      },
    })

    expect(html).not.toContain('<video')
    expect(html).toContain('finalVideoPending')
  })

  it('renders edit-first agent and time segment cards as normal workspace nodes', () => {
    const agentHtml = renderNode({
      kind: 'editTimelineAgent',
      layoutNodeType: 'editTimelineAgent',
      targetType: 'episode',
      targetId: 'episode-1',
      title: '画面 Agent',
      eyebrow: 'AI Agent',
      body: '画面 Agent 负责办公室和雨夜氛围。',
      meta: '覆盖 1 个镜头',
      statusLabel: '已起草',
      width: 360,
      height: 300,
      nodeId: 'edit-agent:visual-director',
      editTimelineAgentDetails: {
        role: 'visual-director',
        phase: 'specialist',
        mission: '负责画面描述。',
        summary: '画面 Agent 负责办公室和雨夜氛围。',
        decision: '专业 Agent 按主 Agent 的时间段任务输出画面方案。',
        shotIds: ['shot-pressure'],
        outputs: [{ shotId: 'shot-pressure', text: '深夜办公室，窗外下雨。' }],
      },
    })
    const segmentHtml = renderNode({
      kind: 'editTimelineSegment',
      layoutNodeType: 'editTimelineSegment',
      targetType: 'episode',
      targetId: 'episode-1',
      title: '压抑开场',
      eyebrow: '0s - 3s',
      body: '表现压抑、疲惫、被工作困住。',
      meta: '1 个镜头',
      statusLabel: '已规划',
      width: 420,
      height: 340,
      nodeId: 'edit-segment:seg-pressure',
      editTimelineSegmentDetails: {
        startLabel: '0s',
        endLabel: '3s',
        durationLabel: '3s',
        intent: '表现压抑、疲惫、被工作困住。',
        shots: [{
          id: 'shot-pressure',
          title: '深夜办公室',
          timeLabel: '0s - 3s',
          goal: '表现压抑、疲惫、被工作困住。',
          visual: '深夜办公室，女生坐在电脑前，窗外下雨。',
          story: '表现压抑、疲惫、被工作困住。',
          sound: '低频环境音、雨声、键盘声。',
          caption: '我好像快忘了，自己为什么想创作。',
        }],
      },
    })

    expect(agentHtml).toContain('画面 Agent')
    expect(agentHtml).toContain('专业 Agent 按主 Agent 的时间段任务输出画面方案。')
    expect(agentHtml).toContain('负责画面描述。')
    expect(agentHtml).toContain('深夜办公室，窗外下雨。')
    expect(agentHtml).not.toContain('nodeFields.openDetails')
    expect(segmentHtml).toContain('压抑开场')
    expect(segmentHtml).toContain('visual')
    expect(segmentHtml).toContain('深夜办公室，女生坐在电脑前，窗外下雨。')
    expect(segmentHtml).toContain('我好像快忘了，自己为什么想创作。')
    expect(segmentHtml).not.toContain('nodeFields.openDetails')
  })
})
