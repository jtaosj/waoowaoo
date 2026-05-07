export type ConfirmationSubmissionBlocker = 'videoModelRequired'

const PANEL_VIDEO_OPERATION_ID = 'generate_panel_video'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function hasVideoModel(value: unknown): boolean {
  return isRecord(value) && readString(value.videoModel).length > 0
}

function getRecordField(value: unknown, field: string): Record<string, unknown> | null {
  if (!isRecord(value)) return null
  return isRecord(value[field]) ? value[field] : null
}

function isPanelVideoOperation(operationId: string): boolean {
  return operationId === PANEL_VIDEO_OPERATION_ID
}

function blocksDirectPanelVideo(operationId: string, argsHint: unknown): boolean {
  if (!isPanelVideoOperation(operationId)) return false
  return !hasVideoModel(argsHint)
}

function blocksInvokeOperationPanelVideo(argsHint: unknown): boolean {
  if (!isRecord(argsHint)) return false
  if (!isPanelVideoOperation(readString(argsHint.operationId))) return false
  return !hasVideoModel(getRecordField(argsHint, 'input'))
}

function blocksExecutePlanPanelVideo(argsHint: unknown): boolean {
  if (!isRecord(argsHint) || !Array.isArray(argsHint.steps)) return false
  return argsHint.steps.some((step) => (
    isRecord(step)
    && isPanelVideoOperation(readString(step.operationId))
    && !hasVideoModel(getRecordField(step, 'input'))
  ))
}

export function getConfirmationSubmissionBlocker(
  operationId: string,
  argsHint?: Record<string, unknown> | null,
): ConfirmationSubmissionBlocker | null {
  if (blocksDirectPanelVideo(operationId, argsHint)) return 'videoModelRequired'
  if (operationId === 'invoke_operation' && blocksInvokeOperationPanelVideo(argsHint)) return 'videoModelRequired'
  if (operationId === 'execute_plan' && blocksExecutePlanPanelVideo(argsHint)) return 'videoModelRequired'
  return null
}

export function getConfirmationSubmissionBlockerMessageKey(
  _blocker: ConfirmationSubmissionBlocker,
): 'cards.videoModelRequiredForConfirmation' {
  return 'cards.videoModelRequiredForConfirmation'
}
