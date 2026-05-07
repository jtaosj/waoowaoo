import { describe, expect, it } from 'vitest'
import {
  listAgentSkillManifests,
  loadAgentSkill,
  searchAgentSkills,
} from '@/lib/agent-skills/registry'
import { createProjectAgentOperationRegistryForApi } from '@/lib/operations/registry'

describe('agent skill registry', () => {
  it('exposes Agent Skills as instruction packages, not fixed workflow steps', () => {
    const ids = listAgentSkillManifests().map((skill) => skill.id)

    expect(ids).toContain('screenwriting')
    expect(ids).toContain('storyboard-direction')
    expect(ids).toContain('location-selection')
    expect(ids).not.toContain('story-to-script')
    expect(ids).not.toContain('script-to-storyboard')
  })

  it('searches skills by user goal without returning full instructions', () => {
    const results = searchAgentSkills({
      query: '希区柯克 恐怖 短片',
      limit: 5,
    })

    expect(results.map((skill) => skill.id)).toEqual(expect.arrayContaining([
      'creative-direction',
      'story-structure',
    ]))
    expect(Object.keys(results[0] ?? {})).not.toContain('instructions')
    expect(Object.keys(results[0] ?? {})).not.toContain('allowedOperationIds')
  })

  it('routes Chinese screenplay creation goals to the screenwriting skill first', () => {
    const results = searchAgentSkills({
      query: '我选择 2. 剧本创作。请基于左侧故事输入，先帮我创作一版短剧第一集的剧本内容，用于后续生成分镜。',
      limit: 3,
    })

    expect(results[0]?.id).toBe('screenwriting')
    expect(results[0]?.triggers).toEqual(expect.arrayContaining(['剧本创作', '短剧第一集']))
  })

  it('loads full instructions and operation allowlist on demand', () => {
    const skill = loadAgentSkill('location-selection')

    expect(skill?.instructions).toContain('Never invent location ids')
    expect(skill?.allowedOperationIds).toContain('confirm_location_selection')
  })

  it('loads media generation instructions for direct single-panel video from context model config', () => {
    const skill = loadAgentSkill('media-generation')

    expect(skill?.instructions).toContain('invoke_operation')
    expect(skill?.instructions).toContain('generate_panel_video')
    expect(skill?.instructions).toContain('config.videoModel')
    expect(skill?.instructions).toContain('panel with an existing imageUrl')
    expect(skill?.instructions).toContain('explicitly provide a video model')
  })

  it('references real operations in every allowlist', () => {
    const registry = createProjectAgentOperationRegistryForApi()
    const missing = listAgentSkillManifests().flatMap((skill) => (
      skill.allowedOperationIds
        .filter((operationId) => !registry[operationId])
        .map((operationId) => `${skill.id}:${operationId}`)
    ))

    expect(missing).toEqual([])
  })
})
