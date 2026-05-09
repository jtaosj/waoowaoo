import type { AgentSkillManifest } from '@/lib/agent-skills/types'

export const editFirstVideoDirectorSkill: AgentSkillManifest = {
  id: 'edit-first-video-director',
  name: 'Edit-First Video Director',
  summary: 'Plan generic video generation from a validated edit timeline before provider tasks are submitted.',
  description: 'Helps the assistant turn a creative goal into an EditTimeline draft, validate it, and compile it into a PlanRun-ready draft without directly generating media.',
  triggers: ['剪辑先行', '短剧 Agent', '时间线', 'EditTimeline', '局部重做', 'timeline', 'video director', 'shot plan'],
  riskLevel: 'medium',
  requiresApproval: false,
  allowedOperationIds: [
    'create_edit_timeline_plan',
    'validate_edit_timeline',
    'compile_edit_timeline',
    'start_edit_timeline_production_run',
    'materialize_edit_timeline_storyboard',
    'assemble_timeline_video',
    'score_edit_timeline_trace',
    'redo_timeline_shot',
  ],
  documentPath: 'skills/agent/edit-first-video-director/SKILL.md',
}
