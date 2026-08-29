import type {
  UserQuestionAttachment,
  UserQuestionAttachmentRequest,
} from '@shared/types/user-question'
import { Button } from '@/shared/ui/Button'

function fileName(filePath: string) {
  return filePath.split('/').pop() ?? filePath
}

function isImage(attachment: UserQuestionAttachment) {
  return attachment.mimeType.startsWith('image/')
}

interface ShownAttachmentsProps {
  readonly attachments: readonly UserQuestionAttachment[]
}

/**
 * Files the AGENT attached to its question, read-only.
 *
 * Images render as thumbnails rather than filenames: the whole reason the agent
 * attaches one is that the question is about what it LOOKS like ("is this the
 * misalignment you meant?"), and a path answers nothing. Non-images fall back to
 * a named chip, since there is nothing to show.
 */
export function ShownAttachments({ attachments }: ShownAttachmentsProps) {
  if (attachments.length === 0) return null
  return (
    <div className="mt-3 flex flex-wrap items-start gap-2">
      {attachments.map((attachment) =>
        isImage(attachment) ? (
          <figure key={attachment.path} className="flex max-w-[220px] flex-col gap-1">
            <img
              src={`file://${attachment.path}`}
              alt={attachment.note ?? fileName(attachment.path)}
              className="max-h-[160px] rounded-[10px] object-contain ring-1 ring-border/40"
            />
            {attachment.note ? (
              <figcaption className="text-[11px] leading-[1.45] text-text-secondary">
                {attachment.note}
              </figcaption>
            ) : null}
          </figure>
        ) : (
          <span
            key={attachment.path}
            className="max-w-[220px] truncate rounded bg-bg-hover px-1.5 py-0.5 font-mono text-[10px] text-text-secondary"
            title={attachment.path}
          >
            {fileName(attachment.path)}
          </span>
        ),
      )}
    </div>
  )
}

interface AttachmentFileInputProps {
  readonly request: UserQuestionAttachmentRequest
  readonly inputRef: React.RefObject<HTMLInputElement | null>
  readonly onFilesPicked: (files: FileList | null) => void
}

/**
 * The hidden native picker the Attach button clicks.
 *
 * `accept` is forwarded from the agent's hint, but only as a filter on the
 * dialog — a host that cannot honour it must still take whatever the user picks,
 * because a rejected file is a blocked answer.
 */
export function AttachmentFileInput({
  request,
  inputRef,
  onFilesPicked,
}: AttachmentFileInputProps) {
  return (
    <input
      ref={inputRef}
      type="file"
      multiple={request.multiple === true}
      accept={request.accept?.join(',')}
      className="hidden"
      onChange={(event) => onFilesPicked(event.target.files)}
      data-testid="user-question-file-input"
    />
  )
}

interface AttachmentPickerProps {
  readonly request: UserQuestionAttachmentRequest
  readonly attachments: readonly UserQuestionAttachment[]
  readonly staging: boolean
  readonly disabled: boolean
  readonly projectPath?: string | null
  readonly onOpenPicker: () => void
  readonly onRemove: (filePath: string) => void
}

/**
 * The picker for files the USER attaches back.
 *
 * Shown only when the agent asked for one. The hint is the agent's own words for
 * what it wants, so it is rendered verbatim rather than paraphrased into a
 * generic "attach a file" — "the Figma export of the hero" is the difference
 * between the right file and a screenshot of the wrong screen.
 */
export function AttachmentPicker({
  request,
  attachments,
  staging,
  disabled,
  projectPath,
  onOpenPicker,
  onRemove,
}: AttachmentPickerProps) {
  return (
    <div className="mt-3 flex flex-col gap-1.5 rounded-[12px] border border-border/35 bg-bg-primary/65 p-3">
      <div className="text-[12px] leading-[1.45] text-text-tertiary">
        {request.hint
          ? request.hint
          : request.multiple
            ? 'Attach the files this needs.'
            : 'Attach the file this needs.'}
        {request.mode === 'required' ? ' (required)' : ' (optional)'}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onOpenPicker}
          disabled={disabled || staging || !projectPath}
          title={projectPath ? undefined : 'Open a project to attach files'}
        >
          {staging ? 'Attaching…' : request.multiple ? 'Attach files' : 'Attach file'}
        </Button>
        {attachments.map((attachment) => (
          <span
            key={attachment.path}
            className="flex items-center gap-1 rounded bg-bg-hover px-1.5 py-0.5 text-[10px] text-text-secondary"
          >
            <span className="max-w-[220px] truncate font-mono" title={attachment.path}>
              {fileName(attachment.path)}
            </span>
            <Button
              type="button"
              variant="unstyled"
              aria-label={`Remove ${attachment.path}`}
              className="text-text-tertiary hover:text-text-primary"
              onClick={() => onRemove(attachment.path)}
              disabled={disabled}
            >
              ×
            </Button>
          </span>
        ))}
      </div>
    </div>
  )
}
