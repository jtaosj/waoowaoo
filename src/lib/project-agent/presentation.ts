import type { ProjectContextSnapshot } from '@/lib/project-context/types'
import type {
  ProjectAssistantContextSnapshot,
} from './types'

export function buildAssistantProjectContextSnapshot(
  context: ProjectContextSnapshot,
): ProjectAssistantContextSnapshot {
  return {
    projectId: context.projectId,
    projectName: context.projectName,
    episodeId: context.episodeId,
    episodeName: context.episodeName,
    currentStage: context.currentStage,
    selectedScopeRef: context.selectedScopeRef,
    selectedPanelId: context.selectedPanelId,
    selectedClipId: context.selectedClipId,
    selectedAssetId: context.selectedAssetId,
    activePlanRuns: context.activePlanRuns,
    activeOperationTasks: context.activeOperationTasks,
    recentOperationResults: context.recentOperationResults,
    latestArtifacts: context.latestArtifacts,
    config: {
      analysisModel: context.policy.analysisModel || null,
      videoModel: context.policy.videoModel || null,
      artStyle: context.policy.artStyle,
      videoRatio: context.policy.videoRatio,
    },
  }
}
