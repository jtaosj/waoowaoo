import type { EditTimelineSegmentSoundPlan } from '../blackboard'
import type { EditTimelineAgentContributionContext } from './types'
import { compactText, firstNonEmpty, trimToSentence } from './validators'

export function buildSoundPlanContribution(
  context: EditTimelineAgentContributionContext,
): EditTimelineSegmentSoundPlan {
  const editorialCue = compactText(context.shot.editorial?.sound ?? '')
  const storyCue = trimToSentence(firstNonEmpty([
    context.macroSegment.beatGoal,
    context.shot.editorial?.visual,
    context.shot.goal,
  ], context.shot.title), 120)
  const silentCue = `Silent pacing: hold the key action long enough for the viewer to read ${storyCue}`
  const continuityCue = context.previousShot
    ? `Continuity cue: preserve the previous shot rhythm before ${context.shot.title}`
    : `Opening cue: establish ${context.creativeBrief.mood} without dialogue or subtitles`
  const transitionCue = context.nextShot
    ? `Transition cue: leave visual momentum for ${context.nextShot.title}`
    : 'Ending cue: let the final frame resolve cleanly without audio dependency'
  return {
    status: 'planned',
    dependsOn: ['screenplay-agent', 'continuity-agent'],
    cues: editorialCue
      ? [editorialCue, silentCue, transitionCue]
      : [silentCue, continuityCue, transitionCue],
    blocking: false,
    blocker: null,
  }
}
