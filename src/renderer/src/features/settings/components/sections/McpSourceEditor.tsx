import type { McpConfigSourceId, McpConfigSourceSummary } from '@shared/types/mcp'
import { Button } from '@/shared/ui/Button'
import { Select } from '@/shared/ui/Select'
import { Textarea } from '@/shared/ui/Textarea'

const RAW_EDITOR_ROWS = 16

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
  return (
    <div className="flex flex-col h-full">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="max-w-[500px] text-[13px] leading-5 text-text-tertiary mb-6">
            Advanced config is preserved as JSON so every `pi-mcp-adapter` server and settings field
            remains available.
          </p>

          {sources.length > 0 && onSelectSource && (
            <label className="flex items-center gap-2 mb-4">
              <span className="text-[12px] font-medium text-text-secondary">Source:</span>
              <Select
                value={selectedSource?.id ?? ''}
                disabled={busy}
                onChange={(e) => onSelectSource(e.target.value as McpConfigSourceId)}
                className="w-full max-w-[300px] text-[12px] py-1.5 pl-3 pr-8 h-8 rounded-lg border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
              >
                <option value="" disabled>
                  Select source to edit...
                </option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </label>
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

      <div className="flex-1 rounded-xl border border-white/6 bg-black/20 p-4">
        <Textarea
          value={rawJson}
          rows={RAW_EDITOR_ROWS}
          spellCheck={false}
          variant="mono"
          resize="vertical"
          wrap="off"
          highlightLanguage="json"
          onChange={(event) => {
            if (!selectedSource) return
            onRawJsonChange(selectedSource.id, event.target.value)
          }}
          className="bg-transparent border-transparent focus:border-transparent p-0 text-[13px] w-full h-full min-h-[300px]"
        />
      </div>

      <div className="mt-8 flex items-center justify-end gap-4 pt-4 border-t border-white/6">
        <Button
          variant="accent"
          disabled={!selectedSource || busy}
          onClick={onSave}
          className="px-6 bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20 font-medium"
        >
          Save JSON
        </Button>
      </div>
    </div>
  )
}
