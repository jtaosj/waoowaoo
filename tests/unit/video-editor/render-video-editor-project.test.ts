import { describe, expect, it, vi } from 'vitest'
import { toRenderableVideoEditorMediaUrl } from '@/lib/video-editor/render-video-editor-project'

vi.mock('@/lib/storage', () => ({
  getSignedObjectUrl: (key: string) => key.startsWith('local/')
    ? `/api/files/${encodeURIComponent(key)}`
    : `http://localhost:19000/waoowaoo/${encodeURIComponent(key)}?signed=1`,
  toFetchableUrl: (inputUrl: string) => inputUrl.startsWith('/')
    ? `http://127.0.0.1:3000${inputUrl}`
    : inputUrl,
  uploadObject: vi.fn(),
}))

describe('video editor render media URL normalization', () => {
  it('turns provider storage keys into directly fetchable signed object URLs', async () => {
    await expect(toRenderableVideoEditorMediaUrl('images/panel-video-1.mp4'))
      .resolves.toBe('http://localhost:19000/waoowaoo/images%2Fpanel-video-1.mp4?signed=1')
  })

  it('keeps already fetchable media URLs unchanged', async () => {
    await expect(toRenderableVideoEditorMediaUrl('https://cdn.example.test/video.mp4'))
      .resolves.toBe('https://cdn.example.test/video.mp4')
    await expect(toRenderableVideoEditorMediaUrl('data:video/mp4;base64,abc'))
      .resolves.toBe('data:video/mp4;base64,abc')
  })

  it('turns local signed routes into absolute URLs for headless rendering', async () => {
    await expect(toRenderableVideoEditorMediaUrl('local/panel-video-1.mp4'))
      .resolves.toBe('http://127.0.0.1:3000/api/files/local%2Fpanel-video-1.mp4')
  })
})
