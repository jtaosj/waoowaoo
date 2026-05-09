import { describe, expect, it } from 'vitest'
import {
  buildProjectVideoProxyUrl,
  extractFinalVideoStorageKey,
} from '@/lib/video/final-video-storage'

describe('final video storage helpers', () => {
  it('extracts final video storage keys from canonical refs', () => {
    expect(extractFinalVideoStorageKey('final-videos/episode-1/final.mp4'))
      .toBe('final-videos/episode-1/final.mp4')
  })

  it('extracts final video storage keys from signed storage URLs', () => {
    expect(extractFinalVideoStorageKey(
      'http://localhost:19000/waoowaoo/final-videos/episode-1/final.mp4?X-Amz-Signature=signature',
    )).toBe('final-videos/episode-1/final.mp4')
  })

  it('extracts final video storage keys from proxy URLs', () => {
    expect(extractFinalVideoStorageKey(
      '/api/projects/project-1/video-proxy?key=final-videos%2Fepisode-1%2Ffinal.mp4',
    )).toBe('final-videos/episode-1/final.mp4')
  })

  it('builds stable project video proxy URLs', () => {
    expect(buildProjectVideoProxyUrl('project 1', 'final-videos/episode-1/final.mp4'))
      .toBe('/api/projects/project%201/video-proxy?key=final-videos%2Fepisode-1%2Ffinal.mp4')
  })
})
