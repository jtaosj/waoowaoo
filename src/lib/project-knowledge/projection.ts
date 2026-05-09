export type ProjectKnowledgeNodeKind =
  | 'project'
  | 'episode'
  | 'clip'
  | 'shot'
  | 'asset'
  | 'plan_run'
  | 'task'
  | 'artifact'

export type ProjectKnowledgeEdgeKind =
  | 'contains'
  | 'before'
  | 'uses_asset'
  | 'depends_on'
  | 'generated_by'
  | 'failed_at'
  | 'affects'

export type ProjectKnowledgeSourceTable =
  | 'project'
  | 'episode'
  | 'clip'
  | 'shot'
  | 'asset'
  | 'plan_run'
  | 'task'
  | 'artifact'

export type ProjectKnowledgeProperty = string | number | boolean | null

export interface ProjectKnowledgeProvenance {
  sourceTable: ProjectKnowledgeSourceTable
  sourceId: string
  generatedBy: 'project_knowledge_projection'
}

export interface ProjectKnowledgeNode {
  id: string
  kind: ProjectKnowledgeNodeKind
  sourceId: string
  label: string
  provenance: ProjectKnowledgeProvenance
  properties: Record<string, ProjectKnowledgeProperty>
}

export interface ProjectKnowledgeEdge {
  id: string
  kind: ProjectKnowledgeEdgeKind
  fromNodeId: string
  toNodeId: string
  provenance: ProjectKnowledgeProvenance
  properties: Record<string, ProjectKnowledgeProperty>
}

export interface ProjectKnowledgeProjection {
  nodes: ProjectKnowledgeNode[]
  edges: ProjectKnowledgeEdge[]
}

export interface ProjectKnowledgeProjectInput {
  id: string
  title?: string | null
}

export interface ProjectKnowledgeEpisodeInput {
  id: string
  title?: string | null
  order?: number | null
}

export interface ProjectKnowledgeClipInput {
  id: string
  episodeId?: string | null
  title?: string | null
  order?: number | null
  assetIds?: readonly string[]
}

export interface ProjectKnowledgeShotInput {
  id: string
  clipId?: string | null
  title?: string | null
  order?: number | null
  assetIds?: readonly string[]
  dependsOnShotIds?: readonly string[]
  affectsShotIds?: readonly string[]
}

export interface ProjectKnowledgeAssetInput {
  id: string
  kind: string
  title?: string | null
}

export interface ProjectKnowledgePlanRunInput {
  id: string
  title?: string | null
  status?: string | null
}

export interface ProjectKnowledgeTaskInput {
  id: string
  planRunId: string
  title?: string | null
  status?: string | null
}

export interface ProjectKnowledgeArtifactInput {
  id: string
  planRunId: string
  title?: string | null
  artifactType?: string | null
}

export interface BuildProjectKnowledgeProjectionInput {
  project: ProjectKnowledgeProjectInput
  episodes?: readonly ProjectKnowledgeEpisodeInput[]
  clips?: readonly ProjectKnowledgeClipInput[]
  shots?: readonly ProjectKnowledgeShotInput[]
  assets?: readonly ProjectKnowledgeAssetInput[]
  planRuns?: readonly ProjectKnowledgePlanRunInput[]
  tasks?: readonly ProjectKnowledgeTaskInput[]
  artifacts?: readonly ProjectKnowledgeArtifactInput[]
}

export interface QueryProjectKnowledgeProjectionInput {
  projection: ProjectKnowledgeProjection
  rootNodeId: string
  depth: number
}

function provenance(sourceTable: ProjectKnowledgeSourceTable, sourceId: string): ProjectKnowledgeProvenance {
  return {
    sourceTable,
    sourceId,
    generatedBy: 'project_knowledge_projection',
  }
}

function nodeId(kind: ProjectKnowledgeNodeKind, sourceId: string): string {
  return `${kind}:${sourceId}`
}

function edgeId(kind: ProjectKnowledgeEdgeKind, fromNodeId: string, toNodeId: string): string {
  return `${kind}:${fromNodeId}->${toNodeId}`
}

function labelOrId(label: string | null | undefined, id: string): string {
  const trimmed = label?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : id
}

function byOrderThenId<T extends { id: string, order?: number | null }>(left: T, right: T): number {
  return (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER)
    || left.id.localeCompare(right.id)
}

function addNode(
  nodes: ProjectKnowledgeNode[],
  existingNodeIds: Set<string>,
  kind: ProjectKnowledgeNodeKind,
  sourceTable: ProjectKnowledgeSourceTable,
  sourceId: string,
  label: string,
  properties: Record<string, ProjectKnowledgeProperty> = {},
): string {
  const id = nodeId(kind, sourceId)
  if (existingNodeIds.has(id)) return id
  existingNodeIds.add(id)
  nodes.push({
    id,
    kind,
    sourceId,
    label,
    provenance: provenance(sourceTable, sourceId),
    properties,
  })
  return id
}

function assertNodeExists(nodeIds: Set<string>, id: string, sourceTable: ProjectKnowledgeSourceTable, sourceId: string) {
  if (!nodeIds.has(id)) {
    throw new Error(`PROJECT_KNOWLEDGE_NODE_NOT_FOUND:${sourceTable}:${sourceId}:${id}`)
  }
}

function addEdge(
  edges: ProjectKnowledgeEdge[],
  existingEdgeIds: Set<string>,
  existingNodeIds: Set<string>,
  kind: ProjectKnowledgeEdgeKind,
  fromNodeId: string,
  toNodeId: string,
  sourceTable: ProjectKnowledgeSourceTable,
  sourceId: string,
  properties: Record<string, ProjectKnowledgeProperty> = {},
) {
  assertNodeExists(existingNodeIds, fromNodeId, sourceTable, sourceId)
  assertNodeExists(existingNodeIds, toNodeId, sourceTable, sourceId)
  const id = edgeId(kind, fromNodeId, toNodeId)
  if (existingEdgeIds.has(id)) return
  existingEdgeIds.add(id)
  edges.push({
    id,
    kind,
    fromNodeId,
    toNodeId,
    provenance: provenance(sourceTable, sourceId),
    properties,
  })
}

function addAssetUseEdges(params: {
  edges: ProjectKnowledgeEdge[]
  existingEdgeIds: Set<string>
  existingNodeIds: Set<string>
  sourceNodeId: string
  sourceTable: ProjectKnowledgeSourceTable
  sourceId: string
  assetIds: readonly string[] | undefined
}) {
  for (const assetId of params.assetIds ?? []) {
    addEdge(
      params.edges,
      params.existingEdgeIds,
      params.existingNodeIds,
      'uses_asset',
      params.sourceNodeId,
      nodeId('asset', assetId),
      params.sourceTable,
      params.sourceId,
    )
  }
}

export function buildProjectKnowledgeProjection(
  input: BuildProjectKnowledgeProjectionInput,
): ProjectKnowledgeProjection {
  const nodes: ProjectKnowledgeNode[] = []
  const edges: ProjectKnowledgeEdge[] = []
  const existingNodeIds = new Set<string>()
  const existingEdgeIds = new Set<string>()
  const projectNodeId = addNode(
    nodes,
    existingNodeIds,
    'project',
    'project',
    input.project.id,
    labelOrId(input.project.title, input.project.id),
  )
  const episodes = [...(input.episodes ?? [])].sort(byOrderThenId)
  const clips = [...(input.clips ?? [])].sort(byOrderThenId)
  const shots = [...(input.shots ?? [])].sort(byOrderThenId)
  const assets = [...(input.assets ?? [])].sort((left, right) => left.id.localeCompare(right.id))
  const planRuns = [...(input.planRuns ?? [])].sort((left, right) => left.id.localeCompare(right.id))
  const tasks = [...(input.tasks ?? [])].sort((left, right) => left.id.localeCompare(right.id))
  const artifacts = [...(input.artifacts ?? [])].sort((left, right) => left.id.localeCompare(right.id))

  for (const episode of episodes) {
    addNode(nodes, existingNodeIds, 'episode', 'episode', episode.id, labelOrId(episode.title, episode.id), {
      order: episode.order ?? null,
    })
  }
  for (const clip of clips) {
    addNode(nodes, existingNodeIds, 'clip', 'clip', clip.id, labelOrId(clip.title, clip.id), {
      episodeId: clip.episodeId ?? null,
      order: clip.order ?? null,
    })
  }
  for (const shot of shots) {
    addNode(nodes, existingNodeIds, 'shot', 'shot', shot.id, labelOrId(shot.title, shot.id), {
      clipId: shot.clipId ?? null,
      order: shot.order ?? null,
    })
  }
  for (const asset of assets) {
    addNode(nodes, existingNodeIds, 'asset', 'asset', asset.id, labelOrId(asset.title, asset.id), {
      assetKind: asset.kind,
    })
  }
  for (const planRun of planRuns) {
    addNode(nodes, existingNodeIds, 'plan_run', 'plan_run', planRun.id, labelOrId(planRun.title, planRun.id), {
      status: planRun.status ?? null,
    })
  }
  for (const task of tasks) {
    addNode(nodes, existingNodeIds, 'task', 'task', task.id, labelOrId(task.title, task.id), {
      planRunId: task.planRunId,
      status: task.status ?? null,
    })
  }
  for (const artifact of artifacts) {
    addNode(nodes, existingNodeIds, 'artifact', 'artifact', artifact.id, labelOrId(artifact.title, artifact.id), {
      artifactType: artifact.artifactType ?? null,
      planRunId: artifact.planRunId,
    })
  }

  for (const episode of episodes) {
    addEdge(edges, existingEdgeIds, existingNodeIds, 'contains', projectNodeId, nodeId('episode', episode.id), 'episode', episode.id)
  }

  const clipsByScope = new Map<string, ProjectKnowledgeClipInput[]>()
  for (const clip of clips) {
    const parentNodeId = clip.episodeId ? nodeId('episode', clip.episodeId) : projectNodeId
    addEdge(edges, existingEdgeIds, existingNodeIds, 'contains', parentNodeId, nodeId('clip', clip.id), 'clip', clip.id)
    const scopeId = clip.episodeId ?? input.project.id
    clipsByScope.set(scopeId, [...(clipsByScope.get(scopeId) ?? []), clip])
  }
  for (const scopedClips of clipsByScope.values()) {
    const orderedClips = [...scopedClips].sort(byOrderThenId)
    for (let index = 0; index < orderedClips.length - 1; index += 1) {
      const current = orderedClips[index]
      const next = orderedClips[index + 1]
      addEdge(
        edges,
        existingEdgeIds,
        existingNodeIds,
        'before',
        nodeId('clip', current.id),
        nodeId('clip', next.id),
        'clip',
        current.id,
      )
    }
  }
  for (const clip of clips) {
    addAssetUseEdges({
      edges,
      existingEdgeIds,
      existingNodeIds,
      sourceNodeId: nodeId('clip', clip.id),
      sourceTable: 'clip',
      sourceId: clip.id,
      assetIds: clip.assetIds,
    })
  }

  for (const shot of shots) {
    const parentNodeId = shot.clipId ? nodeId('clip', shot.clipId) : projectNodeId
    addEdge(edges, existingEdgeIds, existingNodeIds, 'contains', parentNodeId, nodeId('shot', shot.id), 'shot', shot.id)
    addAssetUseEdges({
      edges,
      existingEdgeIds,
      existingNodeIds,
      sourceNodeId: nodeId('shot', shot.id),
      sourceTable: 'shot',
      sourceId: shot.id,
      assetIds: shot.assetIds,
    })
    for (const dependencyId of shot.dependsOnShotIds ?? []) {
      addEdge(
        edges,
        existingEdgeIds,
        existingNodeIds,
        'depends_on',
        nodeId('shot', shot.id),
        nodeId('shot', dependencyId),
        'shot',
        shot.id,
      )
    }
    for (const affectedShotId of shot.affectsShotIds ?? []) {
      addEdge(
        edges,
        existingEdgeIds,
        existingNodeIds,
        'affects',
        nodeId('shot', shot.id),
        nodeId('shot', affectedShotId),
        'shot',
        shot.id,
      )
    }
  }

  for (const planRun of planRuns) {
    addEdge(
      edges,
      existingEdgeIds,
      existingNodeIds,
      'contains',
      projectNodeId,
      nodeId('plan_run', planRun.id),
      'plan_run',
      planRun.id,
    )
  }
  for (const task of tasks) {
    addEdge(
      edges,
      existingEdgeIds,
      existingNodeIds,
      'contains',
      nodeId('plan_run', task.planRunId),
      nodeId('task', task.id),
      'task',
      task.id,
    )
    if (task.status === 'failed') {
      addEdge(
        edges,
        existingEdgeIds,
        existingNodeIds,
        'failed_at',
        nodeId('task', task.id),
        nodeId('plan_run', task.planRunId),
        'task',
        task.id,
      )
    }
  }
  for (const artifact of artifacts) {
    addEdge(
      edges,
      existingEdgeIds,
      existingNodeIds,
      'generated_by',
      nodeId('artifact', artifact.id),
      nodeId('plan_run', artifact.planRunId),
      'artifact',
      artifact.id,
    )
  }

  return { nodes, edges }
}

export function queryProjectKnowledgeProjection(
  input: QueryProjectKnowledgeProjectionInput,
): ProjectKnowledgeProjection {
  if (!Number.isInteger(input.depth) || input.depth < 0) {
    throw new Error(`PROJECT_KNOWLEDGE_QUERY_DEPTH_INVALID:${input.depth}`)
  }
  if (!input.projection.nodes.some((node) => node.id === input.rootNodeId)) {
    throw new Error(`PROJECT_KNOWLEDGE_ROOT_NOT_FOUND:${input.rootNodeId}`)
  }

  const selectedNodeIds = new Set<string>([input.rootNodeId])
  let frontier = new Set<string>([input.rootNodeId])
  for (let distance = 0; distance < input.depth; distance += 1) {
    const nextFrontier = new Set<string>()
    for (const edge of input.projection.edges) {
      if (frontier.has(edge.fromNodeId) && !selectedNodeIds.has(edge.toNodeId)) {
        selectedNodeIds.add(edge.toNodeId)
        nextFrontier.add(edge.toNodeId)
      }
      if (frontier.has(edge.toNodeId) && !selectedNodeIds.has(edge.fromNodeId)) {
        selectedNodeIds.add(edge.fromNodeId)
        nextFrontier.add(edge.fromNodeId)
      }
    }
    frontier = nextFrontier
  }

  return {
    nodes: input.projection.nodes.filter((node) => selectedNodeIds.has(node.id)),
    edges: input.projection.edges.filter((edge) => (
      selectedNodeIds.has(edge.fromNodeId) && selectedNodeIds.has(edge.toNodeId)
    )),
  }
}
