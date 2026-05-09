import { describe, expect, it } from 'vitest'
import {
  buildProjectKnowledgeProjection,
  queryProjectKnowledgeProjection,
} from '@/lib/project-knowledge/projection'

describe('project knowledge projection', () => {
  it('derives deterministic typed facts with provenance from project story assets and run artifacts', () => {
    const projection = buildProjectKnowledgeProjection({
      project: {
        id: 'project-1',
        title: 'Moon Harbor',
      },
      episodes: [
        {
          id: 'episode-1',
          title: 'Pilot',
          order: 1,
        },
      ],
      clips: [
        {
          id: 'clip-1',
          episodeId: 'episode-1',
          title: 'Arrival',
          order: 1,
          assetIds: ['character-hero'],
        },
        {
          id: 'clip-2',
          episodeId: 'episode-1',
          title: 'Signal',
          order: 2,
          assetIds: ['location-dock'],
        },
      ],
      shots: [
        {
          id: 'shot-1',
          clipId: 'clip-1',
          title: 'Hero steps onto the dock',
          order: 1,
          assetIds: ['character-hero', 'location-dock'],
        },
      ],
      assets: [
        {
          id: 'character-hero',
          kind: 'character',
          title: 'Lina',
        },
        {
          id: 'location-dock',
          kind: 'location',
          title: 'Moon Harbor Dock',
        },
      ],
      planRuns: [
        {
          id: 'plan-run-1',
          title: 'Generate arrival shot',
          status: 'failed',
        },
      ],
      tasks: [
        {
          id: 'task-1',
          planRunId: 'plan-run-1',
          title: 'Video provider task',
          status: 'failed',
        },
      ],
      artifacts: [
        {
          id: 'artifact-1',
          planRunId: 'plan-run-1',
          title: 'Arrival shot output',
          artifactType: 'video',
        },
      ],
    })

    expect(projection.nodes.map((node) => `${node.kind}:${node.sourceId}`)).toEqual([
      'project:project-1',
      'episode:episode-1',
      'clip:clip-1',
      'clip:clip-2',
      'shot:shot-1',
      'asset:character-hero',
      'asset:location-dock',
      'plan_run:plan-run-1',
      'task:task-1',
      'artifact:artifact-1',
    ])
    expect(projection.edges.map((edge) => ({
      kind: edge.kind,
      from: edge.fromNodeId,
      to: edge.toNodeId,
      sourceTable: edge.provenance.sourceTable,
      sourceId: edge.provenance.sourceId,
    }))).toEqual([
      {
        kind: 'contains',
        from: 'project:project-1',
        to: 'episode:episode-1',
        sourceTable: 'episode',
        sourceId: 'episode-1',
      },
      {
        kind: 'contains',
        from: 'episode:episode-1',
        to: 'clip:clip-1',
        sourceTable: 'clip',
        sourceId: 'clip-1',
      },
      {
        kind: 'contains',
        from: 'episode:episode-1',
        to: 'clip:clip-2',
        sourceTable: 'clip',
        sourceId: 'clip-2',
      },
      {
        kind: 'before',
        from: 'clip:clip-1',
        to: 'clip:clip-2',
        sourceTable: 'clip',
        sourceId: 'clip-1',
      },
      {
        kind: 'uses_asset',
        from: 'clip:clip-1',
        to: 'asset:character-hero',
        sourceTable: 'clip',
        sourceId: 'clip-1',
      },
      {
        kind: 'uses_asset',
        from: 'clip:clip-2',
        to: 'asset:location-dock',
        sourceTable: 'clip',
        sourceId: 'clip-2',
      },
      {
        kind: 'contains',
        from: 'clip:clip-1',
        to: 'shot:shot-1',
        sourceTable: 'shot',
        sourceId: 'shot-1',
      },
      {
        kind: 'uses_asset',
        from: 'shot:shot-1',
        to: 'asset:character-hero',
        sourceTable: 'shot',
        sourceId: 'shot-1',
      },
      {
        kind: 'uses_asset',
        from: 'shot:shot-1',
        to: 'asset:location-dock',
        sourceTable: 'shot',
        sourceId: 'shot-1',
      },
      {
        kind: 'contains',
        from: 'project:project-1',
        to: 'plan_run:plan-run-1',
        sourceTable: 'plan_run',
        sourceId: 'plan-run-1',
      },
      {
        kind: 'contains',
        from: 'plan_run:plan-run-1',
        to: 'task:task-1',
        sourceTable: 'task',
        sourceId: 'task-1',
      },
      {
        kind: 'failed_at',
        from: 'task:task-1',
        to: 'plan_run:plan-run-1',
        sourceTable: 'task',
        sourceId: 'task-1',
      },
      {
        kind: 'generated_by',
        from: 'artifact:artifact-1',
        to: 'plan_run:plan-run-1',
        sourceTable: 'artifact',
        sourceId: 'artifact-1',
      },
    ])
  })

  it('queries a finite read-only subgraph around a root node', () => {
    const projection = buildProjectKnowledgeProjection({
      project: {
        id: 'project-1',
        title: 'Moon Harbor',
      },
      clips: [
        {
          id: 'clip-1',
          title: 'Arrival',
          order: 1,
          assetIds: ['character-hero'],
        },
      ],
      assets: [
        {
          id: 'character-hero',
          kind: 'character',
          title: 'Lina',
        },
      ],
    })

    const subgraph = queryProjectKnowledgeProjection({
      projection,
      rootNodeId: 'clip:clip-1',
      depth: 1,
    })

    expect(subgraph.nodes.map((node) => node.id).sort()).toEqual([
      'asset:character-hero',
      'clip:clip-1',
      'project:project-1',
    ])
    expect(subgraph.edges.map((edge) => edge.id).sort()).toEqual([
      'contains:project:project-1->clip:clip-1',
      'uses_asset:clip:clip-1->asset:character-hero',
    ])
    expect(projection.nodes).toHaveLength(3)
    expect(projection.edges).toHaveLength(2)
  })
})
