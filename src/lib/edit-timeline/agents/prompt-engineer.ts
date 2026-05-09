import type {
  EditTimelineBlackboardReferencePolicy,
  EditTimelinePromptPackage,
  EditTimelineSegmentCinematography,
  EditTimelineSegmentContinuity,
  EditTimelineSegmentScreenplay,
} from '../blackboard'
import type { EditTimelineAgentContributionContext } from './types'
import { joinUnique, trimToSentence } from './validators'

function referencePolicyForContext(
  context: EditTimelineAgentContributionContext,
): EditTimelineBlackboardReferencePolicy {
  const hasFirstFrame = Boolean(context.shot.control.firstFrameRef?.trim())
  const hasLastFrame = Boolean(context.shot.control.lastFrameRef?.trim())
  if (hasFirstFrame && hasLastFrame) return 'first-last-frame'
  if (hasFirstFrame || hasLastFrame || context.shot.control.referenceImageRefs.length > 0) return 'image-to-video'

  const referencedAssets = context.shot.referenceIds
    .map((referenceId) => context.timeline.references.find((reference) => reference.id === referenceId))
    .filter((reference) => reference !== undefined)
  if (referencedAssets.some((reference) => reference.artifactRef.trim().length > 0)) return 'image-to-video'
  if (context.shot.referenceIds.length > 0) return 'requires-reference'
  return 'text-to-video'
}

function shotDurationSeconds(context: EditTimelineAgentContributionContext): string {
  const seconds = context.shot.durationMs / 1000
  return Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1)
}

function previousBeatContext(context: EditTimelineAgentContributionContext): string {
  if (!context.previousShot) return 'start with the subject already readable in frame'
  return trimToSentence(context.previousShot.goal, 140)
}

function nextBeatContext(context: EditTimelineAgentContributionContext): string {
  if (!context.nextShot) return 'a clean final held frame for assembly'
  return trimToSentence(context.nextShot.goal, 140)
}

export function buildPromptPackageFromContributions(params: {
  context: EditTimelineAgentContributionContext
  screenplay: EditTimelineSegmentScreenplay
  cinematography: EditTimelineSegmentCinematography
  continuity: EditTimelineSegmentContinuity
}): EditTimelinePromptPackage {
  const subject = params.context.creativeBrief.protagonist
  const action = params.screenplay.visibleAction
  const scene = params.continuity.locationContinuity
  const camera = params.cinematography.camera
  const motion = params.cinematography.motion
  const continuity = joinUnique([
    params.continuity.characterContinuity,
    params.continuity.propContinuity,
    params.continuity.styleContinuity,
  ])
  const shotPurpose = trimToSentence(params.context.shot.goal, 220)
  const durationSeconds = shotDurationSeconds(params.context)
  const previousBeat = previousBeatContext(params.context)
  const nextBeat = nextBeatContext(params.context)
  const referencePolicy = referencePolicyForContext(params.context)
  const imagePrompt = [
    `Vertical ${params.context.timeline.aspectRatio} cinematic first frame / opening frame for a ${durationSeconds}s silent video shot.`,
    `Subject: ${subject}.`,
    `Opening frame: ${subject} is already visible before the action begins; ${action}`,
    `Scene: ${scene}.`,
    `Camera framing: ${camera}.`,
    `Composition: ${params.cinematography.composition}.`,
    `Lighting: ${params.cinematography.lighting}.`,
    `Continuity anchors: ${continuity}.`,
    'Single readable still image, subject visible, key prop visible when relevant, no subtitles, no logo, no black screen.',
  ].join('\n')
  const providerPrompt = [
    `Silent ${params.context.timeline.aspectRatio} cinematic video shot. About ${durationSeconds}s, one single continuous shot.`,
    `Shot purpose: ${shotPurpose}`,
    `Subject: ${subject}.`,
    `Opening frame: ${previousBeat}; ${subject} is visible in ${scene}.`,
    `Visible subject action: ${action}`,
    `Middle motion: ${motion}.`,
    `Ending frame: hold a stable final pose or eyeline that can cut into ${nextBeat}.`,
    `Scene: ${scene}.`,
    `Camera: ${camera}.`,
    `Composition: ${params.cinematography.composition}.`,
    `Lighting: ${params.cinematography.lighting}.`,
    `Continuity anchors: ${continuity}.`,
    `Transition hook: ${params.cinematography.transitionHook}.`,
    'Keep subject visible throughout, one simple readable action, stable framing.',
    'Forbidden artifacts: no hidden subject, no unreadable action, no jump cuts, no montage, no subtitles, no logo, no black screen.',
  ].join('\n')

  return {
    subject,
    action,
    scene,
    camera,
    motion,
    continuity,
    referencePolicy,
    imagePrompt,
    providerPrompt,
    negativePrompt: 'black screen, empty frame, cropped subject, inconsistent character, changing wardrobe, unreadable action, text overlay, subtitle, logo, jump cut, montage, morphing face, distorted hands, duplicated limbs, random extra people',
  }
}
