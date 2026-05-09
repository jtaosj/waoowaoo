export type WorkspaceExecutionTranslate = (
  key: string,
  values?: Record<string, string | number>,
) => string

export function buildWorkspaceAssistantPlanRequestMessage(params: {
  storyText: string
  t: WorkspaceExecutionTranslate
}): string {
  const story = params.storyText.trim()
  if (!story) return params.t('execution.assistantPlanRequest')
  return story
}
