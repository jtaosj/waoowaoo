import { describe, expect, it } from 'vitest'
import {
  editTimelineGoldenFixtures,
  parseEditTimeline,
} from '@/lib/edit-timeline'

function totalDurationMs(timeline: ReturnType<typeof parseEditTimeline>): number {
  return Math.max(...timeline.segments.map((segment) => segment.startMs + segment.durationMs))
}

describe('edit-first golden timeline fixtures', () => {
  it('pins the first eval dataset for short-drama timeline planning', () => {
    expect(editTimelineGoldenFixtures.map((fixture) => fixture.id)).toEqual([
      'fifteen-second-reversal',
      'thirty-second-emotion-ad',
      'two-person-dialogue-continuity',
      'first-last-frame-control',
      'missing-asset-failure',
    ])

    for (const fixture of editTimelineGoldenFixtures) {
      if (!fixture.expectation.expectedValidationOk) continue
      const timeline = parseEditTimeline(fixture.timeline)
      expect(timeline.shots).toHaveLength(fixture.expectation.shotCount)
      expect(totalDurationMs(timeline)).toBe(fixture.expectation.totalDurationMs)
      for (const requiredAsset of fixture.expectation.requiredAssets) {
        expect(timeline.references.map((reference) => reference.id)).toContain(requiredAsset)
      }
    }
  })

  it('keeps the missing asset fixture explicitly invalid', () => {
    const fixture = editTimelineGoldenFixtures.find((item) => item.id === 'missing-asset-failure')
    expect(fixture).toBeDefined()
    if (!fixture) {
      throw new Error('TEST_FIXTURE_MISSING:missing-asset-failure')
    }

    expect(() => parseEditTimeline(fixture.timeline)).toThrow(
      'EDIT_TIMELINE_UNKNOWN_SHOT_REFERENCE:shot-missing:character-missing',
    )
  })
})
