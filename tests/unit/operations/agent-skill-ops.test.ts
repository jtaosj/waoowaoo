import { describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createAgentSkillOperations } from '@/lib/operations/domains/agent-skill/agent-skill-ops'
import type { ProjectAgentOperationContext } from '@/lib/operations/types'

interface ExecuteAgentPlanMockResult {
  success: boolean
  planRunId: string
  status?: string
  executedStepKeys?: string[]
  waitingTaskId?: string | null
  failedStepKey?: string
  error?: unknown
  snapshot: unknown
}

const executeAgentPlanMock = vi.hoisted(() => vi.fn(async (): Promise<ExecuteAgentPlanMockResult> => ({
  success: true,
  planRunId: 'plan-run-1',
  status: 'completed',
  executedStepKeys: ['write_first_scene_script'],
  waitingTaskId: null,
  snapshot: {
    planRun: {
      id: 'plan-run-1',
      planId: null,
    },
  },
})))

vi.mock('@/lib/plan-run-runtime/executor', () => ({
  executeAgentPlan: executeAgentPlanMock,
}))

function buildContext(writerEvents: Array<Record<string, unknown>> = []): ProjectAgentOperationContext {
  return {
    request: new Request('http://localhost') as unknown as NextRequest,
    userId: 'user-1',
    projectId: 'project-1',
    context: { episodeId: 'episode-1', locale: 'zh' },
    source: 'assistant-panel',
    writer: {
      write: (chunk: Record<string, unknown>) => {
        writerEvents.push(chunk)
      },
      merge: () => undefined,
      onError: () => undefined,
    } as unknown as ProjectAgentOperationContext['writer'],
  }
}

const searchSkillsOutputSchema = z.object({
  skills: z.array(z.object({
    id: z.string(),
  })),
})

const loadSkillOutputSchema = z.object({
  skill: z.object({
    id: z.string(),
    instructions: z.string(),
    operations: z.array(z.object({
      id: z.string(),
    })),
  }),
})

const planDraftOutputSchema = z.object({
  draftPlanId: z.string(),
  validation: z.object({
    ok: z.boolean(),
  }),
})

describe('agent skill operations', () => {
  it('search_skills returns Agent Skill summaries', async () => {
    const operations = createAgentSkillOperations()
    const raw = await operations.search_skills.execute(buildContext(), {
      query: '换场景 location',
    })
    const result = searchSkillsOutputSchema.parse(raw)

    expect(result.skills.map((skill) => skill.id)).toContain('location-selection')
  })

  it('load_skill returns instructions and allowed operation contracts', async () => {
    const operations = createAgentSkillOperations()
    const raw = await operations.load_skill.execute(buildContext(), {
      skillId: 'location-selection',
    })
    const result = loadSkillOutputSchema.parse(raw)

    expect(result.skill.instructions).toContain('Never invent location ids')
    expect(result.skill.operations.map((operation) => operation.id)).toContain('confirm_location_selection')
  })

  it('load_skill exposes edit-first timeline and production-bridge operations without direct media generation', async () => {
    const operations = createAgentSkillOperations()
    const raw = await operations.load_skill.execute(buildContext(), {
      skillId: 'edit-first-video-director',
    })
    const result = loadSkillOutputSchema.parse(raw)

    expect(result.skill.instructions).toContain('EditTimeline')
    expect(result.skill.instructions).toContain('EditTimelineBlackboard')
    expect(result.skill.instructions).toContain('Macro Script')
    expect(result.skill.instructions).toContain('Segment Blackboard')
    expect(result.skill.instructions).toContain('Always pass the exact `blackboard`')
    expect(result.skill.operations.map((operation) => operation.id)).toEqual([
      'create_edit_timeline_plan',
      'validate_edit_timeline',
      'compile_edit_timeline',
      'start_edit_timeline_video_run',
      'start_edit_timeline_production_run',
      'materialize_edit_timeline_storyboard',
      'assemble_timeline_video',
      'score_edit_timeline_trace',
      'redo_timeline_shot',
    ])
    expect(result.skill.operations.map((operation) => operation.id)).not.toContain('generate_panel_video')
  })

  it('create_plan emits data-plan and rejects fixed workflow references through validation', async () => {
    const writerEvents: Array<Record<string, unknown>> = []
    const operations = createAgentSkillOperations()
    const fixedWorkflowOperationId = ['run', 'workflow', 'package'].join('_')
    const raw = await operations.create_plan.execute(buildContext(writerEvents), {
      goal: 'run fixed workflow',
      loadedSkillIds: ['screenwriting'],
      steps: [
        {
          stepKey: 'legacy',
          skillId: 'screenwriting',
          operationId: fixedWorkflowOperationId,
          reason: 'legacy workflow',
          requiresApproval: true,
        },
      ],
    })
    const result = planDraftOutputSchema.parse(raw)

    expect(result.draftPlanId).toMatch(/^draft_plan_/)
    expect(result.validation.ok).toBe(false)
    expect(writerEvents).toEqual([
      expect.objectContaining({
        type: 'data-plan',
        data: expect.objectContaining({
          draftPlanId: result.draftPlanId,
          validation: expect.objectContaining({ ok: false }),
        }),
      }),
    ])
  })

  it('execute_plan keeps draftPlanId out of the persisted PlanRun relation', async () => {
    executeAgentPlanMock.mockClear()
    const operations = createAgentSkillOperations()

    const raw = await operations.execute_plan.execute(buildContext(), {
      goal: '编写《星尘记录者》第一幕开场场景的剧本。',
      loadedSkillIds: ['screenwriting'],
      draftPlanId: 'draft_plan_1',
      confirmed: true,
      steps: [
        {
          stepKey: 'write_first_scene_script',
          skillId: 'screenwriting',
          operationId: 'write_screenplay',
          reason: '根据大纲编写第一幕开场场景的剧本内容。',
          requiresApproval: true,
        },
      ],
    })

    expect(raw).toMatchObject({
      success: true,
      planRunId: 'plan-run-1',
    })
    expect(executeAgentPlanMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      planId: null,
      input: expect.objectContaining({
        draftPlanId: 'draft_plan_1',
      }),
    }))
  })

  it('execute_plan emits a live PlanRun card data part when it starts waiting on a task', async () => {
    executeAgentPlanMock.mockResolvedValueOnce({
      success: true,
      planRunId: 'plan-run-waiting',
      status: 'waiting_task',
      executedStepKeys: ['analyze_story'],
      waitingTaskId: 'task-waiting-1',
      snapshot: {
        planRun: {
          id: 'plan-run-waiting',
          planId: null,
        },
      },
    })
    const writerEvents: Array<Record<string, unknown>> = []
    const operations = createAgentSkillOperations()

    await operations.execute_plan.execute(buildContext(writerEvents), {
      goal: '分析小说并生成短剧脚本。',
      loadedSkillIds: ['screenwriting'],
      confirmed: true,
      steps: [
        {
          stepKey: 'analyze_story',
          skillId: 'screenwriting',
          operationId: 'write_screenplay',
          reason: '分析当前项目故事内容。',
          requiresApproval: true,
        },
      ],
    })

    expect(writerEvents).toEqual([
      expect.objectContaining({
        type: 'data-plan-run-submitted',
        data: {
          operationId: 'execute_plan',
          planRunId: 'plan-run-waiting',
          status: 'waiting_task',
          executedStepKeys: ['analyze_story'],
          waitingTaskId: 'task-waiting-1',
        },
      }),
    ])
  })

  it('validate_plan accepts final video assembly artifacts', async () => {
    const operations = createAgentSkillOperations()

    const raw = await operations.validate_plan.execute(buildContext(), {
      goal: '拼接三段真实镜头并生成最终视频。',
      loadedSkillIds: ['edit-first-video-director', 'media-generation'],
      steps: [
        {
          stepKey: 'shot_01_materialize',
          skillId: 'media-generation',
          operationId: 'generate_panel_video',
          reason: '真实生成第一个镜头视频。',
          outputArtifacts: ['panel.video'],
          requiresApproval: true,
        },
        {
          stepKey: 'shot_02_materialize',
          skillId: 'media-generation',
          operationId: 'generate_panel_video',
          reason: '真实生成第二个镜头视频。',
          outputArtifacts: ['panel.video'],
          requiresApproval: true,
        },
        {
          stepKey: 'shot_03_materialize',
          skillId: 'media-generation',
          operationId: 'generate_panel_video',
          reason: '真实生成第三个镜头视频。',
          outputArtifacts: ['panel.video'],
          requiresApproval: true,
        },
        {
          stepKey: 'assemble_final_video',
          skillId: 'edit-first-video-director',
          operationId: 'assemble_timeline_video',
          reason: '拼接已完成的 panel 视频，产出最终可播放视频。',
          inputArtifacts: ['panel.video'],
          outputArtifacts: ['final.video'],
          dependsOn: ['shot_01_materialize', 'shot_02_materialize', 'shot_03_materialize'],
          requiresApproval: true,
        },
      ],
    })

    expect(raw).toMatchObject({
      ok: true,
      issues: [],
    })
  })

  it('invoke_operation requests confirmation through the gateway operation', async () => {
    const writerEvents: Array<Record<string, unknown>> = []
    const operations = createAgentSkillOperations()

    await operations.invoke_operation.execute(buildContext(writerEvents), {
      skillId: 'media-generation',
      operationId: 'generate_project_music',
      input: {
        prompt: 'quiet suspense theme',
        durationSeconds: 30,
      },
    })

    expect(writerEvents).toEqual([
      expect.objectContaining({
        type: 'data-confirmation-request',
        data: expect.objectContaining({
          operationId: 'invoke_operation',
          argsHint: expect.objectContaining({
            skillId: 'media-generation',
            operationId: 'generate_project_music',
            input: expect.objectContaining({
              confirmed: true,
            }),
          }),
        }),
      }),
    ])
  })
})
