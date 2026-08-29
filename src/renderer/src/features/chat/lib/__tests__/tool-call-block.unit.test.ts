import { describe, expect, it } from 'vitest'
import {
  buildFencedCodeMarkdown,
  buildTailPreview,
  getConcernLinesFromResultCached,
  getResultError,
  getStringArg,
  getToolDiffData,
  getToolResultParts,
  getToolResultText,
  inferLanguageFromPath,
  shouldHighlightCode,
  splitReadReasoningTail,
} from '../tool-call-block'

const LONG_HIGHLIGHT_TEXT = `${'x'.repeat(80_000)}x`
const MANY_LINE_TEXT = Array.from({ length: 1_201 }, () => 'line').join('\n')

describe('tool call block view helpers', () => {
  it('normalizes tool result text from strings, records, and content blocks', () => {
    expect(getToolResultText('plain output')).toBe('plain output')
    expect(getToolResultText({ message: 'message output' })).toBe('message output')
    expect(
      getToolResultText({
        content: [
          { type: 'text', text: 'first' },
          { type: 'image', mimeType: 'image/png' },
          { type: 'text', text: 'second' },
        ],
      }),
    ).toBe('first\nsecond')
  })

  it('extracts explicit and structured error messages', () => {
    expect(getResultError({ state: 'success', content: 'ok', error: 'explicit failure' })).toBe(
      'explicit failure',
    )
    expect(getResultError({ state: 'error', content: 'runtime failure' })).toBe('runtime failure')
    expect(getResultError({ state: 'success', content: { error: 'payload failure' } })).toBe(
      'payload failure',
    )
    expect(getResultError(undefined)).toBeNull()
  })

  it('returns string arguments without coercing other JSON values', () => {
    expect(getStringArg({ path: 'src/app.ts', count: 2 }, 'path')).toBe('src/app.ts')
    expect(getStringArg({ path: 'src/app.ts', count: 2 }, 'count')).toBeNull()
  })

  it('infers syntax highlighting language from known path extensions', () => {
    expect(inferLanguageFromPath('src/app.ts')).toBe('typescript')
    // Canonical shiki ids: `sh`/`bash` are aliases of the `shellscript` grammar.
    expect(inferLanguageFromPath('script.sh')).toBe('shellscript')
    expect(inferLanguageFromPath('README')).toBeUndefined()
    expect(inferLanguageFromPath(null)).toBeUndefined()
    // Languages outside the preloaded dozen resolve and load on demand.
    expect(inferLanguageFromPath('lib/main.dart')).toBe('dart')
    expect(inferLanguageFromPath('android/app/build.gradle')).toBe('groovy')
    expect(inferLanguageFromPath('ios/Runner/AppDelegate.swift')).toBe('swift')
    expect(inferLanguageFromPath('MainActivity.kt')).toBe('kotlin')
  })

  it('avoids highlighting excessively large or long outputs', () => {
    expect(shouldHighlightCode('const value = 1')).toBe(true)
    expect(shouldHighlightCode(LONG_HIGHLIGHT_TEXT)).toBe(false)
    expect(shouldHighlightCode(MANY_LINE_TEXT)).toBe(false)
  })

  it('builds a fenced code block with a fence longer than embedded backticks', () => {
    expect(buildFencedCodeMarkdown('const s = ```', 'typescript')).toBe(
      '````typescript\nconst s = ```\n````',
    )
  })

  it('parses edit diffs from normalized tool result details', () => {
    const diff = getToolDiffData(
      {
        kind: 'json',
        data: {
          details: {
            diff: '@@ -1 +1 @@\n-old\n+new',
          },
        },
      },
      'edit',
    )

    expect(diff?.additions).toBe(1)
    expect(diff?.deletions).toBe(1)
    expect(diff?.lines.map((line) => line.type)).toEqual(['meta', 'remove', 'add'])
  })

  it('derives write line additions from the written content', () => {
    const diff = getToolDiffData(
      { kind: 'json', data: { message: 'File written: notes.txt' } },
      'write',
      { content: 'first line\nsecond line\n' },
    )

    expect(diff?.additions).toBe(2)
    expect(diff?.deletions).toBe(0)
    expect(diff?.lines).toEqual([])
  })

  it('returns the last visible output lines for long command output', () => {
    expect(buildTailPreview('one\ntwo\nthree\nfour\nfive\nsix\nseven')).toBe(
      'two\nthree\nfour\nfive\nsix\nseven',
    )
  })

  describe('getConcernLinesFromResultCached', () => {
    // Same value, but a fresh object each time — what a re-running memo would
    // hand the renderer on every stream event.
    const concernPayload = () => ({ details: { path: 'src/app.ts', lines: [1, 2, 3] } })

    it('returns the same LineConcern reference for the same result object identity', () => {
      const payload = concernPayload()
      expect(getConcernLinesFromResultCached(payload)).toBe(
        getConcernLinesFromResultCached(payload),
      )
    })

    it('returns a fresh reference for a value-equal but distinct result object', () => {
      const first = getConcernLinesFromResultCached(concernPayload())
      const second = getConcernLinesFromResultCached(concernPayload())
      expect(second).toEqual(first)
      expect(second).not.toBe(first)
    })

    it('caches null results too without re-deriving (non-concern payload)', () => {
      const payload = { details: { path: 'src/app.ts' } } // no `lines` → null
      expect(getConcernLinesFromResultCached(payload)).toBeNull()
      expect(getConcernLinesFromResultCached(payload)).toBeNull()
    })
  })
})

describe('getToolResultParts', () => {
  it('splits trailing commentary off the primary payload', () => {
    const parts = getToolResultParts({
      content: [
        { type: 'text', text: '1\tconst a = 1' },
        { type: 'text', text: '  Truncated after 1 line.  ' },
      ],
    })

    expect(parts.body).toBe('1\tconst a = 1')
    expect(parts.notes).toBe('Truncated after 1 line.')
  })

  it('leaves a single-block result whole, with no notes', () => {
    const parts = getToolResultParts({ content: [{ type: 'text', text: 'only this' }] })

    expect(parts.body).toBe('only this')
    expect(parts.notes).toBe('')
  })

  it('falls back to the joined text for non-block payloads', () => {
    expect(getToolResultParts('plain string')).toEqual({ body: 'plain string', notes: '' })
  })

  it('splits the harness single-block read: numbered bytes then reasoning tail', () => {
    // The shape `readTool` actually returns: `${numbered}\n\n${tail}` in ONE
    // text block. The tail (region map / reuse note / NEXT FILE) must never
    // reach the numbered viewer, or it renders as the file's last rows.
    const parts = getToolResultParts({
      content: [
        {
          type: 'text',
          text: '1\tconst a = 1\n2\t\n3\tconst b = 2\n\nREGIONS: 1-3 — demo\nNEXT FILE: ../x.ts',
        },
      ],
    })

    expect(parts.body).toBe('1\tconst a = 1\n2\t\n3\tconst b = 2')
    expect(parts.notes).toBe('REGIONS: 1-3 — demo\nNEXT FILE: ../x.ts')
  })
})

describe('splitReadReasoningTail', () => {
  it('keeps an unnumbered payload whole', () => {
    expect(splitReadReasoningTail('no numbering here')).toEqual({
      body: 'no numbering here',
      reasoning: '',
    })
  })

  it('leaves a pure numbered body untouched, trailing blanks dropped', () => {
    const parts = splitReadReasoningTail('1\ta\n2\t\n')
    expect(parts.body).toBe('1\ta\n2\t')
    expect(parts.reasoning).toBe('')
  })

  it('moves everything after the numbered prefix to reasoning', () => {
    const parts = splitReadReasoningTail('1\ta\n\nnote line\n2\tquoted from tail')
    expect(parts.body).toBe('1\ta')
    expect(parts.reasoning).toBe('note line\n2\tquoted from tail')
  })
})
