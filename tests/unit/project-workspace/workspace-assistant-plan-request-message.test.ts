import { describe, expect, it } from 'vitest'
import {
  buildWorkspaceAssistantPlanRequestMessage,
  type WorkspaceExecutionTranslate,
} from '@/features/project-workspace/hooks/assistant-plan-request-message'

describe('workspace assistant plan request message', () => {
  it('submits only the natural-language story text for edit-first routing', () => {
    const calls: Array<{
      key: string
      values?: Record<string, string | number>
    }> = []
    const t: WorkspaceExecutionTranslate = (key, values) => {
      calls.push({ key, values })
      return 'FALLBACK'
    }

    const message = buildWorkspaceAssistantPlanRequestMessage({
      storyText: '  雨夜便利店。请做成 12 秒 3 个镜头视频。  ',
      t,
    })

    expect(message).toBe('雨夜便利店。请做成 12 秒 3 个镜头视频。')
    expect(message).not.toContain('agent')
    expect(message).not.toContain('operation')
    expect(message).not.toContain('blackboard')
    expect(message).not.toContain('compile_edit_timeline')
    expect(calls).toEqual([])
  })

  it('keeps the generic fallback when no story text is available', () => {
    const calls: Array<{
      key: string
      values?: Record<string, string | number>
    }> = []
    const t: WorkspaceExecutionTranslate = (key, values) => {
      calls.push({ key, values })
      return key
    }

    const message = buildWorkspaceAssistantPlanRequestMessage({
      storyText: '   ',
      t,
    })

    expect(message).toBe('execution.assistantPlanRequest')
    expect(calls).toEqual([{ key: 'execution.assistantPlanRequest', values: undefined }])
  })
})
