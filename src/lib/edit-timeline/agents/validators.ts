import type { ReferenceAsset } from '../types'

export const CAMERA_LANGUAGE_PATTERN = /\b(close-up|wide|medium|over-shoulder|over shoulder|insert|locked|dolly|pan|tilt|rack focus|lighting|composition|framing|camera)\b/i

export function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function firstNonEmpty(values: readonly (string | null | undefined)[], fallback: string): string {
  for (const value of values) {
    const trimmed = compactText(value ?? '')
    if (trimmed.length > 0) return trimmed
  }
  return compactText(fallback)
}

export function ensureSentence(value: string): string {
  const compact = compactText(value)
  if (/[.!?。！？]$/.test(compact)) return compact
  return `${compact}.`
}

export function trimToSentence(value: string, maxLength: number): string {
  const compact = compactText(value)
  if (compact.length <= maxLength) return compact
  const sentenceEnd = compact.slice(0, maxLength).search(/[.!?。！？]/)
  if (sentenceEnd > 24) return compact.slice(0, sentenceEnd + 1).trim()
  return `${compact.slice(0, maxLength).trim().replace(/[，,;:：、-]+$/, '')}.`
}

export function stripCameraLanguage(value: string): string {
  return compactText(value
    .replace(/\b(close-up|wide|medium|over-shoulder|over shoulder|insert|locked|dolly|pan|tilt|rack focus|lighting|composition|framing|camera)\b/gi, '')
    .replace(/\bshot\b/gi, '')
    .replace(/\s+[,.;:]\s+/g, ' '))
}

export function avoidSourceRestatement(params: {
  candidate: string
  sourceStory: string
  fallback: string
}): string {
  const candidate = compactText(params.candidate)
  const sourceStory = compactText(params.sourceStory)
  if (!candidate) return compactText(params.fallback)
  if (sourceStory && candidate === sourceStory) return compactText(params.fallback)
  if (sourceStory && candidate.length > 120 && sourceStory.includes(candidate)) {
    return trimToSentence(params.fallback, 120)
  }
  return candidate
}

export function labelsForReferences(params: {
  referenceIds: readonly string[]
  references: readonly ReferenceAsset[]
  kinds?: readonly ReferenceAsset['kind'][]
}): string[] {
  const kinds = params.kinds ? new Set(params.kinds) : null
  return params.referenceIds
    .map((referenceId) => params.references.find((reference) => reference.id === referenceId))
    .filter((reference): reference is ReferenceAsset => reference !== undefined)
    .filter((reference) => !kinds || kinds.has(reference.kind))
    .map((reference) => reference.label.trim())
    .filter((label) => label.length > 0)
}

export function joinUnique(parts: readonly (string | null | undefined)[]): string {
  const seen = new Set<string>()
  const values: string[] = []
  for (const part of parts) {
    const trimmed = compactText(part ?? '')
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    values.push(trimmed)
  }
  return values.join(' ')
}
