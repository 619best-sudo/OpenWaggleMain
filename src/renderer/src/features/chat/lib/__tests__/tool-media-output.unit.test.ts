import { describe, expect, it } from 'vitest'
import {
  getToolMediaOutput,
  hasToolMedia,
  isMediaFileRef,
  mediaKindFromExtension,
  mediaKindFromMimeType,
  mimeTypeForPath,
  parseDataUrl,
} from '../tool-media-output'

describe('tool-media-output extraction', () => {
  describe('parseDataUrl', () => {
    it('parses a base64 image data url', () => {
      expect(parseDataUrl('data:image/png;base64,AAAA')).toEqual({
        mimeType: 'image/png',
        isBase64: true,
      })
    })
    it('parses a non-base64 data url', () => {
      expect(parseDataUrl('data:text/plain,hello')).toEqual({
        mimeType: 'text/plain',
        isBase64: false,
      })
    })
    it('returns null for non-data urls', () => {
      expect(parseDataUrl('https://example.com/x.png')).toBeNull()
    })
  })

  describe('mediaKindFromExtension / mimeTypeForPath', () => {
    it('classifies image/video/audio/html extensions', () => {
      expect(mediaKindFromExtension('a.png')).toBe('image')
      expect(mediaKindFromExtension('a.mp4')).toBe('video')
      expect(mediaKindFromExtension('a.mp3')).toBe('audio')
      expect(mediaKindFromExtension('a.html')).toBe('html')
      expect(mediaKindFromExtension('a.txt')).toBeNull()
    })
    it('resolves mime types for known extensions', () => {
      expect(mimeTypeForPath('x.webp')).toBe('image/webp')
      expect(mimeTypeForPath('x.WEBM')).toBe('video/webm')
      expect(mimeTypeForPath('noext')).toBeUndefined()
    })
    it('classifies media kinds from mime types', () => {
      expect(mediaKindFromMimeType('image/png')).toBe('image')
      expect(mediaKindFromMimeType('IMAGE/SVG+XML')).toBe('image')
      expect(mediaKindFromMimeType('video/mp4')).toBe('video')
      expect(mediaKindFromMimeType('audio/wav')).toBe('audio')
      expect(mediaKindFromMimeType('text/html')).toBe('html')
      expect(mediaKindFromMimeType('application/json')).toBeNull()
      expect(mediaKindFromMimeType(undefined)).toBeNull()
    })
  })

  describe('isMediaFileRef', () => {
    it('recognizes a file:// uri', () => {
      expect(isMediaFileRef('file:///tmp/out.png')).toEqual({
        path: '/tmp/out.png',
        mediaKind: 'image',
      })
    })
    it('recognizes a relative workspace path', () => {
      expect(isMediaFileRef('output/video.mp4')).toEqual({
        path: 'output/video.mp4',
        mediaKind: 'video',
      })
    })
    it('rejects remote http urls', () => {
      expect(isMediaFileRef('https://example.com/x.png')).toBeNull()
    })
    it('rejects non-media extensions', () => {
      expect(isMediaFileRef('README.md')).toBeNull()
    })
  })

  describe('getToolMediaOutput — content array shapes', () => {
    it('extracts a Claude-style image block with source.value data url', () => {
      const out = getToolMediaOutput({
        content: [{ type: 'image', source: { value: 'data:image/png;base64,AAAA' } }],
      })
      expect(out).toEqual({
        kind: 'image',
        src: 'data:image/png;base64,AAAA',
        needsResolution: false,
      })
    })

    it('extracts an MCP-style image block with data + mimeType', () => {
      const out = getToolMediaOutput({
        content: [{ type: 'image', data: 'AAAA', mimeType: 'image/png' }],
      })
      expect(out).toMatchObject({ kind: 'image', needsResolution: false })
      expect((out as { src: string }).src).toBe('data:image/png;base64,AAAA')
    })

    it('extracts a video block from a file path', () => {
      const out = getToolMediaOutput({
        content: [{ type: 'video', source: { value: 'renders/scene.mp4' } }],
      })
      expect(out).toEqual({
        kind: 'video',
        src: 'renders/scene.mp4',
        needsResolution: true,
        mimeType: 'video/mp4',
      })
    })

    it('extracts an audio block', () => {
      const out = getToolMediaOutput({
        content: [{ type: 'audio', data: 'UklGRiQ=', mimeType: 'audio/wav' }],
      })
      expect(out).toMatchObject({ kind: 'audio', needsResolution: false, mimeType: 'audio/wav' })
    })

    it('extracts an html block from data', () => {
      const out = getToolMediaOutput({
        content: [{ type: 'html', data: '<p>hi</p>' }],
      })
      expect(out).toEqual({ kind: 'html', html: '<p>hi</p>' })
    })

    it('returns the first media block when several are present', () => {
      const out = getToolMediaOutput({
        content: [
          { type: 'text', text: 'rendering...' },
          { type: 'image', data: 'AAAA', mimeType: 'image/png' },
          { type: 'image', data: 'BBBB', mimeType: 'image/png' },
        ],
      })
      expect((out as { src: string }).src).toBe('data:image/png;base64,AAAA')
    })

    it('returns null for text-only content', () => {
      expect(getToolMediaOutput({ content: [{ type: 'text', text: 'no media here' }] })).toBeNull()
    })

    it('extracts an assets_generator file-reference block (uri + mimeType)', () => {
      // assets_generator returns the generated asset by reference, not inline:
      //   { content: [{ type: 'file', uri: <path>, mimeType }], output: <text> }
      // The kind is not in the block type, so it must come from the MIME (or the
      // path extension). Without this, the block is unrecognized and the tool
      // shows only its text output ("Generated image → <path>") with no preview.
      const out = getToolMediaOutput({
        content: [{ type: 'file', uri: 'assets/hero.png', mimeType: 'image/png' }],
      })
      expect(out).toEqual({
        kind: 'image',
        src: 'assets/hero.png',
        needsResolution: true,
      })
    })

    it('derives video kind from the mimeType of a file-reference block', () => {
      const out = getToolMediaOutput({
        content: [{ type: 'file', uri: 'assets/loop.mp4', mimeType: 'video/mp4' }],
      })
      expect(out).toEqual({
        kind: 'video',
        src: 'assets/loop.mp4',
        needsResolution: true,
        mimeType: 'video/mp4',
      })
    })

    it('falls back to the path extension when a file block has no mimeType', () => {
      const out = getToolMediaOutput({
        content: [{ type: 'file', uri: 'assets/icon.svg' }],
      })
      expect(out).toMatchObject({ kind: 'image', src: 'assets/icon.svg', needsResolution: true })
    })

    it('falls back to a details.{uri,mimeType} reference when content has no media block', () => {
      // Some disk-writing tools surface the asset path only on `details`.
      const out = getToolMediaOutput({
        content: [{ type: 'text', text: 'Generated image → assets/hero.png' }],
        details: { uri: 'assets/hero.png', mimeType: 'image/png', size: 12345 },
      })
      expect(out).toEqual({
        kind: 'image',
        src: 'assets/hero.png',
        needsResolution: true,
      })
    })

    it('ignores a file block whose mimeType is not a previewable media kind', () => {
      // A JSON manifest "asset" is not previewable — leave it as the text output.
      const out = getToolMediaOutput({
        content: [{ type: 'file', uri: 'assets/scene.json', mimeType: 'application/json' }],
      })
      expect(out).toBeNull()
    })
  })

  describe('getToolMediaOutput — bare string payloads', () => {
    it('extracts a bare data url string', () => {
      const out = getToolMediaOutput('data:image/gif;base64,R0lGODlh')
      expect(out).toMatchObject({ kind: 'image', needsResolution: false })
    })

    it('extracts a bare media path string', () => {
      const out = getToolMediaOutput('snapshots/frame.png')
      expect(out).toMatchObject({ kind: 'image', needsResolution: true })
    })
  })

  describe('getToolMediaOutput — structured wrapper unwrap', () => {
    it('unwraps { kind: "json", data: { content: [...] } }', () => {
      const out = getToolMediaOutput({
        kind: 'json',
        data: { content: [{ type: 'image', data: 'AAAA', mimeType: 'image/png' }] },
      })
      expect(out).toMatchObject({ kind: 'image' })
    })
  })

  describe('hasToolMedia', () => {
    it('returns true when media present', () => {
      expect(hasToolMedia({ content: [{ type: 'image', data: 'A', mimeType: 'image/png' }] })).toBe(
        true,
      )
    })
    it('returns false otherwise', () => {
      expect(hasToolMedia({ content: [{ type: 'text', text: 'x' }] })).toBe(false)
    })
  })
})

describe('html file paths (regression: "Nothing to preview.")', () => {
  // An agent writing index.html used to produce {kind:'html', src, …} cast into
  // a video/audio shape, so the preview received html={undefined}, sanitized it
  // to '' and rendered a dead "Nothing to preview." card. The path form is now
  // first-class and marked for IPC resolution.
  it('marks an .html path for resolution instead of losing it', () => {
    const out = getToolMediaOutput('index.html')
    expect(out).toEqual({ kind: 'html', src: 'index.html', needsResolution: true })
  })

  it('handles nested and file:// html paths the same way', () => {
    expect(getToolMediaOutput('dist/index.html')).toEqual({
      kind: 'html',
      src: 'dist/index.html',
      needsResolution: true,
    })
    expect(getToolMediaOutput('file:///tmp/site/page.htm')).toEqual({
      kind: 'html',
      src: '/tmp/site/page.htm',
      needsResolution: true,
    })
  })

  it('never marks inline markup for resolution', () => {
    const out = getToolMediaOutput({
      content: [{ type: 'html', data: '<h1>Hi</h1>' }],
    })
    expect(out).toEqual({ kind: 'html', html: '<h1>Hi</h1>' })
  })

  it('still ignores remote html urls', () => {
    expect(getToolMediaOutput('https://example.com/index.html')).toBeNull()
  })
})

describe('prose containing a path is not a media ref', () => {
  // Regression: the write tool returns "Wrote /path/index.html". The old guard
  // accepted it because it contained a slash and ended in .html, so the whole
  // SENTENCE became the src and resolution failed with
  // "Media file could not be found."
  it('rejects a sentence that merely mentions a file', () => {
    expect(isMediaFileRef('Wrote /Users/x/proj/index.html')).toBeNull()
    expect(isMediaFileRef('Edited /tmp/a.png (2 replacements)')).toBeNull()
    expect(getToolMediaOutput('Wrote /Users/x/proj/index.html')).toBeNull()
  })

  it('still accepts a bare path token', () => {
    expect(isMediaFileRef('/Users/x/proj/index.html')).toEqual({
      path: '/Users/x/proj/index.html',
      mediaKind: 'html',
    })
    expect(isMediaFileRef('assets/out.png')).toEqual({ path: 'assets/out.png', mediaKind: 'image' })
  })
})
