import { describe, expect, it } from 'vitest'
import {
  getConfirmationSubmissionBlocker,
} from '@/features/project-workspace/components/workspace-assistant/confirmation-requirements'

describe('workspace assistant confirmation requirements', () => {
  it('blocks direct panel video confirmation when videoModel is missing', () => {
    expect(getConfirmationSubmissionBlocker('generate_panel_video', {
      confirmed: true,
      panelId: 'panel-1',
    })).toBe('videoModelRequired')
  })

  it('blocks invoke_operation panel video confirmation when nested input has no videoModel', () => {
    expect(getConfirmationSubmissionBlocker('invoke_operation', {
      skillId: 'media-generation',
      operationId: 'generate_panel_video',
      input: {
        confirmed: true,
        panelId: 'panel-1',
      },
    })).toBe('videoModelRequired')
  })

  it('allows panel video confirmation when videoModel is present', () => {
    expect(getConfirmationSubmissionBlocker('invoke_operation', {
      skillId: 'media-generation',
      operationId: 'generate_panel_video',
      input: {
        confirmed: true,
        panelId: 'panel-1',
        videoModel: 'ark::doubao-seedance-2-0-260128',
      },
    })).toBeNull()
  })

  it('allows unrelated confirmations without videoModel', () => {
    expect(getConfirmationSubmissionBlocker('generate_project_music', {
      confirmed: true,
      prompt: 'quiet theme',
    })).toBeNull()
  })
})
