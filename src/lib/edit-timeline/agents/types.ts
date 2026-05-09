import type { EditTimelineCreativeBrief } from '@/lib/project-agent/types'
import type {
  EditTimelineMacroScriptSegment,
  EditTimelinePromptPackage,
  EditTimelineSegmentCinematography,
  EditTimelineSegmentContinuity,
  EditTimelineSegmentScreenplay,
  EditTimelineSegmentSoundPlan,
} from '../blackboard'
import type { ParsedEditTimeline, ShotNode } from '../types'

export interface EditTimelineAgentContributionContext {
  readonly timeline: ParsedEditTimeline
  readonly shot: ShotNode
  readonly macroSegment: EditTimelineMacroScriptSegment
  readonly creativeBrief: EditTimelineCreativeBrief
  readonly sourceStory: string
  readonly previousShot: ShotNode | null
  readonly nextShot: ShotNode | null
}

export interface EditTimelineShotContributions {
  readonly screenplay: EditTimelineSegmentScreenplay
  readonly cinematography: EditTimelineSegmentCinematography
  readonly continuity: EditTimelineSegmentContinuity
  readonly soundPlan: EditTimelineSegmentSoundPlan
  readonly promptPackage: EditTimelinePromptPackage
}
