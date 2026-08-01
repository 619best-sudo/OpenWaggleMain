import type { HydratedAttachment } from '@shared/types/agent'
import { describe, expect, it } from 'vitest'
import {
  buildAttachmentIntentSection,
  detectAttachmentIntent,
  imageRefsFrom,
  toTuringAttachments,
} from '../turing/turing-attachments'

function attachment(over: Partial<HydratedAttachment> = {}): HydratedAttachment {
  return {
    id: 'att-1',
    kind: 'image',
    name: 'mockup.png',
    path: '/tmp/project/.attachments/mockup.png',
    mimeType: 'image/png',
    sizeBytes: 2048,
    extractedText: '',
    source: null,
    ...over,
  } as HydratedAttachment
}

describe('toTuringAttachments', () => {
  it('carries the on-disk path through as the ref uri', () => {
    // The harness addresses media by PATH and reads it on demand inside the tool,
    // so `ref.uri` is the field that actually makes an attachment usable.
    const [mapped] = toTuringAttachments([attachment()])

    expect(mapped?.type).toBe('image')
    expect(mapped?.ref?.uri).toBe('/tmp/project/.attachments/mockup.png')
    expect(mapped?.fileName).toBe('/tmp/project/.attachments/mockup.png')
    expect(mapped?.mimeType).toBe('image/png')
  })

  it('maps pdf to document and text to file', () => {
    const mapped = toTuringAttachments([
      attachment({ id: 'a', kind: 'pdf', mimeType: 'application/pdf' }),
      attachment({ id: 'b', kind: 'text', mimeType: 'text/plain' }),
    ])

    expect(mapped.map((m) => m.type)).toEqual(['document', 'file'])
  })

  it('drops entries with no usable path', () => {
    // A path-less attachment would reach a vision model as "could not read image"
    // mid-analysis; omitting it cleanly is better than a confusing partial result.
    expect(toTuringAttachments([attachment({ path: '' })])).toEqual([])
    expect(toTuringAttachments([attachment({ path: '   ' })])).toEqual([])
    expect(toTuringAttachments(undefined)).toEqual([])
  })
})

describe('imageRefsFrom', () => {
  it('returns only image attachments', () => {
    const refs = imageRefsFrom([
      attachment({ id: 'a' }),
      attachment({ id: 'b', kind: 'pdf', path: '/tmp/doc.pdf', mimeType: 'application/pdf' }),
    ])

    expect(refs).toEqual([{ path: '/tmp/project/.attachments/mockup.png', mimeType: 'image/png' }])
  })
})

describe('detectAttachmentIntent', () => {
  it('is none without an image, whatever the text says', () => {
    expect(detectAttachmentIntent('build this screen', [])).toBe('none')
    expect(detectAttachmentIntent('build this screen', undefined)).toBe('none')
  })

  it('reads build verbs as build intent', () => {
    for (const text of [
      'build this screen',
      'create the UI from this',
      'implement this design',
      'recreate this page in React',
      'turn this into a component',
    ]) {
      expect(detectAttachmentIntent(text, [attachment()])).toBe('build-from-image')
    }
  })

  it('reads question/QA phrasing as analysis intent', () => {
    for (const text of [
      'what is wrong with this screen?',
      'explain this diagram',
      'why does this look broken',
      'review this layout',
    ]) {
      expect(detectAttachmentIntent(text, [attachment()])).toBe('analyze-image')
    }
  })

  it('defaults a bare image to build intent', () => {
    // In a coding agent, an attached mockup with no verb means "make this".
    expect(detectAttachmentIntent("here's the mockup", [attachment()])).toBe('build-from-image')
  })

  it('lets build intent win when both readings apply', () => {
    // "look at this AND build it" is one instruction; stopping at analysis would
    // not deliver the thing that was asked for.
    expect(detectAttachmentIntent('review this mockup and build it', [attachment()])).toBe(
      'build-from-image',
    )
  })
})

describe('buildAttachmentIntentSection', () => {
  it('tells the model to route images into write/edit for build intent', () => {
    // Listing the images is not enough — the `images` ARGUMENT is what triggers
    // vision authoring of the file bytes, so the steer has to name it.
    const section = buildAttachmentIntentSection('build this screen', [attachment()])

    expect(section).toContain('/tmp/project/.attachments/mockup.png')
    expect(section).toContain('media_analysis')
    expect(section).toContain('`images` argument of `write`/`edit`')
  })

  it('steers to analysis only when the user is asking a question', () => {
    const section = buildAttachmentIntentSection('what is wrong here?', [attachment()])

    expect(section).toContain('media_analysis')
    expect(section).not.toContain('`images` argument of `write`/`edit`')
  })

  it('is undefined with no images to steer', () => {
    expect(buildAttachmentIntentSection('build this', [])).toBeUndefined()
  })
})
