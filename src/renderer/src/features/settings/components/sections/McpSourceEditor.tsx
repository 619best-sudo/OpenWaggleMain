import type { McpConfigSourceId, McpConfigSourceSummary } from '@shared/types/mcp'
import { isLightThemeMode } from '@shared/types/settings'
import { usePreferences } from '@/features/settings/hooks'
import {
  WAGGLE_CODE_THEME_DARK,
  WAGGLE_CODE_THEME_LIGHT,
} from '@/shared/lib/shiki/waggle-code-theme'
import { Button } from '@/shared/ui/Button'
import { Select } from '@/shared/ui/Select'
import { Textarea } from '@/shared/ui/Textarea'

const RAW_EDITOR_ROWS = 16

const ADVANCED_SOURCE_LABELS: Partial<
  Record<McpConfigSourceId, { label: string; helper: string }>
> = {
  'global-standard': {
    label: 'All Projects On This Computer',
    helper: 'Primary shared MCP settings used across all projects on this device.',
  },
  'project-turing-machine': {
    label: 'This Project Only',
    helper: 'Recommended. This is usually the best project-specific MCP config to edit.',
  },
}

interface McpSourceEditorProps {
  readonly sources?: readonly McpConfigSourceSummary[]
  readonly selectedSource: McpConfigSourceSummary | null
  readonly rawJson: string
  readonly busy: boolean
  readonly onSelectSource?: (sourceId: McpConfigSourceId) => void
  readonly onSave: () => void
  readonly onRawJsonChange: (sourceId: McpConfigSourceId, rawJson: string) => void
}

export function McpSourceEditor({
  sources = [],
  selectedSource,
  rawJson,
  busy,
  onSelectSource,
  onSave,
  onRawJsonChange,
}: McpSourceEditorProps) {
  const { settings } = usePreferences()
  const selectedSourceDetails = selectedSource ? ADVANCED_SOURCE_LABELS[selectedSource.id] : null

  return (
    <div className="flex flex-col h-full">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="mb-5 max-w-[560px] text-[13px] leading-5 text-text-tertiary">
            Advanced setup lets you edit the raw MCP JSON directly when you need full control.
          </p>

          {sources.length > 0 && onSelectSource && (
            <div className="mb-4 space-y-2">
              <label className="flex items-center gap-2">
                <span className="text-[12px] font-medium text-text-secondary">Edit:</span>
                <Select
                  value={selectedSource?.id ?? ''}
                  disabled={busy}
                  onChange={(e) => onSelectSource(e.target.value as McpConfigSourceId)}
                  className="h-8 w-full max-w-[320px] pr-8 text-[12px]"
                >
                  <option value="" disabled>
                    Choose config to edit...
                  </option>
                  {sources
                    .filter((s) => s.id === 'project-turing-machine' || s.id === 'global-standard')
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {ADVANCED_SOURCE_LABELS[s.id]?.label ?? s.label}
                      </option>
                    ))}
                </Select>
              </label>
              {selectedSourceDetails ? (
                <p className="text-[11px] leading-5 text-text-muted">
                  {selectedSourceDetails.helper}
                </p>
              ) : null}
            </div>
          )}

          {selectedSource?.parseError && (
            <p
              role="alert"
              className="mt-2 rounded-lg border border-error/25 bg-error/6 px-3 py-2 text-[12px] text-error"
            >
              {selectedSource.parseError}
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 rounded-xl border border-border-light bg-bg-secondary/35 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <Textarea
          value={rawJson}
          rows={RAW_EDITOR_ROWS}
          spellCheck={false}
          variant="mono"
          resize="vertical"
          wrap="off"
          highlightLanguage="json"
          highlightTheme={
            isLightThemeMode(settings.themeMode) ? WAGGLE_CODE_THEME_LIGHT : WAGGLE_CODE_THEME_DARK
          }
          onChange={(event) => {
            if (!selectedSource) return
            onRawJsonChange(selectedSource.id, event.target.value)
          }}
          className="h-full min-h-[320px] w-full border-transparent bg-code-card p-3 text-[13px] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] focus:border-accent/20"
        />
      </div>

      <div className="mt-6 flex items-center justify-end gap-4 border-t border-border pt-4">
        <Button
          variant="accent"
          disabled={!selectedSource || busy}
          onClick={onSave}
          className="px-6"
        >
          Save JSON
        </Button>
      </div>
    </div>
  )
}
