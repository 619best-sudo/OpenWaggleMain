import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { resolveToolMediaFile } = vi.hoisted(() => ({ resolveToolMediaFile: vi.fn() }))

vi.mock('@/shared/lib/ipc', () => ({
  api: { resolveToolMediaFile },
}))

vi.mock('@/features/sessions/state', () => ({
  useSessionStore: (selector: (state: { activeWorkspace: unknown }) => unknown) =>
    selector({
      activeWorkspace: { tree: { session: { projectPath: '/proj' } } },
    }),
}))

import { sanitizeToolHtml } from '../../lib/tool-media-output'
import { ToolMediaPreview } from '../ToolMediaPreview'

beforeEach(() => {
  resolveToolMediaFile.mockReset()
})

describe('ToolMediaPreview', () => {
  it('renders an inline image data url immediately', () => {
    render(
      <ToolMediaPreview
        output={{ kind: 'image', src: 'data:image/png;base64,AAAA', needsResolution: false }}
      />,
    )
    const img = document.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,AAAA')
  })

  it('renders a video element for video output', () => {
    render(
      <ToolMediaPreview
        output={{
          kind: 'video',
          src: 'data:video/mp4;base64,AAAA',
          needsResolution: false,
          mimeType: 'video/mp4',
        }}
      />,
    )
    const video = document.querySelector('video')
    expect(video).not.toBeNull()
    expect(video?.getAttribute('src')).toBe('data:video/mp4;base64,AAAA')
  })

  it('renders an audio element for audio output', () => {
    render(
      <ToolMediaPreview
        output={{
          kind: 'audio',
          src: 'data:audio/wav;base64,AAAA',
          needsResolution: false,
          mimeType: 'audio/wav',
        }}
      />,
    )
    expect(document.querySelector('audio')).not.toBeNull()
  })

  it('renders sanitized html output (no scripts)', () => {
    render(<ToolMediaPreview output={{ kind: 'html', html: '<p>hi</p><script>x</script>' }} />)
    const container = document.querySelector('.tool-html-preview') as HTMLElement | null
    expect(container).not.toBeNull()
    expect(container?.innerHTML).toContain('<p>hi</p>')
    expect(container?.innerHTML).not.toContain('<script')
  })

  it('resolves a path-sourced image via IPC then renders it', async () => {
    resolveToolMediaFile.mockResolvedValue({
      dataUrl: 'data:image/png;base64,AAAA',
      mimeType: 'image/png',
    })
    render(
      <ToolMediaPreview output={{ kind: 'image', src: 'out/pixel.png', needsResolution: true }} />,
    )
    expect(resolveToolMediaFile).toHaveBeenCalledWith('/proj', 'out/pixel.png')
    // Eventually the <img> appears with the resolved src.
    const img = await screen.findByRole('img')
    expect(img.getAttribute('src')).toBe('data:image/png;base64,AAAA')
  })

  it('shows an error when IPC resolution fails', async () => {
    resolveToolMediaFile.mockResolvedValue({ error: 'File too large.' })
    render(<ToolMediaPreview output={{ kind: 'image', src: 'big.png', needsResolution: true }} />)
    expect(await screen.findByText('File too large.')).toBeInTheDocument()
  })
})

describe('sanitizeToolHtml (component/jsdom env)', () => {
  it('strips scripts, handlers, javascript: uris', () => {
    const clean = sanitizeToolHtml(
      '<div onclick="a()"><p>x</p><script>alert(1)</script><a href="javascript:alert(2)">y</a></div>',
    )
    expect(clean).toContain('<p>x</p>')
    expect(clean).not.toContain('<script')
    expect(clean).not.toContain('onclick')
    expect(clean).not.toContain('javascript:')
  })

  it('strips iframe and form elements', () => {
    const clean = sanitizeToolHtml('<iframe src="z"></iframe><form><input></form><p>ok</p>')
    expect(clean).not.toContain('<iframe')
    expect(clean).not.toContain('<form')
    expect(clean).toContain('<p>ok</p>')
  })

  it('unwraps unknown tags but keeps children', () => {
    const clean = sanitizeToolHtml('<foo><span>inside</span></foo>')
    expect(clean).toContain('<span>inside</span>')
    expect(clean).not.toContain('<foo')
  })
})

describe('ToolMediaPreview — html written to a file', () => {
  it('resolves an .html path and renders the page instead of "Nothing to preview."', async () => {
    const markup = '<h1>Hello world</h1><script>alert(1)</script>'
    resolveToolMediaFile.mockResolvedValue({
      dataUrl: `data:text/html;base64,${btoa(markup)}`,
      mimeType: 'text/html',
    })

    render(<ToolMediaPreview output={{ kind: 'html', src: 'index.html', needsResolution: true }} />)

    expect(await screen.findByText('Hello world')).toBeInTheDocument()
    expect(resolveToolMediaFile).toHaveBeenCalledWith('/proj', 'index.html')
    expect(screen.queryByText('Nothing to preview.')).not.toBeInTheDocument()
    // Sanitizing still applies to resolved files, not just inline markup.
    expect(document.querySelector('script')).toBeNull()
  })

  it('decodes non-ASCII content correctly', async () => {
    // atob alone yields latin-1; a page with any accented character would render
    // as mojibake without the TextDecoder pass.
    const markup = '<p>Café — 日本語</p>'
    const bytes = new TextEncoder().encode(markup)
    const b64 = btoa(String.fromCharCode(...bytes))
    resolveToolMediaFile.mockResolvedValue({
      dataUrl: `data:text/html;base64,${b64}`,
      mimeType: 'text/html',
    })

    render(<ToolMediaPreview output={{ kind: 'html', src: 'page.html', needsResolution: true }} />)
    expect(await screen.findByText('Café — 日本語')).toBeInTheDocument()
  })

  it('surfaces a resolve failure rather than showing an empty card', async () => {
    resolveToolMediaFile.mockResolvedValue({ error: 'File is outside the workspace.' })
    render(
      <ToolMediaPreview output={{ kind: 'html', src: '../evil.html', needsResolution: true }} />,
    )
    expect(await screen.findByText('File is outside the workspace.')).toBeInTheDocument()
  })

  it('still renders inline markup with no IPC call', () => {
    render(<ToolMediaPreview output={{ kind: 'html', html: '<h2>Inline</h2>' }} />)
    expect(screen.getByText('Inline')).toBeInTheDocument()
    expect(resolveToolMediaFile).not.toHaveBeenCalled()
  })
})
