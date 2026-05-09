import type { EditTimelineSegmentContinuity } from '../blackboard'
import type { EditTimelineAgentContributionContext } from './types'
import {
  firstNonEmpty,
  joinUnique,
  labelsForReferences,
  trimToSentence,
} from './validators'

function referenceFallback(context: EditTimelineAgentContributionContext, kinds: readonly ('character' | 'location' | 'prop' | 'style')[]): string | null {
  const labels = labelsForReferences({
    referenceIds: context.shot.referenceIds,
    references: context.timeline.references,
    kinds,
  })
  return labels.length > 0 ? labels.join(', ') : null
}

export function buildContinuityContribution(
  context: EditTimelineAgentContributionContext,
): EditTimelineSegmentContinuity {
  const character = firstNonEmpty([
    context.timeline.continuityBible.characters[0],
    referenceFallback(context, ['character']),
  ], `${context.creativeBrief.protagonist} keeps the same silhouette, wardrobe, hair, and scale in every segment.`)
  const locationAnchor = firstNonEmpty([
    context.timeline.continuityBible.locations[0],
    referenceFallback(context, ['location']),
  ], `${context.creativeBrief.setting} remains the continuous location for this segment.`)
  const location = joinUnique([
    locationAnchor,
    context.shot.editorial?.visual,
  ])
  const props = firstNonEmpty([
    context.timeline.continuityBible.props[0],
    referenceFallback(context, ['prop']),
  ], 'Visible props from the previous segment stay in the same relative position.')
  const style = firstNonEmpty([
    context.timeline.continuityBible.visualRules[0],
    referenceFallback(context, ['style']),
  ], `${context.timeline.aspectRatio} silent cinematic style, stable frame, consistent color and light.`)

  return {
    characterContinuity: trimToSentence(character, 220),
    locationContinuity: trimToSentence(location, 220),
    propContinuity: trimToSentence(props, 220),
    styleContinuity: trimToSentence(style, 220),
    previousContext: context.previousShot
      ? trimToSentence(`Continue from ${context.previousShot.id}: ${context.previousShot.goal}`, 180)
      : null,
    nextSetup: context.nextShot
      ? trimToSentence(`Leave a visual hook for ${context.nextShot.id}: ${context.nextShot.title}`, 180)
      : null,
  }
}
