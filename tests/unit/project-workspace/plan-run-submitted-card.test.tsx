import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  PlanRunSubmittedDataCard,
  readVisibleEditTimelineEvidenceFromSnapshot,
  syncFinalVideoArtifactIntoEpisodeCache,
} from '@/features/project-workspace/components/workspace-assistant/PlanRunSubmittedDataCard'

vi.mock('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: ({ name }: { readonly name: string }) => <span data-icon={name} />,
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    refetchQueries: vi.fn(),
    setQueryData: vi.fn(),
  }),
}))

describe('workspace assistant plan run submitted card', () => {
  it('renders a readable live run status instead of exposing only raw ids', () => {
    const props = {
      data: {
        operationId: 'execute_plan',
        planRunId: 'plan-run-1',
        status: 'waiting_task',
        executedStepKeys: ['video'],
        waitingTaskId: 'task-1',
      },
    } as React.ComponentProps<typeof PlanRunSubmittedDataCard>

    const html = renderToStaticMarkup(<PlanRunSubmittedDataCard {...props} />)

    expect(html).toContain('cards.planRunTitle.running')
    expect(html).toContain('cards.planRunStage.waitingTask')
    expect(html).toContain('cards.planRunNext.waitingForTask')
    expect(html).toContain('cards.planRunMeta.planRun: plan-run-1')
    expect(html).toContain('cards.planRunMeta.task: task-1')
    expect(html).toContain('data-icon="loader"')
  })

  it('reads a playable final video URL from final.video artifacts', () => {
    const finalVideoUrl = '/api/files/final-videos/editor-final-video.mp4?X-Amz-Signature=signature'
    const evidence = readVisibleEditTimelineEvidenceFromSnapshot({
      planRun: {
        id: 'plan-run-final-video',
        projectId: 'project-1',
        status: 'completed',
      },
      steps: [],
      artifacts: [
        {
          id: 'artifact-final-video',
          artifactType: 'final.video',
          refId: 'final-videos/editor-final-video.mp4',
          payload: {
            finalVideoUrl,
            outputUrl: finalVideoUrl,
            storageKey: 'final-videos/editor-final-video.mp4',
            renderStatus: 'completed',
          },
        },
      ],
    })

    expect(evidence?.finalVideoUrl).toBe('/api/projects/project-1/video-proxy?key=final-videos%2Feditor-final-video.mp4')
    expect(evidence?.finalVideoStorageKey).toBe('final-videos/editor-final-video.mp4')
    expect(evidence?.finalVideoStatus).toBe('completed')
    expect(evidence?.finalVideoRefs).toEqual([
      'final-videos/editor-final-video.mp4',
    ])
    expect(evidence?.finalVideoRefs.some((ref) => ref.includes('X-Amz-Signature'))).toBe(false)
  })

  it('patches the visible episode cache when a terminal PlanRun exposes final.video', () => {
    let patchedEpisode: unknown = null
    const setQueryData = vi.fn((_queryKey: readonly unknown[], updater: (previous: unknown) => unknown) => {
      patchedEpisode = updater({
        id: 'episode-1',
        editorProject: {
          id: 'editor-old',
          outputUrl: null,
          renderStatus: 'rendering',
        },
      })
      return patchedEpisode
    })
    const refetchQueries = vi.fn()

    const synced = syncFinalVideoArtifactIntoEpisodeCache({
      setQueryData,
      refetchQueries,
    } as unknown as Parameters<typeof syncFinalVideoArtifactIntoEpisodeCache>[0], {
      planRun: {
        id: 'plan-run-final-video',
        projectId: 'project-1',
        episodeId: 'episode-1',
        status: 'completed',
      },
      steps: [],
      artifacts: [
        {
          id: 'artifact-final-video',
          artifactType: 'final.video',
          refId: 'final-videos/editor-final-video.mp4',
          payload: {
            finalVideoUrl: 'http://localhost:19000/waoowaoo/final-videos/episode-1/editor-final-video.mp4?X-Amz-Signature=signature',
            storageKey: 'final-videos/episode-1/editor-final-video.mp4',
            editorProjectId: 'editor-final',
            renderStatus: 'completed',
          },
        },
      ],
    })

    expect(synced).toBe(true)
    expect(setQueryData.mock.calls[0]?.[0]).toEqual(['episode-data', 'project-1', 'episode-1'])
    expect(typeof setQueryData.mock.calls[0]?.[1]).toBe('function')
    expect(patchedEpisode).toMatchObject({
      id: 'episode-1',
      editorProject: {
        id: 'editor-final',
        outputUrl: 'http://localhost:19000/waoowaoo/final-videos/episode-1/editor-final-video.mp4?X-Amz-Signature=signature',
        storageKey: 'final-videos/episode-1/editor-final-video.mp4',
        renderStatus: 'completed',
      },
    })
    expect(refetchQueries).toHaveBeenCalledWith({
      queryKey: ['episode-data', 'project-1', 'episode-1'],
    })
  })
})
