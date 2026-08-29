import { Check, Copy } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { api } from '@/shared/lib/ipc'
import { isReactElementWithProps } from '@/shared/lib/react-element-guard'
import { Button } from '@/shared/ui/Button'

const DELAY_MS = 2000

interface CodeBlockProps {
  children: ReactNode
  language?: string | undefined
  className?: string | undefined
}

/**
 * Recursively extract text content from React nodes for the copy button.
 */
function getTextContent(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (!node) return ''
  if (Array.isArray(node)) return node.map(getTextContent).join('')
  if (isReactElementWithProps<{ children?: ReactNode }>(node)) {
    return getTextContent(node.props.children)
  }
  return ''
}

export function CodeBlock({ children, language, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    const text = getTextContent(children).replace(/\n$/, '')
    api.copyToClipboard(text)
    setCopied(true)
    setTimeout(() => setCopied(false), DELAY_MS)
  }

  return (
    <div
      className={cn(
        'group relative my-2.5 overflow-hidden rounded-[10px]',
        'border border-code-view-border bg-code-view-bg',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-code-view-border bg-code-view-gutter-bg px-2.5 py-1">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-muted">
          {language ?? 'text'}
        </span>
        <Button
          variant="unstyled"
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-[color:var(--color-code-card-muted-text)] transition-colors hover:text-[color:var(--color-code-card-label-text)]"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      {/* data-code-card opts this <pre> out of the global `.prose pre` styling,
          which would otherwise re-apply its own border, background, padding and
          margin on top of the card this component already draws. */}
      <pre
        data-code-card=""
        className="m-0 overflow-x-auto border-none bg-transparent p-2.5 [&>code]:font-mono [&>code]:text-[12.5px] [&>code]:leading-[1.55]"
      >
        {children}
      </pre>
    </div>
  )
}
