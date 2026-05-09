import { describe, expect, it } from 'vitest'
import type { NextRequest } from 'next/server'
import {
  buildEditTimelineBlackboard,
  parseEditTimeline,
  type EditTimelineBlackboard,
  type EditTimeline,
} from '@/lib/edit-timeline'
import { createProjectAgentOperationRegistryForApi } from '@/lib/operations/registry'
import type {
  ProjectAgentOperationContext,
  ProjectAgentOperationDefinition,
} from '@/lib/operations/types'
import type {
  EditTimelineAgentCrew,
  ProjectAgentWorkflowSnapshot,
} from '@/lib/project-agent/types'

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

function loadOperation(operationId: string): ProjectAgentOperationDefinition {
  const registry = createProjectAgentOperationRegistryForApi()
  const operation = registry[operationId]
  expect(operation).toBeDefined()
  if (!operation) {
    throw new Error(`TEST_OPERATION_MISSING:${operationId}`)
  }
  return operation
}

const baseTimeline: EditTimeline = {
  id: 'timeline-ops',
  title: 'Fifteen second reversal',
  aspectRatio: '9:16',
  fps: 24,
  segments: [
    {
      id: 'seg-hook',
      label: 'Hook and reversal',
      startMs: 0,
      durationMs: 15_000,
      intent: 'Set up the mistaken assumption and reverse it.',
      shotIds: ['shot-hook', 'shot-reversal'],
    },
  ],
  shots: [
    {
      id: 'shot-hook',
      segmentId: 'seg-hook',
      title: 'Wrong clue',
      goal: 'Show the clue that makes the viewer believe the wrong person is responsible.',
      track: 'video',
      order: 1,
      startMs: 0,
      durationMs: 7_000,
      dependsOn: [],
      referenceIds: ['character-lead'],
      control: {
        prompt: 'Close shot of the lead finding a suspicious receipt on the table.',
        firstFrameRef: 'media:first-frame',
        referenceImageRefs: ['media:lead-ref'],
      },
    },
    {
      id: 'shot-reversal',
      segmentId: 'seg-hook',
      title: 'Hidden witness',
      goal: 'Reveal the person who staged the clue.',
      track: 'video',
      order: 2,
      startMs: 7_000,
      durationMs: 8_000,
      dependsOn: ['shot-hook'],
      referenceIds: ['character-lead', 'location-room'],
      control: {
        prompt: 'Medium reveal of the hidden witness stepping out from behind the glass door.',
        lastFrameRef: 'media:last-frame',
        characterRefIds: ['character-lead'],
      },
    },
  ],
  references: [
    {
      id: 'character-lead',
      kind: 'character',
      label: 'Lead character identity',
      artifactRef: 'media:lead-ref',
    },
    {
      id: 'location-room',
      kind: 'location',
      label: 'Apartment room',
      artifactRef: 'artifact:apartment-room',
    },
  ],
  continuityBible: {
    characters: ['The lead keeps the same jacket and hairstyle.'],
    locations: ['The glass door stays behind the table.'],
    visualRules: ['No color palette jump between shots.'],
    audioRules: ['Keep room tone continuous under the reveal.'],
  },
}

describe('edit timeline operations', () => {
  it('registers timeline operations as plan/query operations without side effects', () => {
    const registry = createProjectAgentOperationRegistryForApi()
    const operationIds = [
      'create_edit_timeline_plan',
      'validate_edit_timeline',
      'compile_edit_timeline',
      'score_edit_timeline_trace',
      'redo_timeline_shot',
    ]

    for (const operationId of operationIds) {
      const operation = registry[operationId]
      expect(operation).toMatchObject({
        id: operationId,
        groupPath: ['edit-timeline'],
        channels: { tool: true, api: true },
        effects: {
          writes: false,
          billable: false,
          destructive: false,
          overwrite: false,
          bulk: false,
          externalSideEffects: false,
          longRunning: false,
        },
        confirmation: { required: false },
      })
      expect(['plan', 'query']).toContain(operation?.intent)
    }
  })

  it('registers edit-first materialize and assembly operations as confirmed write operations', () => {
    const registry = createProjectAgentOperationRegistryForApi()

    expect(registry.start_edit_timeline_production_run).toMatchObject({
      id: 'start_edit_timeline_production_run',
      groupPath: ['edit-timeline'],
      channels: { tool: true, api: true },
      intent: 'act',
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: true,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: { required: true },
    })
    expect(registry.materialize_edit_timeline_storyboard).toMatchObject({
      id: 'materialize_edit_timeline_storyboard',
      groupPath: ['edit-timeline'],
      channels: { tool: true, api: true },
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      confirmation: { required: true },
    })
    expect(registry.assemble_timeline_video).toMatchObject({
      id: 'assemble_timeline_video',
      groupPath: ['edit-timeline'],
      channels: { tool: true, api: true },
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: false,
        overwrite: true,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: { required: true },
    })
  })

  it('create_edit_timeline_plan returns a generic multi-agent workflow for the short-drama acceptance case', async () => {
    const operation = loadOperation('create_edit_timeline_plan')

    const writerEvents: Array<Record<string, unknown>> = []
    const raw = await operation.execute(buildContext(writerEvents), {
      goal: '一个刚毕业的女生在深夜办公室加班，情绪低落。她看到屏幕上空白的创作页面，开始输入自己的故事。随着 AI 工具生成画面，她的情绪从疲惫转向兴奋，最后短片完成，屏幕光照亮她的脸。',
      timelineId: 'timeline-draft',
      title: '深夜创作反转',
      aspectRatio: '9:16',
      fps: 24,
      targetDurationMs: 15_000,
      outline: '0-3s 深夜办公室压抑开场；3-6s 她输入故事想法；6-10s AI 生成角色、场景和镜头时间线；10-15s 短片完成，屏幕光照亮她的脸。',
      references: baseTimeline.references,
    })

    expect(raw).toMatchObject({
      sourceStory: expect.stringContaining('一个刚毕业的女生在深夜办公室加班'),
      timeline: {
        id: 'timeline-draft',
        title: '深夜创作反转',
        aspectRatio: '9:16',
        fps: 24,
      },
      unresolvedRefs: [],
      estimatedTaskCount: 4,
      creativeBrief: expect.objectContaining({
        targetDurationMs: 15_000,
        aspectRatio: '9:16',
      }),
      agentCrew: expect.objectContaining({
        director: expect.objectContaining({
          role: 'main-director',
          mission: expect.stringContaining('blackboard'),
        }),
        subagents: expect.arrayContaining([
          expect.objectContaining({ role: 'screenplay-agent' }),
          expect.objectContaining({ role: 'cinematography-agent' }),
          expect.objectContaining({ role: 'continuity-agent' }),
          expect.objectContaining({ role: 'prompt-engineer-agent' }),
          expect.objectContaining({ role: 'sound-agent' }),
        ]),
        synthesis: expect.stringContaining('blackboard'),
      }),
      workflow: expect.objectContaining({
        intent: 'video-generation',
        skillIds: expect.arrayContaining(['edit-first-video-director']),
      }),
    })
    const timeline = parseEditTimeline((raw as { timeline: unknown }).timeline)
    const agentCrew = (raw as { agentCrew: EditTimelineAgentCrew }).agentCrew
    const blackboard = (raw as { blackboard: EditTimelineBlackboard }).blackboard
    const workflow = (raw as { workflow: ProjectAgentWorkflowSnapshot }).workflow
    const timelineShotIds = timeline.shots.map((shot) => shot.id)
    expect(agentCrew.subagents.map((contribution) => contribution.role).sort()).toEqual([
      'cinematography-agent',
      'continuity-agent',
      'prompt-engineer-agent',
      'screenplay-agent',
      'sound-agent',
    ])
    const firstSegmentBlackboard = blackboard.segmentBlackboards[0]
    if (!firstSegmentBlackboard) {
      throw new Error('TEST_EXPECTED_FIRST_SEGMENT_BLACKBOARD')
    }
    const cinematographyAgent = agentCrew.subagents.find((contribution) => contribution.role === 'cinematography-agent')
    const screenplayAgent = agentCrew.subagents.find((contribution) => contribution.role === 'screenplay-agent')
    const continuityAgent = agentCrew.subagents.find((contribution) => contribution.role === 'continuity-agent')
    const promptEngineerAgent = agentCrew.subagents.find((contribution) => contribution.role === 'prompt-engineer-agent')
    const soundAgent = agentCrew.subagents.find((contribution) => contribution.role === 'sound-agent')
    expect(cinematographyAgent?.outputs[0]?.text).toContain(firstSegmentBlackboard.cinematography.camera)
    expect(screenplayAgent?.outputs[0]?.text).toContain(firstSegmentBlackboard.screenplay.visibleAction)
    expect(continuityAgent?.outputs[0]?.text).toContain(firstSegmentBlackboard.continuity.characterContinuity)
    expect(promptEngineerAgent?.outputs[0]?.text).toContain(firstSegmentBlackboard.promptPackage.providerPrompt)
    expect(soundAgent?.outputs[0]?.text).toContain(firstSegmentBlackboard.soundPlan.cues[0])
    expect(agentCrew.director.shotIds).toEqual(timelineShotIds)
    expect(agentCrew.director.outputs.map((output) => output.shotId)).toEqual(timeline.segments.map((segment) => segment.shotIds[0]))
    for (const contribution of agentCrew.subagents) {
      expect(contribution.shotIds).toEqual(timelineShotIds)
      expect(contribution.outputs.map((output) => output.shotId)).toEqual(timelineShotIds)
      expect(contribution.mission.trim().length).toBeGreaterThan(0)
      expect(contribution.status).toBe('drafted')
    }
    for (const shot of timeline.shots) {
      expect(shot.editorial?.visual).toBeTruthy()
      expect(shot.editorial?.story).toBeTruthy()
      expect(shot.editorial?.sound).toBeTruthy()
      expect(shot.editorial?.caption).toBeTruthy()
    }
    expect(timeline.segments.map((segment) => [segment.startMs, segment.durationMs])).toEqual([
      [0, 3_000],
      [3_000, 3_000],
      [6_000, 4_000],
      [10_000, 5_000],
    ])
    expect(timeline.shots).toHaveLength(4)
    expect(workflow.shots.map((shot) => shot.shotId)).toEqual(timelineShotIds)
    expect(workflow.blackboard?.timelineId).toBe('timeline-draft')
    expect(blackboard.agents.map((agent) => agent.role)).toEqual([
      'main-director',
      'screenplay-agent',
      'cinematography-agent',
      'continuity-agent',
      'prompt-engineer-agent',
      'sound-agent',
      'provider-production-agent',
      'film-critic-agent',
    ])
    expect(blackboard.macroScript.map((segment) => segment.segmentId)).toEqual(timeline.segments.map((segment) => segment.id))
    expect(blackboard.macroScript.map((segment) => [segment.startMs, segment.endMs])).toEqual([
      [0, 3_000],
      [3_000, 6_000],
      [6_000, 10_000],
      [10_000, 15_000],
    ])
    expect(blackboard.segmentBlackboards.map((segment) => segment.segmentId)).toEqual(timeline.segments.map((segment) => segment.id))
    expect(blackboard.segmentBlackboards.every((segment) => segment.agentStates.some((agent) => agent.role === 'sound-agent'))).toBe(true)
    expect(blackboard.segmentBlackboards.every((segment) => segment.promptPackage.imagePrompt.includes('opening frame'))).toBe(true)
    expect(blackboard.segmentBlackboards.every((segment) => segment.promptPackage.imagePrompt !== segment.promptPackage.providerPrompt)).toBe(true)
    expect(blackboard.segmentBlackboards.every((segment) => segment.promptPackage.providerPrompt.includes('subject visible'))).toBe(true)
    expect(blackboard.segmentBlackboards.every((segment) => segment.soundPlan.blocking === false)).toBe(true)
    for (const segment of blackboard.segmentBlackboards) {
      expect(segment.agentStates.find((agent) => agent.role === 'cinematography-agent')?.outputs).toEqual(expect.arrayContaining([
        expect.stringMatching(/^camera:/),
        expect.stringMatching(/^motion:/),
        expect.stringMatching(/^lighting:/),
      ]))
      expect(segment.agentStates.find((agent) => agent.role === 'prompt-engineer-agent')?.outputs).toEqual(expect.arrayContaining([
        expect.stringMatching(/^image-prompt:/),
        expect.stringMatching(/^video-prompt:/),
      ]))
    }
    expect(blackboard.shots.map((shot) => shot.shotId)).toEqual(timelineShotIds)
    expect(blackboard.shots.every((shot) => shot.ownerAgentId === 'prompt-engineer-agent')).toBe(true)
    expect(blackboard.shots.every((shot) => shot.promptPackage.imagePrompt.includes('opening frame'))).toBe(true)
    expect(blackboard.shots.every((shot) => shot.promptPackage.providerPrompt.includes('subject visible'))).toBe(true)
    expect(blackboard.finalCritic).toMatchObject({
      status: 'planned',
      score: 0,
      evidenceRefs: [],
    })
    expect(workflow.providerTasks).toHaveLength(timelineShotIds.length)
    expect(workflow.providerTasks.map((task) => task.shotId)).toEqual(timelineShotIds)
    expect(workflow.providerTasks.every((task) => task.assetPolicy === 'text-to-video')).toBe(true)
    expect(workflow.evals[0]?.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'required-subagents-present', status: 'passed' }),
      expect.objectContaining({ code: 'shot-output-binding', status: 'passed' }),
      expect.objectContaining({ code: 'blackboard-required-roles', status: 'passed' }),
      expect.objectContaining({ code: 'blackboard-shot-prompt-packages', status: 'passed' }),
    ]))
    expect(writerEvents).toEqual([
      expect.objectContaining({
        type: 'data-edit-timeline',
        data: expect.objectContaining({
          timeline: expect.objectContaining({
            id: 'timeline-draft',
            title: '深夜创作反转',
          }),
          sourceStory: expect.stringContaining('一个刚毕业的女生在深夜办公室加班'),
          estimatedTaskCount: 4,
          creativeBrief: expect.objectContaining({
            targetDurationMs: 15_000,
          }),
          workflow: expect.objectContaining({
            intent: 'video-generation',
            blackboard: expect.objectContaining({
              timelineId: 'timeline-draft',
              nextOptimizationTarget: expect.any(String),
            }),
            providerTasks: expect.arrayContaining([
              expect.objectContaining({
                operationId: 'generate_panel_video',
                assetPolicy: 'text-to-video',
              }),
            ]),
          }),
          agentCrew: expect.objectContaining({
            subagents: expect.arrayContaining([
              expect.objectContaining({ role: 'screenplay-agent' }),
              expect.objectContaining({ role: 'cinematography-agent' }),
              expect.objectContaining({ role: 'continuity-agent' }),
              expect.objectContaining({ role: 'prompt-engineer-agent' }),
              expect.objectContaining({ role: 'sound-agent' }),
            ]),
          }),
          blackboard: expect.objectContaining({
            timelineId: 'timeline-draft',
            agents: expect.arrayContaining([
              expect.objectContaining({ role: 'film-critic-agent' }),
            ]),
          }),
        }),
      }),
    ])
  })

  it('builds a story-specific multi-agent workflow for a different creative request', async () => {
    const operation = loadOperation('create_edit_timeline_plan')

    const raw = await operation.execute(buildContext(), {
      goal: '做一个 8 秒横屏产品演示视频，展示咖啡机从咖啡豆研磨、萃取到出杯的三个步骤，风格干净明亮。',
    })

    expect(raw).toMatchObject({
      timeline: {
        aspectRatio: '16:9',
        fps: 24,
      },
      creativeBrief: expect.objectContaining({
        targetDurationMs: 8_000,
        aspectRatio: '16:9',
      }),
      workflow: expect.objectContaining({
        intent: 'video-generation',
        skillIds: expect.arrayContaining(['edit-first-video-director']),
      }),
    })
    const timeline = parseEditTimeline((raw as { timeline: unknown }).timeline)
    const serializedTimeline = JSON.stringify(timeline)
    expect(serializedTimeline).toContain('咖啡机')
    expect(serializedTimeline).not.toContain('深夜办公室')
    expect(serializedTimeline).not.toContain('刚毕业')
    expect(timeline.shots).toHaveLength(3)
    expect(timeline.shots.reduce((sum, shot) => sum + shot.durationMs, 0)).toBe(8_000)
  })

  it('lets the Main Director derive different macro scripts from different arbitrary stories instead of using a fixed template', async () => {
    const operation = loadOperation('create_edit_timeline_plan')

    const convenienceStore = await operation.execute(buildContext(), {
      goal: '雨夜便利店，一个年轻人进门躲雨，手机时间停在凌晨 3:07，门外出现另一个自己。请做成 12 秒竖屏 silent video。',
      targetDurationMs: 12_000,
      aspectRatio: '9:16',
    })
    const coffeeMachine = await operation.execute(buildContext(), {
      goal: '做一个 9 秒横屏产品视频，展示咖啡豆倒入透明料仓、机器开始研磨、浓缩咖啡流入杯子的三个步骤，明亮干净。',
      targetDurationMs: 9_000,
      aspectRatio: '16:9',
    })

    const firstBlackboard = (convenienceStore as { blackboard: EditTimelineBlackboard }).blackboard
    const secondBlackboard = (coffeeMachine as { blackboard: EditTimelineBlackboard }).blackboard
    const firstGoals = firstBlackboard.macroScript.map((segment) => segment.beatGoal)
    const secondGoals = secondBlackboard.macroScript.map((segment) => segment.beatGoal)
    const serializedCoffeeMacro = JSON.stringify(secondBlackboard.macroScript)

    expect(firstGoals).not.toEqual(secondGoals)
    expect(firstGoals.join('\n')).toContain('便利店')
    expect(secondGoals.join('\n')).toContain('咖啡')
    expect(serializedCoffeeMacro).not.toContain('收银员')
    expect(serializedCoffeeMacro).not.toContain('凌晨 3:07')
    expect(serializedCoffeeMacro).not.toContain('另一个自己')
    expect(firstBlackboard.segmentBlackboards).toHaveLength(firstBlackboard.macroScript.length)
    expect(secondBlackboard.segmentBlackboards).toHaveLength(secondBlackboard.macroScript.length)
  })

  it('creates story-specific specialist artifacts instead of repeating template restatements', async () => {
    const operation = loadOperation('create_edit_timeline_plan')

    const raw = await operation.execute(buildContext(), {
      goal: 'A toy repairman locks up a closed subway station. He finds a glowing paper crane inside a broken music box. The crane unfolds into a map and the last train arrives with no driver.',
      targetDurationMs: 9_000,
      aspectRatio: '9:16',
      hasAudio: false,
      hasSubtitle: false,
    })

    const timeline = parseEditTimeline((raw as { timeline: unknown }).timeline)
    const agentCrew = (raw as { agentCrew: EditTimelineAgentCrew }).agentCrew
    const blackboard = (raw as { blackboard: EditTimelineBlackboard }).blackboard
    const macroGoals = blackboard.macroScript.map((segment) => segment.beatGoal)
    const generatedTexts = [
      ...timeline.segments.map((segment) => segment.intent),
      ...timeline.shots.flatMap((shot) => [
        shot.goal,
        shot.editorial?.visual ?? '',
        shot.editorial?.story ?? '',
        shot.editorial?.sound ?? '',
        shot.editorial?.caption ?? '',
        shot.control.prompt,
      ]),
      ...agentCrew.director.outputs.map((output) => output.text),
      ...agentCrew.subagents.flatMap((agent) => [
        agent.summary,
        ...agent.outputs.map((output) => output.text),
      ]),
      ...blackboard.segmentBlackboards.flatMap((segment) => [
        segment.screenplay.visibleAction,
        segment.cinematography.camera,
        segment.cinematography.composition,
        segment.cinematography.lighting,
        segment.continuity.characterContinuity,
        segment.continuity.locationContinuity,
        segment.promptPackage.imagePrompt,
        segment.promptPackage.providerPrompt,
      ]),
    ].join('\n')

    expect(macroGoals).toHaveLength(3)
    expect(macroGoals[0]).toMatch(/locks up a closed subway station/i)
    expect(macroGoals[0]).not.toMatch(/paper crane|last train/i)
    expect(macroGoals[1]).toMatch(/paper crane|music box/i)
    expect(macroGoals[2]).toMatch(/last train|no driver/i)
    expect(generatedTexts).toContain('paper crane')
    expect(generatedTexts).toContain('music box')
    expect(generatedTexts).toContain('last train')
    expect(generatedTexts).not.toMatch(/Based on the user request/i)
    expect(generatedTexts).not.toMatch(/This shot advances/i)
    expect(generatedTexts).not.toMatch(/requested goal/i)
    expect(generatedTexts).not.toMatch(/dramatic progression/i)
    expect(generatedTexts).not.toMatch(/Story Agent:/i)
    expect(generatedTexts).not.toMatch(/Visual Agent:/i)
    for (const segment of blackboard.segmentBlackboards) {
      const screenplay = segment.screenplay.visibleAction.trim()
      const cinematography = `${segment.cinematography.camera} ${segment.cinematography.motion}`.trim()
      const continuity = `${segment.continuity.characterContinuity} ${segment.continuity.locationContinuity}`.trim()
      const prompt = segment.promptPackage.providerPrompt.trim()

      expect(screenplay).toBeTruthy()
      expect(cinematography).toBeTruthy()
      expect(continuity).toBeTruthy()
      expect(prompt).toBeTruthy()
      expect(new Set([screenplay, cinematography, continuity, prompt]).size).toBe(4)
    }
  })

  it('plans text-to-video provider tasks when no reference assets are available', async () => {
    const operation = loadOperation('create_edit_timeline_plan')

    const raw = await operation.execute(buildContext(), {
      goal: '生成一个 6 秒竖屏抽象科幻循环视频，只有文字描述，没有参考素材。',
      targetDurationMs: 6_000,
      aspectRatio: '9:16',
    })

    const workflow = (raw as { workflow: ProjectAgentWorkflowSnapshot }).workflow
    expect(workflow.assets).toEqual([
      expect.objectContaining({
        status: 'planned',
        source: 'text-only',
      }),
    ])
    expect(workflow.providerTasks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        requiredModelType: 'video',
        assetPolicy: 'text-to-video',
        status: 'planned',
        blockers: [],
      }),
    ]))
  })

  it('infers customer wording for vertical aspect ratio and 15 second duration', async () => {
    const operation = loadOperation('create_edit_timeline_plan')

    const raw = await operation.execute(buildContext(), {
      goal: '一个刚毕业的女生在深夜办公室加班，情绪低落。她看到屏幕上空白的创作页面，开始输入自己的故事。随着 AI 工具生成画面，她的情绪从疲惫转向兴奋，最后短片完成，屏幕光照亮她的脸。帮我生成一段 15 秒竖屏短动画。',
    })

    expect(raw).toMatchObject({
      timeline: {
        aspectRatio: '9:16',
        fps: 24,
      },
      creativeBrief: expect.objectContaining({
        targetDurationMs: 15_000,
        aspectRatio: '9:16',
        assumptions: expect.arrayContaining([
          expect.stringContaining('镜头'),
          expect.stringContaining('24 fps'),
        ]),
      }),
      risks: [],
      estimatedTaskCount: 4,
    })
    const timeline = parseEditTimeline((raw as { timeline: unknown }).timeline)
    expect(timeline.segments.map((segment) => [segment.startMs, segment.durationMs])).toEqual([
      [0, 3_000],
      [3_000, 3_000],
      [6_000, 4_000],
      [10_000, 5_000],
    ])
  })

  it('honors explicit three-shot twelve-second vertical silent video requests from the story text', async () => {
    const operation = loadOperation('create_edit_timeline_plan')

    const raw = await operation.execute(buildContext(), {
      goal: '雨夜便利店。凌晨两点，一个疲惫的外卖员冲进便利店躲雨，发现收银台后坐着一个总在夜班画漫画的女生。停电瞬间，货架灯一闪一闪，他们用手机手电照亮漫画本和外卖箱。雨声慢慢变小，女生把他的狼狈画成一张像英雄一样的分镜。最后天亮，外卖员把热咖啡放在柜台，两个人隔着玻璃看见第一缕阳光。请做成 12 秒竖屏 9:16 漫画风 silent video，3 个镜头，无声音无字幕，主体清楚、动作简单、便利店雨夜场景连续。',
    })

    const timeline = parseEditTimeline((raw as { timeline: unknown }).timeline)
    const workflow = (raw as { workflow: ProjectAgentWorkflowSnapshot }).workflow
    const blackboard = (raw as { blackboard: { shots: Array<{ shotId: string }> } }).blackboard
    const serializedTimeline = JSON.stringify(timeline)

    expect(raw).toMatchObject({
      timeline: {
        aspectRatio: '9:16',
        fps: 24,
      },
      creativeBrief: expect.objectContaining({
        targetDurationMs: 12_000,
        aspectRatio: '9:16',
      }),
      estimatedTaskCount: 3,
    })
    expect(timeline.shots).toHaveLength(3)
    expect(timeline.shots.reduce((sum, shot) => sum + shot.durationMs, 0)).toBe(12_000)
    expect(workflow.providerTasks).toHaveLength(3)
    expect(blackboard.shots.map((shot) => shot.shotId)).toEqual(timeline.shots.map((shot) => shot.id))
    expect(serializedTimeline).toContain('外卖员')
    expect(serializedTimeline).toContain('手机手电')
    expect(serializedTimeline).toContain('热咖啡')
  })

  it('accepts assistant-extracted shot count and media constraints without dropping back to default beats', async () => {
    const operation = loadOperation('create_edit_timeline_plan')

    const raw = await operation.execute(buildContext(), {
      goal: '雨夜便利店。凌晨两点，一个疲惫的外卖员冲进便利店躲雨，发现收银台后坐着一个总在夜班画漫画的女生。停电瞬间，货架灯一闪一闪，他们用手机手电照亮漫画本和外卖箱。雨声慢慢变小，女生把他的狼狈画成一张像英雄一样的分镜。最后天亮，外卖员把热咖啡放在柜台，两个人隔着玻璃看见第一缕阳光。',
      duration: 12,
      aspectRatio: '9:16',
      shotCount: 3,
      style: '漫画风',
      hasAudio: false,
      hasSubtitle: false,
    })

    const timeline = parseEditTimeline((raw as { timeline: unknown }).timeline)
    const serializedTimeline = JSON.stringify(timeline)

    expect(raw).toMatchObject({
      creativeBrief: expect.objectContaining({
        targetDurationMs: 12_000,
        aspectRatio: '9:16',
      }),
      estimatedTaskCount: 3,
    })
    expect(timeline.shots).toHaveLength(3)
    expect(timeline.shots.reduce((sum, shot) => sum + shot.durationMs, 0)).toBe(12_000)
    expect(serializedTimeline).toContain('漫画风')
    expect(serializedTimeline).toContain('silent video')
    expect(serializedTimeline).toContain('no subtitles')
  })

  it('keeps planned provider output urls schema-compatible for extracted UI requests', async () => {
    const operation = loadOperation('create_edit_timeline_plan')

    const raw = await operation.execute(buildContext(), {
      goal: '雨夜，一个疲惫的外卖员走进便利店躲雨，发现夜班女孩正在画漫画。停电后，他们用手机手电照亮漫画本和外卖箱。天亮时，女孩把他狼狈的样子画成英雄分镜。',
      style: 'american-comic',
      hasAudio: true,
      aspectRatio: '9:16',
      hasSubtitle: true,
      targetDurationMs: 12_000,
    })

    expect(operation.outputSchema.safeParse(raw)).toMatchObject({ success: true })
  })

  it('validate_edit_timeline returns structured issues instead of hiding invalid references', async () => {
    const operation = loadOperation('validate_edit_timeline')
    const invalidTimeline: EditTimeline = {
      ...baseTimeline,
      shots: [
        {
          ...baseTimeline.shots[0],
          referenceIds: ['missing-reference'],
        },
      ],
    }

    const raw = await operation.execute(buildContext(), { timeline: invalidTimeline })

    expect(raw).toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          code: 'EDIT_TIMELINE_UNKNOWN_SHOT_REFERENCE',
          message: 'EDIT_TIMELINE_UNKNOWN_SHOT_REFERENCE:shot-hook:missing-reference',
        }),
      ],
    })
  })

  it('compile_edit_timeline returns a PlanRun draft without executing provider work', async () => {
    const operation = loadOperation('compile_edit_timeline')

    const raw = await operation.execute(buildContext(), {
      timeline: baseTimeline,
      materializeSkillId: 'media-generation',
      materializeOperationId: 'generate_panel_video',
    })

    expect(raw).toMatchObject({
      plan: {
        goal: 'Edit-first timeline: Fifteen second reversal',
        steps: [
          expect.objectContaining({
            stepKey: 'shot_shot_hook_materialize',
            skillId: 'media-generation',
            operationId: 'generate_panel_video',
            input: expect.objectContaining({
              editFirst: true,
              timelineId: 'timeline-ops',
              segmentId: 'seg-hook',
              shotId: 'shot-hook',
              shotTitle: 'Wrong clue',
              referenceIds: ['character-lead'],
              controlPayload: expect.objectContaining({
                firstFrameRef: 'media:first-frame',
              }),
            }),
          }),
          expect.objectContaining({
            stepKey: 'shot_shot_reversal_materialize',
            dependsOn: ['shot_shot_hook_materialize'],
          }),
        ],
      },
      estimatedStepCount: 2,
      confirmationSummary: expect.objectContaining({
        timelineId: 'timeline-ops',
        shotCount: 2,
        providerTaskCount: 2,
        redoCandidates: ['shot-hook', 'shot-reversal'],
      }),
      workflow: expect.objectContaining({
        intent: 'video-generation',
        providerTasks: [
          expect.objectContaining({
            shotId: 'shot-hook',
            operationId: 'generate_panel_video',
            target: null,
          }),
          expect.objectContaining({
            shotId: 'shot-reversal',
            operationId: 'generate_panel_video',
            target: null,
          }),
        ],
      }),
    })
  })

  it('compile_edit_timeline uses blackboard prompt packages as provider inputs when a blackboard is supplied', async () => {
    const operation = loadOperation('compile_edit_timeline')
    const timeline = parseEditTimeline(baseTimeline)
    const plannedBlackboard = buildEditTimelineBlackboard({
      timeline,
      sourceStory: 'A noir corridor story.',
      creativeBrief: {
        theme: 'Noir corridor reveal',
        protagonist: 'Ava',
        setting: 'hospital corridor',
        mood: 'quiet mystery',
        twist: 'Ava steps into the light',
        targetDurationMs: 10_000,
        aspectRatio: '16:9',
        missingInfo: [],
        assumptions: [],
      },
      risks: [],
    })
    const blackboardPrompt = 'BLACKBOARD RUNTIME PROMPT: Ava visibly opens the door, subject visible, no abstract mood.'
    const blackboardNegativePrompt = 'BLACKBOARD NEGATIVE PROMPT: no old timeline prompt'
    const blackboard: EditTimelineBlackboard = {
      ...plannedBlackboard,
      shots: plannedBlackboard.shots.map((shot) => shot.shotId === 'shot-hook'
        ? {
            ...shot,
            promptPackage: {
              ...shot.promptPackage,
              providerPrompt: blackboardPrompt,
              negativePrompt: blackboardNegativePrompt,
            },
          }
        : shot),
      segmentBlackboards: plannedBlackboard.segmentBlackboards.map((segment) => segment.segmentId === 'seg-hook'
        ? {
            ...segment,
            promptPackage: {
              ...segment.promptPackage,
              providerPrompt: blackboardPrompt,
              negativePrompt: blackboardNegativePrompt,
            },
          }
        : segment),
    }

    const raw = await operation.execute(buildContext(), {
      timeline: baseTimeline,
      blackboard,
      materializeSkillId: 'media-generation',
      materializeOperationId: 'generate_panel_video',
    })

    const compiled = raw as { plan: { steps: Array<{ input?: Record<string, unknown> }> } }
    const firstInput = compiled.plan.steps[0]?.input
    expect(firstInput).toMatchObject({
      shotId: 'shot-hook',
      blackboardSegmentId: 'seg-hook',
      controlPayload: expect.objectContaining({
        prompt: blackboardPrompt,
        negativePrompt: blackboardNegativePrompt,
      }),
      promptPackage: expect.objectContaining({
        providerPrompt: blackboardPrompt,
      }),
    })
    const controlPayload = firstInput?.controlPayload as { prompt?: unknown } | undefined
    expect(controlPayload?.prompt).not.toContain('Close shot of the lead finding a suspicious receipt')
  })

  it('compile_edit_timeline uses blackboard providerPrompt for every provider video step without timeline fallback', async () => {
    const operation = loadOperation('compile_edit_timeline')
    const timeline = parseEditTimeline(baseTimeline)
    const plannedBlackboard = buildEditTimelineBlackboard({
      timeline,
      sourceStory: 'A noir corridor story.',
      creativeBrief: {
        theme: 'Noir corridor reveal',
        protagonist: 'Ava',
        setting: 'hospital corridor',
        mood: 'quiet mystery',
        twist: 'Ava steps into the light',
        targetDurationMs: 10_000,
        aspectRatio: '16:9',
        missingInfo: [],
        assumptions: [],
      },
      risks: [],
    })
    const blackboard: EditTimelineBlackboard = {
      ...plannedBlackboard,
      shots: plannedBlackboard.shots.map((shot) => ({
        ...shot,
        promptPackage: {
          ...shot.promptPackage,
          imagePrompt: `BLACKBOARD_IMAGE_PROMPT:${shot.shotId}`,
          providerPrompt: `BLACKBOARD_PROVIDER_PROMPT:${shot.shotId}: subject visible`,
        },
      })),
      segmentBlackboards: plannedBlackboard.segmentBlackboards.map((segment) => ({
        ...segment,
        promptPackage: {
          ...segment.promptPackage,
          imagePrompt: `BLACKBOARD_IMAGE_PROMPT:${segment.shotIds[0]}`,
          providerPrompt: `BLACKBOARD_PROVIDER_PROMPT:${segment.shotIds[0]}: subject visible`,
        },
      })),
    }

    const raw = await operation.execute(buildContext(), {
      timeline: baseTimeline,
      blackboard,
      materializeSkillId: 'media-generation',
      materializeOperationId: 'generate_panel_video',
      videoModel: 'google::veo-3.1-generate-preview',
      panelIdsByShotId: {
        'shot-hook': 'panel-hook',
        'shot-reversal': 'panel-reversal',
      },
    })

    const compiled = raw as { plan: { steps: Array<{ operationId: string; input?: Record<string, unknown> }> } }
    const providerSteps = compiled.plan.steps.filter((step) => step.operationId === 'generate_panel_video')
    expect(providerSteps).toHaveLength(2)
    for (const step of providerSteps) {
      const shotId = step.input?.shotId
      expect(typeof shotId).toBe('string')
      const expectedPrompt = `BLACKBOARD_PROVIDER_PROMPT:${shotId as string}: subject visible`
      expect(step.input?.promptPackage).toMatchObject({
        providerPrompt: expectedPrompt,
      })
      expect(step.input?.controlPayload).toMatchObject({
        prompt: expectedPrompt,
      })
      expect(expectedPrompt).not.toContain('suspicious receipt')
      expect(expectedPrompt).not.toContain('hidden witness stepping')
    }
  })

  it('compile_edit_timeline explicitly fails when a supplied blackboard lacks segment coverage', async () => {
    const operation = loadOperation('compile_edit_timeline')
    const timeline = parseEditTimeline(baseTimeline)
    const blackboard = buildEditTimelineBlackboard({
      timeline,
      sourceStory: 'A noir corridor story.',
      creativeBrief: {
        theme: 'Noir corridor reveal',
        protagonist: 'Ava',
        setting: 'hospital corridor',
        mood: 'quiet mystery',
        twist: 'Ava steps into the light',
        targetDurationMs: 10_000,
        aspectRatio: '16:9',
        missingInfo: [],
        assumptions: [],
      },
      risks: [],
    })

    await expect(operation.execute(buildContext(), {
      timeline: baseTimeline,
      blackboard: {
        ...blackboard,
        segmentBlackboards: [],
      },
      materializeSkillId: 'media-generation',
      materializeOperationId: 'generate_panel_video',
    })).rejects.toThrow(/EDIT_TIMELINE_BLACKBOARD_SEGMENT_COVERAGE_MISSING:seg-hook/)
  })

  it('compile_edit_timeline explicitly fails when provider targets are present without a video model', async () => {
    const operation = loadOperation('compile_edit_timeline')

    await expect(operation.execute(buildContext(), {
      timeline: baseTimeline,
      materializeSkillId: 'media-generation',
      materializeOperationId: 'generate_panel_video',
      panelIdsByShotId: {
        'shot-hook': 'panel-hook',
      },
    })).rejects.toThrow(/EDIT_TIMELINE_PROVIDER_VIDEO_MODEL_REQUIRED/)
  })

  it('compile_edit_timeline can attach explicit provider video targets for execute_plan', async () => {
    const operation = loadOperation('compile_edit_timeline')

    const raw = await operation.execute(buildContext(), {
      timeline: baseTimeline,
      materializeSkillId: 'media-generation',
      materializeOperationId: 'generate_panel_video',
      videoModel: 'google::veo-3.1-generate-preview',
      panelIdsByShotId: {
        'shot-hook': 'panel-hook',
        'shot-reversal': 'panel-reversal',
      },
      generationOptions: {
        duration: 2,
        resolution: '480p',
      },
    })

    expect(raw).toMatchObject({
      plan: {
        steps: [
          expect.objectContaining({
            stepKey: 'shot_shot_hook_materialize',
            input: expect.objectContaining({
              shotId: 'shot-hook',
              panelId: 'panel-hook',
              videoModel: 'google::veo-3.1-generate-preview',
              generationOptions: {
                duration: 2,
                resolution: '480p',
              },
            }),
          }),
          expect.objectContaining({
            stepKey: 'shot_shot_reversal_materialize',
            input: expect.objectContaining({
              shotId: 'shot-reversal',
              panelId: 'panel-reversal',
              videoModel: 'google::veo-3.1-generate-preview',
            }),
          }),
        ],
      },
      workflow: expect.objectContaining({
        providerTasks: [
          expect.objectContaining({
            shotId: 'shot-hook',
            providerModel: 'google::veo-3.1-generate-preview',
            generationOptions: {
              duration: 2,
              resolution: '480p',
            },
            target: { panelId: 'panel-hook' },
          }),
          expect.objectContaining({
            shotId: 'shot-reversal',
            providerModel: 'google::veo-3.1-generate-preview',
            generationOptions: {
              duration: 2,
              resolution: '480p',
            },
            target: { panelId: 'panel-reversal' },
          }),
        ],
      }),
    })
  })

  it('compile_edit_timeline can append a final video assembly step after provider tasks', async () => {
    const operation = loadOperation('compile_edit_timeline')

    const raw = await operation.execute(buildContext(), {
      timeline: baseTimeline,
      materializeSkillId: 'media-generation',
      materializeOperationId: 'generate_panel_video',
      videoModel: 'google::veo-3.1-generate-preview',
      panelIdsByShotId: {
        'shot-hook': 'panel-hook',
        'shot-reversal': 'panel-reversal',
      },
      generationOptions: {
        duration: 2,
        resolution: '480p',
        generateAudio: true,
      },
      assembleFinalVideo: true,
    })

    expect(raw).toMatchObject({
      plan: {
        steps: [
          expect.objectContaining({
            stepKey: 'shot_shot_hook_materialize',
            operationId: 'generate_panel_video',
          }),
          expect.objectContaining({
            stepKey: 'shot_shot_reversal_materialize',
            operationId: 'generate_panel_video',
          }),
          expect.objectContaining({
            stepKey: 'assemble_final_video',
            skillId: 'edit-first-video-director',
            operationId: 'assemble_timeline_video',
            inputArtifacts: ['panel.video'],
            outputArtifacts: ['final.video'],
            dependsOn: [
              'shot_shot_hook_materialize',
              'shot_shot_reversal_materialize',
            ],
            input: expect.objectContaining({
              panelIdsByShotId: {
                'shot-hook': 'panel-hook',
                'shot-reversal': 'panel-reversal',
              },
              renderFinalVideo: true,
            }),
          }),
        ],
      },
      estimatedStepCount: 3,
      workflow: expect.objectContaining({
        providerTasks: [
          expect.objectContaining({
            shotId: 'shot-hook',
            target: { panelId: 'panel-hook' },
          }),
          expect.objectContaining({
            shotId: 'shot-reversal',
            target: { panelId: 'panel-reversal' },
          }),
        ],
        artifacts: expect.arrayContaining([
          expect.objectContaining({
            id: 'artifact-final-video-timeline-ops',
            kind: 'video',
            status: 'planned',
          }),
        ]),
      }),
    })
    const compiled = raw as { plan: { steps: Array<{ stepKey: string; input?: Record<string, unknown> }> } }
    const assemblyStep = compiled.plan.steps.find((step) => step.stepKey === 'assemble_final_video')
    expect(assemblyStep?.input).not.toHaveProperty('editFirst')
  })

  it('assemble_timeline_video accepts confirmed plan-run input', () => {
    const operation = loadOperation('assemble_timeline_video')

    const parsed = operation.inputSchema.safeParse({
      confirmed: true,
      timeline: baseTimeline,
      panelIdsByShotId: {
        'shot-hook': 'panel-hook',
        'shot-reversal': 'panel-reversal',
      },
      renderFinalVideo: true,
    })

    expect(parsed.success).toBe(true)
  })

  it('start_edit_timeline_production_run requires an exact blackboard and accepts explicit video generation config', () => {
    const operation = loadOperation('start_edit_timeline_production_run')
    const blackboard = buildEditTimelineBlackboard({
      timeline: parseEditTimeline(baseTimeline),
      sourceStory: 'A noir corridor story.',
      creativeBrief: {
        theme: 'Noir corridor reveal',
        protagonist: 'Ava',
        setting: 'hospital corridor',
        mood: 'quiet mystery',
        twist: 'Ava steps into the light',
        targetDurationMs: 10_000,
        aspectRatio: '16:9',
        missingInfo: [],
        assumptions: [],
      },
      risks: [],
    })

    const missingBlackboard = operation.inputSchema.safeParse({
      confirmed: true,
      timeline: baseTimeline,
      videoModel: 'google::veo-3.1-generate-preview',
    })
    expect(missingBlackboard.success).toBe(false)

    const parsed = operation.inputSchema.safeParse({
      confirmed: true,
      timeline: baseTimeline,
      blackboard,
      videoModel: 'google::veo-3.1-generate-preview',
      generationOptions: {
        duration: 2,
        resolution: '480p',
      },
      renderFinalVideo: true,
    })

    expect(parsed.success).toBe(true)
  })

  it('redo_timeline_shot preserves revision metadata and limits affected shots', async () => {
    const operation = loadOperation('redo_timeline_shot')

    const raw = await operation.execute(buildContext(), {
      timeline: baseTimeline,
      shotId: 'shot-hook',
      redoReason: 'first-frame source failed trace validation',
      sourceTraceId: 'trace-step-1',
      controlPatch: {
        prompt: 'Close shot of the lead finding a clearer suspicious receipt.',
      },
    })

    const result = raw as { timeline: EditTimeline; redoPlan: unknown }
    expect(result.timeline.shots).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'shot-hook',
        control: expect.objectContaining({
          prompt: 'Close shot of the lead finding a clearer suspicious receipt.',
        }),
        revision: {
          parentShotId: 'shot-hook',
          sourceTraceId: 'trace-step-1',
          redoReason: 'first-frame source failed trace validation',
          affectedDependencies: [],
        },
      }),
    ]))
    expect(result.redoPlan).toMatchObject({
      targetShotId: 'shot-hook',
      affectedShotIds: ['shot-hook', 'shot-reversal'],
      skippedShotIds: [],
    })
  })
})
