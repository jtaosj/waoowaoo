'use client'

import { useCallback, useEffect, useState } from 'react'
import ProgressToast from '@/components/ProgressToast'
import ConfirmDialog from '@/components/ConfirmDialog'
import { AnimatedBackground } from '@/components/ui/SharedComponents'
import { WorkspaceProvider } from './WorkspaceProvider'
import WorkspaceAssetLibraryModal from './components/WorkspaceAssetLibraryModal'
import WorkspaceAssistantPanel from './components/WorkspaceAssistantPanel'
import WorkspaceHeaderShell from './components/WorkspaceHeaderShell'
import ProjectWorkspaceCanvas from './canvas/ProjectWorkspaceCanvas'
import type { WorkspaceAssistantSelectionContext } from './canvas/ProjectWorkspaceCanvas'
import { WorkspaceRuntimeProvider } from './WorkspaceRuntimeContext'
import { useProjectWorkspaceController } from './hooks/useProjectWorkspaceController'
import type { ProjectWorkspaceProps } from './types'
import type { EditTimelinePartData } from '@/lib/project-agent/types'
import {
  getLatestWorkspaceEditTimeline,
  isWorkspaceEditTimelineUpdatedEvent,
  publishWorkspaceEditTimeline,
  WORKSPACE_EDIT_TIMELINE_UPDATED_EVENT,
} from './components/workspace-assistant/edit-timeline-board-event'
import '@/styles/animations.css'

function ProjectWorkspaceContent(props: ProjectWorkspaceProps) {
  const vm = useProjectWorkspaceController(props)
  const [isAssistantPanelCollapsed, setIsAssistantPanelCollapsed] = useState(false)
  const [assistantSelection, setAssistantSelection] = useState<WorkspaceAssistantSelectionContext>({})
  const [latestEditTimeline, setLatestEditTimeline] = useState<EditTimelinePartData | null>(null)
  const isEpisodeWorkspace = props.viewMode === 'episode'
  const handleEditTimelineData = useCallback((data: EditTimelinePartData) => {
    setLatestEditTimeline(publishWorkspaceEditTimeline(data))
  }, [])

  const {
    project,
    projectId,
    episodeId,
    episodes = [],
    onEpisodeSelect,
    onEpisodeCreate,
    onEpisodeRename,
    onEpisodeDelete,
  } = props

  useEffect(() => {
    setLatestEditTimeline(getLatestWorkspaceEditTimeline())
    const handleEditTimelineUpdated = (event: Event) => {
      if (!isWorkspaceEditTimelineUpdatedEvent(event)) return
      setLatestEditTimeline(event.detail.data)
    }
    window.addEventListener(WORKSPACE_EDIT_TIMELINE_UPDATED_EVENT, handleEditTimelineUpdated)
    return () => window.removeEventListener(WORKSPACE_EDIT_TIMELINE_UPDATED_EVENT, handleEditTimelineUpdated)
  }, [])

  if (!vm.project.projectData) {
    return <div className="text-center text-(--glass-text-secondary)">{vm.i18n.tc('loading')}</div>
  }

  return (
    <div className={isEpisodeWorkspace ? 'h-full min-h-0 overflow-hidden' : undefined}>
      <AnimatedBackground />

      <WorkspaceHeaderShell
        isSettingsModalOpen={vm.ui.isSettingsModalOpen}
        isWorldContextModalOpen={vm.ui.isWorldContextModalOpen}
        onCloseSettingsModal={() => vm.ui.setIsSettingsModalOpen(false)}
        onCloseWorldContextModal={() => vm.ui.setIsWorldContextModalOpen(false)}
        availableModels={vm.ui.userModelsForSettings || undefined}
        modelsLoaded={vm.ui.userModelsLoaded}
        artStyle={vm.project.artStyle}
        analysisModel={vm.project.analysisModel}
        characterModel={vm.project.characterModel}
        locationModel={vm.project.locationModel}
        storyboardModel={vm.project.storyboardModel}
        editModel={vm.project.editModel}
        videoModel={vm.project.videoModel}
        audioModel={vm.project.audioModel}
        capabilityOverrides={vm.project.capabilityOverrides}
        videoRatio={vm.project.videoRatio}
        onUpdateConfig={vm.actions.handleUpdateConfig}
        globalAssetText={vm.project.globalAssetText}
        projectName={project.name}
        episodes={episodes}
        currentEpisodeId={episodeId}
        onEpisodeSelect={onEpisodeSelect}
        onEpisodeCreate={onEpisodeCreate}
        onEpisodeRename={onEpisodeRename}
        onEpisodeDelete={onEpisodeDelete}
        onOpenAssetLibrary={() => vm.ui.openAssetLibrary()}
        onOpenSettingsModal={() => vm.ui.setIsSettingsModalOpen(true)}
        onRefresh={() => vm.ui.onRefresh({ mode: 'full' })}
        assetLibraryLabel={vm.i18n.t('buttons.assetLibrary')}
        settingsLabel={vm.i18n.t('buttons.settings')}
        refreshTitle={vm.i18n.t('buttons.refreshData')}
      />

      <div className={isEpisodeWorkspace ? 'h-full min-h-0 overflow-hidden' : undefined}>
        <div className={isEpisodeWorkspace ? 'h-full min-h-0 overflow-hidden' : undefined}>
          <WorkspaceAssistantPanel
            projectId={projectId}
            episodeId={episodeId}
            selection={assistantSelection}
            autoStartMessage={props.assistantAutoStartMessage ?? null}
            autoStartKey={props.assistantAutoStartKey ?? null}
            onAutoStartConsumed={props.onAssistantAutoStartConsumed}
            isCollapsed={isAssistantPanelCollapsed}
            onToggleCollapsed={() => setIsAssistantPanelCollapsed((current) => !current)}
            onEditTimelineData={handleEditTimelineData}
          />

          <div className={isEpisodeWorkspace ? 'relative h-full min-w-0 overflow-hidden' : 'relative min-w-0'}>
            <WorkspaceRuntimeProvider value={vm.runtime.workspaceRuntime}>
              <ProjectWorkspaceCanvas
                editTimelineData={latestEditTimeline}
                onAssistantSelectionChange={setAssistantSelection}
              />
            </WorkspaceRuntimeProvider>
          </div>
        </div>

        <WorkspaceAssetLibraryModal
          isOpen={vm.ui.isAssetLibraryOpen}
          onClose={vm.ui.closeAssetLibrary}
          assetsLoading={vm.ui.assetsLoading}
          assetsLoadingState={vm.ui.assetsLoadingState}
          hasCharacters={vm.project.projectCharacters.length > 0}
          hasLocations={vm.project.projectLocations.length > 0}
          projectId={projectId}
          isAnalyzingAssets={vm.execution.isAssetAnalysisRunning}
          focusCharacterId={vm.ui.assetLibraryFocusCharacterId}
          focusCharacterRequestId={vm.ui.assetLibraryFocusRequestId}
          triggerGlobalAnalyze={vm.ui.triggerGlobalAnalyzeOnOpen}
          onGlobalAnalyzeComplete={() => vm.ui.setTriggerGlobalAnalyzeOnOpen(false)}
        />

        {vm.execution.showCreatingToast && (
          <ProgressToast
            show
            message={vm.i18n.t('storyInput.creating')}
            step={vm.execution.transitionProgress.step || ''}
          />
        )}

        <ConfirmDialog
          show={vm.rebuild.showRebuildConfirm}
          type="warning"
          title={vm.rebuild.rebuildConfirmTitle}
          message={vm.rebuild.rebuildConfirmMessage}
          confirmText={vm.i18n.t('rebuildConfirm.confirm')}
          cancelText={vm.i18n.t('rebuildConfirm.cancel')}
          onConfirm={vm.rebuild.handleAcceptRebuildConfirm}
          onCancel={vm.rebuild.handleCancelRebuildConfirm}
        />
      </div>
    </div>
  )
}

export default function ProjectWorkspace(props: ProjectWorkspaceProps) {
  const { projectId, episodeId } = props
  return (
    <WorkspaceProvider projectId={projectId} episodeId={episodeId}>
      <ProjectWorkspaceContent {...props} />
    </WorkspaceProvider>
  )
}
