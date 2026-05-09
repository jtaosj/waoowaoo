import { describe, expect, it } from 'vitest'
import { buildProjectAgentSystemPrompt } from '@/lib/project-agent/copy'

describe('project agent prompt copy', () => {
  it('uses Agent Skill gateway rules instead of fixed workflow rules', () => {
    const prompt = buildProjectAgentSystemPrompt({
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      stage: 'concept',
      interactionMode: 'plan',
    })

    expect(prompt).toContain('search_skills')
    expect(prompt).toContain('load_skill')
    expect(prompt).toContain('create_plan')
    expect(prompt).toContain('validate_plan')
    expect(prompt).toContain('invoke_operation')
    expect(prompt).toContain('edit-first-video-director')
    expect(prompt).toContain('create_edit_timeline_plan')
    expect(prompt).toContain('EditTimelineBlackboard')
    expect(prompt).toContain('Macro Script')
    expect(prompt).toContain('Segment Blackboard')
    expect(prompt).toContain('Film Critic 只有在 final.video evidence 存在后才能展示成功分数')
    expect(prompt).toContain('不能展示数值成功分')
    expect(prompt).toContain('创作/制作/视频/故事入口默认走剪辑先行')
    expect(prompt).toContain('用户不需要说 agent、tool、operation')
    expect(prompt).toContain('blackboard')
    expect(prompt).toContain('videoModel')
    expect(prompt).toContain('start_edit_timeline_video_run')
    expect(prompt).toContain('自然语言故事')
    expect(prompt).toContain('不要把完整 timeline 或 blackboard JSON')
    expect(prompt).toContain('显式失败')
    expect(prompt).not.toContain('调用 compile_edit_timeline 时必须传入这个 blackboard')
    expect(prompt).toContain('Skill 是指导 AI 如何使用 operations 的说明书')
    expect(prompt).not.toContain('只能通过固定 workflow package 执行')
    expect(prompt).not.toContain('workflow package 内部 skills 顺序不可更改')
    expect(prompt).not.toContain('Film Critic 分数')
  })

  it('asks the edit-first director to explain cinematic shot intent and continuity anchors', () => {
    const prompt = buildProjectAgentSystemPrompt({
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      stage: 'concept',
      interactionMode: 'auto',
    })

    expect(prompt).toContain('镜头目的')
    expect(prompt).toContain('可见主体动作')
    expect(prompt).toContain('连续性锚点')
    expect(prompt).toContain('最终生成计划')
  })
})
