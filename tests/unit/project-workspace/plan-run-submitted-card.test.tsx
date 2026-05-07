import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PlanRunSubmittedDataCard } from '@/features/project-workspace/components/workspace-assistant/PlanRunSubmittedDataCard'

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
  it('renders the submitted PlanRun id and waiting task id immediately', () => {
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

    expect(html).toContain('cards.planRunSubmitted · waiting_task')
    expect(html).toContain('cards.planRunIdLabel: plan-run-1')
    expect(html).toContain('cards.waitingTaskIdLabel: task-1')
    expect(html).toContain('data-icon="loader"')
  })
})
