import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  PlanRunSubmittedDataCard,
  readVisibleEditTimelineEvidenceFromSnapshot,
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

    expect(evidence?.finalVideoUrl).toBe(finalVideoUrl)
    expect(evidence?.finalVideoRefs).toEqual([
      finalVideoUrl,
      'final-videos/editor-final-video.mp4',
    ])
  })
})
