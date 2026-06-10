import type { SkillImportChoice, SkillImportResult } from '@shared/types/standards'
import { ChevronLeft, Link, Loader2, X } from 'lucide-react'
import { useState } from 'react'
import { useEscapeHotkey } from '@/shared/hooks/useEscapeHotkey'
import { Button } from '@/shared/ui/Button'
import { TextInput } from '@/shared/ui/TextInput'

interface ImportSkillDialogProps {
  readonly isImporting: boolean
  readonly onImport: (sourceUrl: string) => Promise<SkillImportResult>
  readonly onClose: () => void
}

export function ImportSkillDialog({ isImporting, onImport, onClose }: ImportSkillDialogProps) {
  const [sourceUrl, setSourceUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [choices, setChoices] = useState<readonly SkillImportChoice[]>([])

  useEscapeHotkey(onClose)

  const trimmedUrl = sourceUrl.trim()
  const canSubmit = trimmedUrl.length > 0 && !isImporting

  async function handleImport() {
    if (!trimmedUrl) {
      setError('Enter a skill URL to import.')
      return
    }

    setError(null)
    try {
      const result = await onImport(trimmedUrl)
      if (result.status === 'requires-selection') {
        setChoices(result.choices)
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to import skill.')
    }
  }

  function handleBackToUrlEntry() {
    setChoices([])
    setError(null)
  }

  async function handleChoiceImport(choice: SkillImportChoice) {
    setError(null)
    try {
      await onImport(choice.sourceUrl)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to import skill.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Import skill"
    >
      <div className="w-full max-w-[560px] rounded-xl border border-border-light bg-bg-secondary shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Import Skill</h2>
            <p className="mt-1 text-[12px] text-text-tertiary">
              Paste a URL that resolves to a valid `SKILL.md`.
            </p>
          </div>
          <Button
            variant="unstyled"
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary"
            title="Close"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="space-y-3 p-4">
          {choices.length === 0 ? (
            <div className="space-y-1.5">
              <label htmlFor="skill-url" className="text-[12px] font-medium text-text-secondary">
                Skill Source URL
              </label>
              <TextInput
                id="skill-url"
                placeholder="e.g. https://github.com/owner/repo"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                disabled={isImporting}
                autoFocus
              />
              <p className="text-[11px] leading-relaxed text-text-tertiary">
                Paste a GitHub repository URL or a direct link to a{' '}
                <code className="rounded bg-white/5 px-1 py-0.5">SKILL.md</code> file.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[12px] font-medium text-text-secondary">Choose a skill</p>
                  <p className="mt-1 text-[11px] text-text-tertiary">
                    This repository contains multiple skills. Pick one to import.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleBackToUrlEntry}
                  leftIcon={<ChevronLeft className="size-3.5" />}
                  disabled={isImporting}
                >
                  Back
                </Button>
              </div>
              <div className="space-y-1 rounded-lg border border-white/6 bg-white/[0.02] p-1">
                {choices.map((choice) => (
                  <button
                    key={choice.sourceUrl}
                    type="button"
                    onClick={() => void handleChoiceImport(choice)}
                    disabled={isImporting}
                    className="flex w-full items-start justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-medium text-text-primary">
                        {choice.name}
                      </div>
                      <div className="mt-1 truncate font-mono text-[10px] text-text-tertiary">
                        {choice.path}
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] text-text-secondary">Import</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {error && <p className="text-[13px] text-error">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="secondary" onClick={onClose} disabled={isImporting}>
            Cancel
          </Button>
          {choices.length === 0 ? (
            <Button
              variant={canSubmit ? 'primary' : 'secondary'}
              onClick={() => void handleImport()}
              disabled={!canSubmit}
              leftIcon={
                isImporting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Link className="size-3.5" />
                )
              }
            >
              Import
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
