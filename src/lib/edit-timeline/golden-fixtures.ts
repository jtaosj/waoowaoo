import type { EditTimeline } from './types'

export interface EditTimelineGoldenFixtureExpectation {
  shotCount: number
  totalDurationMs: number
  requiredAssets: string[]
  expectedValidationOk: boolean
  expectedTraceEvalPassRate: number
}

export interface EditTimelineGoldenFixture {
  id: string
  title: string
  timeline: EditTimeline
  expectation: EditTimelineGoldenFixtureExpectation
}

function baseReferences() {
  return [
    {
      id: 'character-lead',
      kind: 'character' as const,
      label: 'Lead character',
      artifactRef: 'media:character-lead',
    },
    {
      id: 'character-friend',
      kind: 'character' as const,
      label: 'Friend character',
      artifactRef: 'media:character-friend',
    },
    {
      id: 'location-room',
      kind: 'location' as const,
      label: 'Apartment room',
      artifactRef: 'media:location-room',
    },
    {
      id: 'style-drama',
      kind: 'style' as const,
      label: 'Vertical drama lighting',
      artifactRef: 'media:style-drama',
    },
    {
      id: 'first-frame',
      kind: 'first_frame' as const,
      label: 'Opening frame',
      artifactRef: 'media:first-frame',
    },
    {
      id: 'last-frame',
      kind: 'last_frame' as const,
      label: 'Terminal frame',
      artifactRef: 'media:last-frame',
    },
  ]
}

export const editTimelineGoldenFixtures: EditTimelineGoldenFixture[] = [
  {
    id: 'fifteen-second-reversal',
    title: '15 second reversal drama',
    timeline: {
      id: 'golden-reversal-15s',
      title: 'Receipt reversal',
      aspectRatio: '9:16',
      fps: 24,
      segments: [
        {
          id: 'seg-reversal',
          label: 'Hook and reversal',
          startMs: 0,
          durationMs: 15_000,
          intent: 'Mislead with one clue and reveal the hidden witness.',
          shotIds: ['shot-clue', 'shot-witness'],
        },
      ],
      shots: [
        {
          id: 'shot-clue',
          segmentId: 'seg-reversal',
          title: 'Wrong clue',
          goal: 'Lead finds a clue that points to the wrong person.',
          track: 'video',
          order: 1,
          startMs: 0,
          durationMs: 7_000,
          dependsOn: [],
          referenceIds: ['character-lead', 'location-room'],
          control: {
            prompt: 'Close shot of the lead finding a suspicious receipt.',
          },
        },
        {
          id: 'shot-witness',
          segmentId: 'seg-reversal',
          title: 'Hidden witness',
          goal: 'Reveal the real witness behind the glass door.',
          track: 'video',
          order: 2,
          startMs: 7_000,
          durationMs: 8_000,
          dependsOn: ['shot-clue'],
          referenceIds: ['character-lead', 'location-room'],
          control: {
            prompt: 'Medium reveal of the hidden witness behind the glass door.',
          },
        },
      ],
      references: baseReferences(),
      continuityBible: {
        characters: ['The lead keeps the same jacket and hairstyle.'],
        locations: ['The room layout stays stable across the reveal.'],
        visualRules: ['Keep the vertical drama contrast consistent.'],
        audioRules: [],
      },
    },
    expectation: {
      shotCount: 2,
      totalDurationMs: 15_000,
      requiredAssets: ['character-lead', 'location-room'],
      expectedValidationOk: true,
      expectedTraceEvalPassRate: 100,
    },
  },
  {
    id: 'thirty-second-emotion-ad',
    title: '30 second emotion ad',
    timeline: {
      id: 'golden-emotion-ad-30s',
      title: 'Missed call emotion ad',
      aspectRatio: '9:16',
      fps: 24,
      segments: [
        {
          id: 'seg-ad',
          label: 'Problem, memory, resolution',
          startMs: 0,
          durationMs: 30_000,
          intent: 'Move from loneliness to relief around one product moment.',
          shotIds: ['shot-problem', 'shot-memory', 'shot-resolution'],
        },
      ],
      shots: [
        {
          id: 'shot-problem',
          segmentId: 'seg-ad',
          title: 'Missed call',
          goal: 'Show the lead noticing a missed call late at night.',
          track: 'video',
          order: 1,
          startMs: 0,
          durationMs: 10_000,
          dependsOn: [],
          referenceIds: ['character-lead', 'style-drama'],
          control: {
            prompt: 'A tired lead notices a missed call under soft phone light.',
          },
        },
        {
          id: 'shot-memory',
          segmentId: 'seg-ad',
          title: 'Warm memory',
          goal: 'Cut to a warm memory that reframes the call emotionally.',
          track: 'video',
          order: 2,
          startMs: 10_000,
          durationMs: 10_000,
          dependsOn: ['shot-problem'],
          referenceIds: ['character-lead', 'style-drama'],
          control: {
            prompt: 'A warm remembered dinner moment, same lead, gentler lighting.',
          },
        },
        {
          id: 'shot-resolution',
          segmentId: 'seg-ad',
          title: 'Call back',
          goal: 'Resolve with the lead calling back and smiling.',
          track: 'video',
          order: 3,
          startMs: 20_000,
          durationMs: 10_000,
          dependsOn: ['shot-memory'],
          referenceIds: ['character-lead', 'style-drama'],
          control: {
            prompt: 'The lead calls back, the emotional tone resolves with a quiet smile.',
          },
        },
      ],
      references: baseReferences(),
    },
    expectation: {
      shotCount: 3,
      totalDurationMs: 30_000,
      requiredAssets: ['character-lead', 'style-drama'],
      expectedValidationOk: true,
      expectedTraceEvalPassRate: 100,
    },
  },
  {
    id: 'two-person-dialogue-continuity',
    title: 'Two person dialogue continuity',
    timeline: {
      id: 'golden-dialogue-continuity',
      title: 'Elevator confession',
      aspectRatio: '9:16',
      fps: 24,
      segments: [
        {
          id: 'seg-dialogue',
          label: 'Dialogue beat',
          startMs: 0,
          durationMs: 24_000,
          intent: 'Preserve identity and eyeline continuity across a dialogue exchange.',
          shotIds: ['shot-a', 'shot-b', 'shot-two-shot'],
        },
      ],
      shots: [
        {
          id: 'shot-a',
          segmentId: 'seg-dialogue',
          title: 'Lead question',
          goal: 'Lead asks the question without breaking eyeline.',
          track: 'video',
          order: 1,
          startMs: 0,
          durationMs: 8_000,
          dependsOn: [],
          referenceIds: ['character-lead', 'character-friend'],
          control: {
            prompt: 'Close-up of the lead asking a quiet question in an elevator.',
          },
        },
        {
          id: 'shot-b',
          segmentId: 'seg-dialogue',
          title: 'Friend answer',
          goal: 'Friend answers with matching eyeline and lighting.',
          track: 'video',
          order: 2,
          startMs: 8_000,
          durationMs: 8_000,
          dependsOn: ['shot-a'],
          referenceIds: ['character-lead', 'character-friend'],
          control: {
            prompt: 'Reverse close-up of the friend answering, same elevator lighting.',
          },
        },
        {
          id: 'shot-two-shot',
          segmentId: 'seg-dialogue',
          title: 'Shared silence',
          goal: 'End on a two-shot that resolves the exchange.',
          track: 'video',
          order: 3,
          startMs: 16_000,
          durationMs: 8_000,
          dependsOn: ['shot-b'],
          referenceIds: ['character-lead', 'character-friend'],
          control: {
            prompt: 'Two-shot of both characters in silence after the confession.',
          },
        },
      ],
      references: baseReferences(),
    },
    expectation: {
      shotCount: 3,
      totalDurationMs: 24_000,
      requiredAssets: ['character-lead', 'character-friend'],
      expectedValidationOk: true,
      expectedTraceEvalPassRate: 100,
    },
  },
  {
    id: 'first-last-frame-control',
    title: 'First and last frame control',
    timeline: {
      id: 'golden-first-last-frame',
      title: 'Exact terminal pose',
      aspectRatio: '16:9',
      fps: 24,
      segments: [
        {
          id: 'seg-control',
          label: 'Motion bridge',
          startMs: 0,
          durationMs: 8_000,
          intent: 'Bridge from a required opening composition to a required terminal pose.',
          shotIds: ['shot-bridge'],
        },
      ],
      shots: [
        {
          id: 'shot-bridge',
          segmentId: 'seg-control',
          title: 'Motion bridge',
          goal: 'Move from first frame to terminal frame exactly.',
          track: 'video',
          order: 1,
          startMs: 0,
          durationMs: 8_000,
          dependsOn: [],
          referenceIds: ['first-frame', 'last-frame'],
          control: {
            prompt: 'A controlled motion bridge between two exact compositions.',
            firstFrameRef: 'media:first-frame',
            lastFrameRef: 'media:last-frame',
          },
        },
      ],
      references: baseReferences(),
    },
    expectation: {
      shotCount: 1,
      totalDurationMs: 8_000,
      requiredAssets: ['first-frame', 'last-frame'],
      expectedValidationOk: true,
      expectedTraceEvalPassRate: 100,
    },
  },
  {
    id: 'missing-asset-failure',
    title: 'Missing asset failure',
    timeline: {
      id: 'golden-missing-asset',
      title: 'Missing asset should fail',
      aspectRatio: '9:16',
      fps: 24,
      segments: [
        {
          id: 'seg-fail',
          label: 'Failure beat',
          startMs: 0,
          durationMs: 10_000,
          intent: 'Prove unresolved assets are reported explicitly.',
          shotIds: ['shot-missing'],
        },
      ],
      shots: [
        {
          id: 'shot-missing',
          segmentId: 'seg-fail',
          title: 'Missing character ref',
          goal: 'This shot must fail validation because the character ref is absent.',
          track: 'video',
          order: 1,
          startMs: 0,
          durationMs: 10_000,
          dependsOn: [],
          referenceIds: ['character-missing'],
          control: {
            prompt: 'A shot that requires a missing character reference.',
          },
        },
      ],
      references: baseReferences(),
    },
    expectation: {
      shotCount: 1,
      totalDurationMs: 10_000,
      requiredAssets: ['character-missing'],
      expectedValidationOk: false,
      expectedTraceEvalPassRate: 0,
    },
  },
]
