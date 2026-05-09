import type { AgentSkillManifest } from '@/lib/agent-skills/types'

export const editFirstVideoDirectorSkill: AgentSkillManifest = {
  id: 'edit-first-video-director',
  name: 'Edit-First Video Director',
  summary: 'Plan and start edit-first video generation from a natural-language story before provider tasks are submitted.',
  description: 'Helps the assistant turn a creative goal into an EditTimeline blackboard, validate it, and start the confirmed story-to-PlanRun production path without direct provider shortcuts.',
  triggers: ['剪辑先行', '短剧 Agent', '时间线', 'EditTimeline', '局部重做', 'timeline', 'video director', 'shot plan'],
  riskLevel: 'medium',
  requiresApproval: false,
  allowedOperationIds: [
    'create_edit_timeline_plan',
    'validate_edit_timeline',
    'compile_edit_timeline',
    'start_edit_timeline_video_run',
    'start_edit_timeline_production_run',
    'materialize_edit_timeline_storyboard',
    'assemble_timeline_video',
    'score_edit_timeline_trace',
    'redo_timeline_shot',
  ],
  documentPath: 'skills/agent/edit-first-video-director/SKILL.md',
}
