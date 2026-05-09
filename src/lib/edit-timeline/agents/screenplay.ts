import type { EditTimelineSegmentScreenplay } from '../blackboard'
import type { EditTimelineAgentContributionContext } from './types'
import {
  avoidSourceRestatement,
  compactText,
  ensureSentence,
  firstNonEmpty,
  stripCameraLanguage,
  trimToSentence,
} from './validators'

function dialogueDraftFromCaption(caption: string | undefined): string | null {
  const text = compactText(caption ?? '')
  if (!text) return null
  if (/silent|no spoken|no dialogue|无对白|静音/i.test(text)) return null
  return text
}

export function buildScreenplayContribution(
  context: EditTimelineAgentContributionContext,
): EditTimelineSegmentScreenplay {
  const rawAction = firstNonEmpty([
    context.shot.goal,
    context.shot.editorial?.story,
    context.shot.editorial?.visual,
    context.macroSegment.beatGoal,
  ], `${context.creativeBrief.protagonist} performs the visible story beat for this segment.`)
  const visibleAction = ensureSentence(trimToSentence(avoidSourceRestatement({
    candidate: stripCameraLanguage(rawAction),
    sourceStory: context.sourceStory,
    fallback: `${context.creativeBrief.protagonist} performs one clear physical action tied to ${context.macroSegment.beatGoal}`,
  }), 180))

  return {
    visibleAction,
    dialogueDraft: dialogueDraftFromCaption(context.shot.editorial?.caption),
    narrationDraft: null,
  }
}
