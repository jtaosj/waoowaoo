import type { EditTimelineSegmentCinematography } from '../blackboard'
import type { EditTimelineAgentContributionContext } from './types'
import { compactText, firstNonEmpty, trimToSentence } from './validators'

function combinedText(context: EditTimelineAgentContributionContext): string {
  return [
    context.shot.title,
    context.shot.goal,
    context.shot.editorial?.visual ?? '',
    context.macroSegment.beatGoal,
  ].join(' ').toLowerCase()
}

function cameraForContext(context: EditTimelineAgentContributionContext): string {
  const text = combinedText(context)
  if (text.includes('over-shoulder') || text.includes('over shoulder') || text.includes('outside') || text.includes('door') || text.includes('平台')) {
    return 'over-shoulder medium shot with the subject framed against the next story reveal'
  }
  if (text.includes('music box') || text.includes('paper crane') || text.includes('phone') || text.includes('gear') || text.includes('道具')) {
    return 'insert close-up on the key prop with the subject hands still visible'
  }
  if (context.macroSegment.storyFunction === 'setup') {
    return 'medium-wide establishing shot that places the subject and location in one vertical frame'
  }
  if (context.macroSegment.storyFunction === 'turn') {
    return 'close-up that isolates the subject reaction and key visual clue'
  }
  if (context.macroSegment.storyFunction === 'payoff') {
    return 'medium over-shoulder reveal with the subject anchored in the foreground'
  }
  return 'medium shot with a clear single subject and readable environment'
}

function motionForContext(context: EditTimelineAgentContributionContext): string {
  const explicit = compactText(context.shot.control.cameraMotion ?? '')
  if (explicit) return explicit
  const text = combinedText(context)
  if (text.includes('turn') || text.includes('sees') || text.includes('发现')) {
    return 'slow pan as the subject turns toward the revealed point of interest'
  }
  if (text.includes('open') || text.includes('unfold') || text.includes('gear') || text.includes('打开')) {
    return 'locked camera with a gentle rack focus from hands to the key prop'
  }
  if (text.includes('follow') || text.includes('steps') || text.includes('walk') || text.includes('走')) {
    return 'slow dolly following one measured step while keeping the subject centered'
  }
  return 'locked camera with restrained motion so the single action remains readable'
}

function compositionForContext(context: EditTimelineAgentContributionContext): string {
  const subject = context.creativeBrief.protagonist
  const propOrSetting = firstNonEmpty([
    context.timeline.continuityBible.props[0],
    context.creativeBrief.setting,
  ], context.creativeBrief.setting)
  return trimToSentence(`${subject} occupies the central vertical third in ${context.timeline.aspectRatio}; ${propOrSetting} stays inside the lower foreground with clean headroom`, 220)
}

function lightingForContext(context: EditTimelineAgentContributionContext): string {
  return trimToSentence(firstNonEmpty(
    context.timeline.continuityBible.visualRules,
    `Visible practical light from ${context.creativeBrief.setting} keeps the subject readable`,
  ), 220)
}

function transitionHookForContext(context: EditTimelineAgentContributionContext): string {
  if (!context.nextShot) return 'End on a stable held frame that can cut cleanly to final assembly.'
  const nextBeat = firstNonEmpty([
    context.nextShot.goal,
    context.nextShot.editorial?.story,
    context.nextShot.title,
  ], context.nextShot.title)
  return trimToSentence(`End with the subject eyeline or prop movement pointing into the next beat: ${nextBeat}`, 180)
}

export function buildCinematographyContribution(
  context: EditTimelineAgentContributionContext,
): EditTimelineSegmentCinematography {
  return {
    camera: cameraForContext(context),
    motion: motionForContext(context),
    composition: compositionForContext(context),
    lighting: lightingForContext(context),
    transitionHook: transitionHookForContext(context),
  }
}
