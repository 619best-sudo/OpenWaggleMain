import type { SkillDiscoveryItem } from '@shared/types/standards'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { safeMarkdownComponents } from '@/shared/lib/markdown-link-components'
import { safeMarkdownRehypePlugins, safeMarkdownUrlTransform } from '@/shared/lib/markdown-safety'
import { Spinner } from '@/shared/ui/Spinner'

interface SkillPreviewPaneProps {
  readonly error: string | null
  readonly selectedSkill: SkillDiscoveryItem | null
  readonly isPreviewLoading: boolean
  readonly previewMarkdown: string
}

export function SkillPreviewPane({
  error,
  selectedSkill,
  isPreviewLoading,
  previewMarkdown,
}: SkillPreviewPaneProps) {
  return (
    <div className="diff-scroll min-h-0 overflow-y-auto px-5 py-4">
      {error && (
        <div className="mb-3 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-[12px] text-error">
          {error}
        </div>
      )}
      <SkillPreviewContent
        selectedSkill={selectedSkill}
        isPreviewLoading={isPreviewLoading}
        previewMarkdown={previewMarkdown}
      />
    </div>
  )
}

function SkillPreviewContent({
  selectedSkill,
  isPreviewLoading,
  previewMarkdown,
}: Omit<SkillPreviewPaneProps, 'error'>) {
  if (!selectedSkill) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center opacity-40">
        <p className="text-[13px] font-medium text-text-secondary">No skill selected</p>
        <p className="mt-1 text-[11px] text-text-tertiary">
          Select a skill from the list to view its instructions.
        </p>
      </div>
    )
  }

  if (selectedSkill.loadStatus === 'error') {
    return (
      <div className="rounded-xl border border-error/10 bg-error/[0.02] p-5">
        <h4 className="text-[13px] font-semibold text-error/90">Invalid Skill</h4>
        <p className="mt-1.5 text-[12px] leading-relaxed text-error/70">
          {selectedSkill.loadError ?? 'This skill file could not be parsed.'}
        </p>
      </div>
    )
  }

  if (isPreviewLoading) {
    return (
      <div className="flex items-center gap-3 py-4 text-[13px] text-text-tertiary/60">
        <Spinner />
        <span>Loading preview…</span>
      </div>
    )
  }

  return <SkillPreviewMarkdown previewMarkdown={previewMarkdown} />
}

function SkillPreviewMarkdown({ previewMarkdown }: { readonly previewMarkdown: string }) {
  return (
    <article className="prose max-w-none text-[13px]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={safeMarkdownRehypePlugins}
        urlTransform={safeMarkdownUrlTransform}
        components={safeMarkdownComponents}
      >
        {previewMarkdown}
      </ReactMarkdown>
    </article>
  )
}
