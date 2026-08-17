import type { JsonObject } from '@shared/types/json'
import { describe, expect, it } from 'vitest'
import { resolveActionText, summarizeToolTarget } from '../tool-display'

function actionText(name: string, args: JsonObject, isRunning: boolean) {
  return resolveActionText({
    name,
    args,
    awaitingResult: false,
    isError: false,
    isRunning,
  })
}

describe('resolveActionText', () => {
  const writeArgs = { path: 'test.txt' }
  const bashArgs = { command: 'pnpm test' }

  it('returns pending text when awaitingResult', () => {
    expect(
      resolveActionText({
        name: 'write',
        args: writeArgs,
        awaitingResult: true,
        isError: false,
        isRunning: false,
      }),
    ).toBe('Requested write test.txt')
  })

  it('returns error text when isError', () => {
    expect(
      resolveActionText({
        name: 'bash',
        args: bashArgs,
        awaitingResult: false,
        isError: true,
        isRunning: false,
      }),
    ).toBe('Failed bash `pnpm test`')
  })

  it('returns running text when isRunning', () => {
    expect(actionText('write', writeArgs, true)).toBe('Writing test.txt...')
  })

  it('returns completed text when nothing is active', () => {
    expect(actionText('write', writeArgs, false)).toBe('Wrote test.txt')
  })

  it('includes read line ranges when offset and limit are present', () => {
    expect(actionText('read', { path: 'src/main/index.ts', offset: 10, limit: 5 }, false)).toBe(
      'Read src/main/index.ts:10-14',
    )
  })

  it('wraps commands in backticks for bash', () => {
    expect(actionText('bash', bashArgs, false)).toBe('Ran `pnpm test`')
    expect(actionText('bash', bashArgs, true)).toBe('Running `pnpm test`')
  })

  it('returns verb text when no primary arg is available', () => {
    expect(actionText('read', {}, true)).toBe('Reading...')
    expect(actionText('read', {}, false)).toBe('Read')
    expect(actionText('customTool', {}, true)).toBe('customTool...')
    expect(actionText('customTool', {}, false)).toBe('customTool')
  })

  it('formats Pi filesystem tool targets', () => {
    expect(actionText('grep', { pattern: 'TODO', path: 'src', glob: '*.ts' }, false)).toBe(
      'Searched /TODO/ in src (*.ts)',
    )
    expect(actionText('find', { pattern: '*.tsx', path: 'src' }, false)).toBe('Found *.tsx in src')
    expect(actionText('ls', { path: 'src' }, false)).toBe('Listed src')
  })
})

describe('summarizeToolTarget', () => {
  it('returns the relativizable path for read/write/edit (caller relativizes)', () => {
    expect(summarizeToolTarget('read', { path: 'src/app.ts' })).toBe('src/app.ts')
    expect(summarizeToolTarget('write', { path: 'a/b.ts' })).toBe('a/b.ts')
  })

  it('includes the read line range suffix', () => {
    expect(summarizeToolTarget('read', { path: 'src/app.ts', offset: 10, limit: 5 })).toBe(
      'src/app.ts:10-14',
    )
  })

  it('formats grep/find targets', () => {
    expect(summarizeToolTarget('grep', { pattern: 'TODO', path: 'src' })).toBe('/TODO/ in src')
    expect(summarizeToolTarget('find', { pattern: '*.tsx' })).toBe('*.tsx in .')
  })

  it('wraps bash commands in backticks', () => {
    expect(summarizeToolTarget('bash', { command: 'git status' })).toBe('`git status`')
  })

  it('formats project_memory targets with action + operand', () => {
    // A bare call has no operand to append, so it reads as what the call does
    // rather than 'Get memory', which only restated the badge beside it.
    expect(summarizeToolTarget('project_memory', { action: 'get' })).toBe(
      'Read what we know about this project',
    )
    expect(summarizeToolTarget('project_memory', { action: 'recall', text: 'html' })).toBe(
      'Recall "html"',
    )
    expect(
      summarizeToolTarget('project_memory', { action: 'remember', text: 'use Tailwind' }),
    ).toBe('Remember: use Tailwind')
    expect(
      summarizeToolTarget('project_memory', { action: 'set_category', category: 'frontend' }),
    ).toBe('Set category: frontend')
    // Inferred action when omitted (mirrors the tool's own inference).
    expect(summarizeToolTarget('project_memory', { text: 'html' })).toBe('Recall "html"')
    expect(summarizeToolTarget('project_memory', { category: 'backend' })).toBe(
      'Set category: backend',
    )
    // No operand at all → just the verb.
    // No action and no operand: the tool infers `get`, so say what that does
    // instead of the bare word 'Memory'.
    expect(summarizeToolTarget('project_memory', {})).toBe('Read what we know about this project')
  })

  it('formats ask_user_question targets with the question', () => {
    expect(
      summarizeToolTarget('ask_user_question', { question: 'Which framework should we use?' }),
    ).toBe('Which framework should we use?')
    // Long questions are truncated.
    const long = 'A'.repeat(120)
    const result = summarizeToolTarget('ask_user_question', { question: long })
    expect(result.length).toBeLessThan(long.length)
    expect(result.endsWith('…')).toBe(true)
    // No question → empty (caller falls back to the tool name).
    expect(summarizeToolTarget('ask_user_question', {})).toBe('')
  })

  it('surfaces query/url/name for MCP-style tools', () => {
    expect(summarizeToolTarget('mcp__web__fetch', { url: 'https://x.example' })).toBe(
      'https://x.example',
    )
    expect(summarizeToolTarget('mcp__db__search', { query: 'users' })).toBe('users')
  })

  it('returns empty string when no informative arg is present', () => {
    expect(summarizeToolTarget('customTool', {})).toBe('')
  })
})

describe('harness tool labels', () => {
  it('labels an action-dispatch call by what the verb does, not the raw enum token', () => {
    // Before: these rendered as "stats" / "search" / "get" — the identifier.
    expect(summarizeToolTarget('graph_memory', { action: 'stats' })).toBe('Summarize the code graph')
    expect(summarizeToolTarget('file_memory', { action: 'search', query: 'router' })).toBe(
      'Find the files that matter here',
    )
    expect(summarizeToolTarget('media_analysis', { lens: 'qa' })).toBe(
      'Check this against what was asked',
    )
  })

  it('labels a call that omitted its action, which is the common one', () => {
    expect(summarizeToolTarget('file_memory', { query: 'router' })).toBe(
      'Find the files that matter here',
    )
  })

  it('labels a single-purpose tool by what it does', () => {
    expect(summarizeToolTarget('deliver', {})).toBe('Finish and hand off the result')
  })

  it('leaves Pi-native tools alone', () => {
    expect(summarizeToolTarget('read', {})).toBe('')
    expect(summarizeToolTarget('read', { path: 'src/a.ts' })).toBe('src/a.ts')
  })
})
