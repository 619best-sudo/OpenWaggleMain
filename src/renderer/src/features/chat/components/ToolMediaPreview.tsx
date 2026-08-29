/**
 * Inline preview for media (image / video / audio) and HTML produced by tools.
 *
 * Renders inside the tool-result block, matching the existing file-view card
 * styling (`home-panel-frame-soft`, `bg-code-card`). Two delivery forms are
 * supported:
 *   - inline data URLs (already displayable)
 *   - file paths / `file://` URIs inside the workspace → resolved to bytes via
 *     the `tool-media:resolve` IPC handler before display
 *
 * HTML output is sanitized (scripts/handlers/dangerous URIs stripped) and
 * rendered inline — no iframe, no CSP change.
 */

import { AlertCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { api } from '@/shared/lib/ipc'
import {
  sanitizeToolHtml,
  type ToolHtmlOutput,
  type ToolMediaOutput,
} from '../lib/tool-media-output'
import { useActiveProjectPath } from '../lib/use-active-project-path'

const MEDIA_FRAME_CLASS =
  'home-panel-frame-soft rounded-md overflow-hidden bg-code-card flex items-center justify-center'
const MAX_MEDIA_HEIGHT_PX = 360

interface ResolvedMedia {
  readonly src: string
  readonly mimeType?: string
}

function MediaError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-error">
      <AlertCircle className="size-3.5 shrink-0" />
      <span className="truncate">{message}</span>
    </div>
  )
}

function MediaSkeleton() {
  return <div className="h-[120px] w-full animate-pulse bg-code-card-hover" />
}

/**
 * Resolve a path-sourced media item to a displayable data URL via the
 * `tool-media:resolve` IPC handler. Inline data URLs are returned as-is.
 */
type MediaSrcOutput = Exclude<ToolMediaOutput, { kind: 'html' }>

/** `mimeType` only exists on video/audio variants; image outputs omit it. */
function outputMimeType(output: MediaSrcOutput): string | undefined {
  return output.kind === 'image' ? undefined : output.mimeType
}

function useResolvedMediaSrc(output: MediaSrcOutput): {
  state: 'loading' | 'ready' | 'error'
  resolved: ResolvedMedia | null
  error: string | null
} {
  const projectPath = useActiveProjectPath()
  const mimeType = outputMimeType(output)
  const [resolved, setResolved] = useState<ResolvedMedia | null>(
    output.needsResolution ? null : { src: output.src, ...(mimeType ? { mimeType } : {}) },
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!output.needsResolution) {
      setResolved({ src: output.src, ...(mimeType ? { mimeType } : {}) })
      setError(null)
      return
    }
    if (!projectPath) {
      setError('Open a project to preview this file.')
      setResolved(null)
      return
    }
    let cancelled = false
    setResolved(null)
    setError(null)
    void api
      .resolveToolMediaFile(projectPath, output.src)
      .then((result) => {
        if (cancelled) return
        if ('error' in result) {
          setError(result.error)
          setResolved(null)
        } else {
          setResolved({ src: result.dataUrl, mimeType: result.mimeType })
        }
      })
      .catch((failure) => {
        if (cancelled) return
        setError(failure instanceof Error ? failure.message : String(failure))
        setResolved(null)
      })
    return () => {
      cancelled = true
    }
  }, [output.needsResolution, output.src, mimeType, projectPath])

  if (error) return { state: 'error', resolved: null, error }
  if (!resolved) return { state: 'loading', resolved: null, error: null }
  return { state: 'ready', resolved, error: null }
}

/** Decode a `data:text/html[;base64],…` URL back into markup. */
function htmlFromDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return ''
  const meta = dataUrl.slice(0, comma)
  const payload = dataUrl.slice(comma + 1)
  if (!/;base64/i.test(meta)) return decodeURIComponent(payload)
  // Decode through TextDecoder rather than atob alone: atob yields latin-1, so a
  // page containing any non-ASCII character would render as mojibake.
  const binary = atob(payload)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

/**
 * Read an .html file the agent wrote, through the same IPC other media uses
 * (`tool-media:resolve` already permits .html). Inline markup skips the fetch.
 */
function useResolvedHtml(output: ToolHtmlOutput): {
  state: 'loading' | 'ready' | 'error'
  html: string
  error: string | null
} {
  const projectPath = useActiveProjectPath()
  const inline = output.needsResolution ? undefined : output.html
  const src = output.needsResolution ? output.src : undefined
  const [html, setHtml] = useState<string>(inline ?? '')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(Boolean(src))

  useEffect(() => {
    if (!src) {
      setHtml(inline ?? '')
      setError(null)
      setLoading(false)
      return
    }
    if (!projectPath) {
      setError('Open a project to preview this file.')
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void api
      .resolveToolMediaFile(projectPath, src)
      .then((result) => {
        if (cancelled) return
        if ('error' in result) {
          setError(result.error)
          setHtml('')
        } else {
          setHtml(htmlFromDataUrl(result.dataUrl))
        }
      })
      .catch((failure) => {
        if (cancelled) return
        setError(failure instanceof Error ? failure.message : String(failure))
        setHtml('')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [src, inline, projectPath])

  if (error) return { state: 'error', html: '', error }
  if (loading) return { state: 'loading', html: '', error: null }
  return { state: 'ready', html, error: null }
}

function HtmlPreview({ output }: { output: ToolHtmlOutput }) {
  const { state, html, error } = useResolvedHtml(output)
  const sanitized = useMemo(() => sanitizeToolHtml(html), [html])

  if (state === 'error') return <MediaError message={error ?? 'Unable to load HTML.'} />
  if (state === 'loading') return <MediaSkeleton />
  if (!sanitized.trim()) {
    return (
      <div className="px-3 py-2 text-[11px] text-[color:var(--color-code-card-muted-text)]">
        Nothing to preview.
      </div>
    )
  }
  return (
    // HTML is run through sanitizeToolHtml first: scripts, inline handlers,
    // and dangerous URIs are stripped before reaching the DOM.
    <div
      className="tool-html-preview max-h-[360px] overflow-auto bg-white text-[12px] text-black"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized above
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  )
}

function MediaPreviewBody({ output }: { output: Exclude<ToolMediaOutput, { kind: 'html' }> }) {
  const { state, resolved, error } = useResolvedMediaSrc(output)

  if (state === 'error') {
    return <MediaError message={error ?? 'Unable to load media.'} />
  }
  if (state === 'loading' || !resolved) {
    return <MediaSkeleton />
  }

  if (output.kind === 'image') {
    return (
      <img
        src={resolved.src}
        alt={output.alt ?? 'Tool output image'}
        className="max-h-[var(--tool-media-max-h)] object-contain"
        style={{ ['--tool-media-max-h' as string]: `${MAX_MEDIA_HEIGHT_PX}px` }}
        loading="lazy"
      />
    )
  }
  if (output.kind === 'video') {
    return (
      // Captions are not available for arbitrary tool-generated video.
      // biome-ignore lint/a11y/useMediaCaption: tool output has no captions
      <video
        src={resolved.src}
        controls
        className="max-h-[var(--tool-media-max-h)] w-full object-contain"
        style={{ ['--tool-media-max-h' as string]: `${MAX_MEDIA_HEIGHT_PX}px` }}
      />
    )
  }
  // audio
  return (
    <div className="w-full px-3 py-2">
      {/* Captions are not available for arbitrary tool-generated audio. */}
      {/* biome-ignore lint/a11y/useMediaCaption: tool output has no captions */}
      <audio src={resolved.src} controls className="w-full" />
    </div>
  )
}

export function ToolMediaPreview({ output }: { readonly output: ToolMediaOutput }) {
  return (
    <div className={cn(MEDIA_FRAME_CLASS, output.kind === 'html' ? 'block' : 'flex')}>
      {output.kind === 'html' ? (
        <HtmlPreview output={output} />
      ) : (
        <MediaPreviewBody output={output} />
      )}
    </div>
  )
}
