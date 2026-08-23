/**
 * Post-run audit: did a run that changed the view layer ever LOOK at the result?
 *
 * The failure this exists for, from a real classic run on a Flutter app: the
 * model diagnosed a bug, edited a screen, verified with shell commands, and
 * reported success — with a device server connected and a simulator booted the whole
 * time. It never took a screenshot. The prompt asked it to; nothing checked.
 *
 * Prompt guidance and this audit do different jobs and neither replaces the
 * other. Guidance steers the model WHILE it can still act. This runs after the
 * loop has stopped, so it cannot fix anything — it can only stop the run from
 * REPORTING success it did not establish. An honest "changed the UI, never
 * looked at it" is strictly better than a green check, but it is the weaker
 * half of the fix, which is why the detection below is deliberately
 * conservative: a false "unverified" on a run that touched no UI would teach
 * the user to ignore the signal, and then it protects nothing.
 */

/**
 * Tools that put PIXELS in front of the model. Matched as substrings so an MCP
 * server's namespacing (`mcp__playwright__browser_take_screenshot`,
 * `turing-machine:mcp:device/mobile_take_screenshot`) still resolves, since
 * the prefix scheme varies by host and is not worth enumerating.
 *
 * `activity_inspect` counts because capturing is what it is for. Deliberately
 * ABSENT: `mobile_list_elements_on_screen` and `browser_snapshot`. Those return
 * a structural tree, which answers "is the widget present" but never "does it
 * look right" — accepting them would let the exact non-check this audit exists
 * to catch pass as a check.
 */
const VISUAL_CAPTURE_TOOL_MARKERS = ['screenshot', 'activity_inspect', 'screen_capture'] as const

/**
 * The harness's OWN device and web tools, which no marker above can match.
 *
 * `mobile` and `drive` are single tools that take the action as an ARGUMENT
 * (`mobile { action: 'look' }`), so their name carries none of the words the
 * substring markers look for — and the marker list still assumed the external
 * device MCP server this backend replaced, whose tools were individually named
 * `mobile_take_screenshot`. The consequence was not a near miss: a run that
 * screenshotted a simulator eight times was reported as never having captured
 * anything, on every run, which is how a real one-line edit ended up flagged
 * "unverified" while the actual wrong-file edit went unmentioned.
 *
 * Names here are the tool plus its action, as {@link extractDeviceActionToolNames}
 * emits them. `look` earns capture status on both surfaces because it
 * photographs the screen as well as returning element rects — unlike the
 * structural-only tools the doc comment above excludes, which return a tree and
 * no image.
 */
const FIRST_PARTY_CAPTURE_TOOLS = ['mobile_look', 'drive_look', 'drive_shot'] as const

/**
 * The first-party tool families, by bare name.
 *
 * Matched exactly or as `<tool>_<action>` rather than as a substring, which
 * matters for `drive`: an MCP server's `google_drive_search` CONTAINS "drive"
 * and would otherwise be read as the run having driven a browser.
 */
const FIRST_PARTY_RUNTIME_TOOLS = ['mobile', 'drive'] as const

/** Strip an MCP server's namespace prefix, mirroring the harness's own matching. */
function bareToolName(toolName: string): string {
  return toolName.includes('__') ? toolName.slice(toolName.lastIndexOf('__') + 2) : toolName
}

/**
 * Extensions that are view-layer wherever they appear. A stylesheet or a markup
 * template has no non-visual use, so the extension alone is sufficient evidence.
 */
const VIEW_EXTENSIONS = new Set([
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.styl',
  '.html',
  '.htm',
  '.vue',
  '.svelte',
  '.astro',
  '.storyboard',
  '.xib',
  '.xaml',
])

/**
 * Extensions that are only SOMETIMES view-layer. A `.dart` file is as likely to
 * be a repository or a model as a screen, and the same is true of `.tsx`,
 * `.swift` and `.kt` — so these count only when the PATH also says view (below).
 *
 * Splitting the two sets is what keeps this general without guessing. It needs
 * no notion of "this is a Flutter project" or "this is a React project": the
 * question is only ever whether this particular file renders something.
 */
const AMBIGUOUS_CODE_EXTENSIONS = new Set([
  '.dart',
  '.tsx',
  '.jsx',
  '.ts',
  '.js',
  '.swift',
  '.kt',
  '.java',
  '.mjs',
])

/**
 * Path segments that mark a directory as view-layer. Framework-neutral on
 * purpose — every UI stack in wide use names its view directory from roughly
 * this vocabulary, and matching the vocabulary rather than the framework means
 * a stack nobody here has heard of is handled the same way.
 */
const VIEW_PATH_SEGMENTS = [
  'component',
  'components',
  'view',
  'views',
  'screen',
  'screens',
  'widget',
  'widgets',
  'page',
  'pages',
  'layout',
  'layouts',
  'template',
  'templates',
  'ui',
  'theme',
  'themes',
  'style',
  'styles',
]

/** Filename markers that say "view" when the directory does not. */
const VIEW_FILENAME_MARKERS = ['_screen', '_page', '_widget', '_view', '.component.', '-screen', '-page']

function extensionOf(filePath: string): string {
  const base = filePath.slice(filePath.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  return dot <= 0 ? '' : base.slice(dot).toLowerCase()
}

/**
 * Does this path render something a person looks at?
 *
 * Conservative by construction: an unmistakable view extension qualifies on its
 * own; an ambiguous code extension needs corroborating evidence from the path.
 * Anything else is treated as non-visual, so the audit stays silent rather than
 * guessing — a run this misses keeps today's behaviour, while a run it wrongly
 * flags would make the signal worthless.
 */
export function isViewLayerPath(filePath: string): boolean {
  if (!filePath) return false
  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  const extension = extensionOf(normalized)
  if (VIEW_EXTENSIONS.has(extension)) return true
  if (!AMBIGUOUS_CODE_EXTENSIONS.has(extension)) return false

  const base = normalized.slice(normalized.lastIndexOf('/') + 1)
  if (VIEW_FILENAME_MARKERS.some((marker) => base.includes(marker))) return true

  // Directory evidence. Compared segment-by-segment rather than by substring so
  // `src/pages/home.tsx` matches while `src/packages/parser.ts` does not —
  // substring matching on "page" would call the second one a view.
  const segments = normalized.split('/').slice(0, -1)
  return segments.some((segment) => VIEW_PATH_SEGMENTS.includes(segment))
}

/** Did this tool name put an actual image in front of the model? */
export function isVisualCaptureTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase()
  if (VISUAL_CAPTURE_TOOL_MARKERS.some((marker) => normalized.includes(marker))) return true
  const bare = bareToolName(normalized)
  return FIRST_PARTY_CAPTURE_TOOLS.some((name) => bare === name)
}

/**
 * Tool families that OBSERVE running software, as opposed to reading its source.
 * Broader than {@link VISUAL_CAPTURE_TOOL_MARKERS} on purpose: for the
 * runtime-symptom trigger below, any real interaction with the running app
 * counts as having looked — listing devices, driving the screen, opening a deep
 * link. The question there is "did it run the thing at all", not "did it see
 * pixels", so structural inspection is admissible where it was not above.
 */
const RUNTIME_OBSERVATION_TOOL_MARKERS = [
  ...VISUAL_CAPTURE_TOOL_MARKERS,
  'mobile_',
  'browser_',
  'playwright',
  'simulator',
  'activity_collect',
  'activity_study',
] as const

/**
 * Phrases in which a user is describing SOFTWARE THEY RAN misbehaving, rather
 * than requesting new work. Matched against the user's own words because that
 * is where the distinction actually lives — nothing about the resulting diff
 * distinguishes "add a settings screen" from "settings screen won't open", and
 * the second one cannot be verified without running the app.
 *
 * Deliberately about symptom vocabulary, not about any framework or stack. It
 * is used ONLY to raise the bar on an already-suspicious run (source edited,
 * runtime tooling connected, nothing ever run), never on its own.
 */
const RUNTIME_SYMPTOM_PATTERNS: readonly RegExp[] = [
  /\bnot work(ing|s)?\b/i,
  /\bdoes\s?n[o']?t work\b/i,
  /\bis\s?n[o']?t (chang|updat|show|load|open|render|refresh|respond|display)/i,
  /\bnot (chang|updat|show|load|open|render|refresh|respond|display)ing\b/i,
  /\bstopped? working\b/i,
  /\b(bug|broken|regression)\b/i,
  /\bcrash(es|ing|ed)?\b/i,
  /\bfails? to\b/i,
  /\bwrong (value|status|screen|state|data|order|colou?r)\b/i,
  /\bhad to (refresh|restart|reload)\b/i,
  /\bnothing happens\b/i,
]

/**
 * Shell commands that EXECUTE the code under change, as opposed to compiling it.
 *
 * The distinction is the whole point and it is not a nicety: `flutter build`,
 * `tsc`, `cargo check` prove the code COMPILES, which is exactly the false
 * confidence this audit exists to reject. A test runner actually runs the code
 * and can observe it behaving wrongly. So builds are deliberately absent here
 * and test runners are deliberately present — a logic fix verified by its own
 * test suite is genuinely verified and must not be faulted for skipping a
 * screenshot it never needed.
 */
const TEST_EXECUTION_PATTERNS: readonly RegExp[] = [
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b/i,
  /\b(vitest|jest|mocha|ava|playwright test|cypress)\b/i,
  /\bflutter\s+(test|drive)\b/i,
  /\b(pytest|python\s+-m\s+pytest|unittest)\b/i,
  /\bgo\s+test\b/i,
  /\bcargo\s+test\b/i,
  /\b(rspec|rake\s+test|phpunit|dotnet\s+test|gradle(w)?\s+test|mvn\s+test)\b/i,
  /\bxcodebuild\s+.*\btest\b/i,
]

/** Did this shell command actually execute the code, rather than just build it? */
export function isTestExecutionCommand(command: string): boolean {
  if (!command?.trim()) return false
  return TEST_EXECUTION_PATTERNS.some((pattern) => pattern.test(command))
}

/** Did the user describe a symptom that only running the software can confirm? */
export function describesRuntimeSymptom(userText: string | undefined): boolean {
  if (!userText?.trim()) return false
  return RUNTIME_SYMPTOM_PATTERNS.some((pattern) => pattern.test(userText))
}

/** Did this tool name interact with the software while it was running? */
export function isRuntimeObservationTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase()
  if (RUNTIME_OBSERVATION_TOOL_MARKERS.some((marker) => normalized.includes(marker))) return true
  // The first-party families, whatever action they carried: for this trigger the
  // question is "did it run the thing at all", so `mobile { action: 'launch' }`
  // counts as much as a screenshot.
  const bare = bareToolName(normalized)
  return FIRST_PARTY_RUNTIME_TOOLS.some((name) => bare === name || bare.startsWith(`${name}_`))
}

export interface VisualVerificationAudit {
  /** The run mutated at least one view-layer file. */
  readonly requiresVisualCheck: boolean
  /** At least one capture tool ran at some point in the run. */
  readonly capturedVisual: boolean
  /** Changed the view layer and never looked at it. */
  readonly unverified: boolean
  /** The view-layer files that were written, for the user-facing message. */
  readonly viewFiles: readonly string[]
  /** Capture tools that did run, when any did. */
  readonly captureTools: readonly string[]
  /** Ready-to-surface explanation. Present only when `unverified`. */
  readonly reason?: string
  /** Which rule fired, for logging and for tests that must tell them apart. */
  readonly trigger?: 'view-layer' | 'runtime-symptom'
}

/**
 * Audit one finished run.
 *
 * Note what is NOT checked: whether the capture came after the edit, or whether
 * it was of the thing that changed. Both are knowable and neither is worth the
 * false-positive risk here — a run that captured at all has engaged with the
 * screen, and the ordering is guidance's job. This gate answers exactly one
 * question, the one a real run failed: did it look at all?
 */
export function auditVisualVerification(input: {
  readonly writtenPaths?: readonly string[]
  readonly toolNames?: readonly string[]
  /** The user's own request, for the runtime-symptom trigger. */
  readonly userText?: string
  /**
   * Tools the run COULD have called. The runtime-symptom trigger fires only when
   * runtime tooling was actually connected: faulting a run for not screenshotting
   * on a machine with no simulator and no browser MCP would be demanding the
   * impossible, and a warning the user cannot act on is noise.
   */
  readonly availableToolNames?: readonly string[]
  /**
   * Shell commands the run executed. Without these the audit cannot tell a run
   * that proved its fix with the project's test suite from one that proved
   * nothing, because both show up as the single tool name `bash`.
   */
  readonly executedCommands?: readonly string[]
}): VisualVerificationAudit {
  const viewFiles = (input.writtenPaths ?? []).filter(isViewLayerPath)
  const captureTools = [...new Set((input.toolNames ?? []).filter(isVisualCaptureTool))]
  const requiresVisualCheck = viewFiles.length > 0
  const capturedVisual = captureTools.length > 0
  const base = { requiresVisualCheck, capturedVisual, viewFiles, captureTools }

  // Trigger 1 — VIEW LAYER. Precise, and aimed at fresh UI development: the run
  // wrote something whose only job is to be looked at, and never looked.
  if (requiresVisualCheck && !capturedVisual) {
    const shown = viewFiles.slice(0, 3).join(', ')
    const more = viewFiles.length > 3 ? ` (+${viewFiles.length - 3} more)` : ''
    return {
      ...base,
      unverified: true,
      trigger: 'view-layer',
      reason:
        `This run changed the view layer (${shown}${more}) but never captured the result — ` +
        `no screenshot or \`activity_inspect\` call was made. A build, a test run, or reading the ` +
        `source shows the code runs, not that the screen is right, so the visual change is unverified.`,
    }
  }

  // Trigger 2 — RUNTIME SYMPTOM. This is the one that catches bug fixes, and it
  // exists because trigger 1 provably does not: on real sessions the edits
  // landed in an AppDelegate, a util and a plist — none of them view-layer by
  // any honest reading — while the reported symptom was purely observable
  // behaviour. Keying on the file could not have caught those runs; keying on
  // what the user described, and on the run never having run anything, does.
  //
  // Four conditions must hold together, so this stays narrow: the user
  // described a runtime symptom, the run actually changed code, runtime tooling
  // was connected, and the run never touched it.
  const observedRuntime =
    (input.toolNames ?? []).some(isRuntimeObservationTool) ||
    (input.executedCommands ?? []).some(isTestExecutionCommand)
  const runtimeToolingAvailable = (input.availableToolNames ?? []).some(isRuntimeObservationTool)
  const changedCode = (input.writtenPaths ?? []).length > 0
  if (
    describesRuntimeSymptom(input.userText) &&
    changedCode &&
    runtimeToolingAvailable &&
    !observedRuntime
  ) {
    return {
      ...base,
      unverified: true,
      trigger: 'runtime-symptom',
      reason:
        `You reported something that was misbehaving at runtime, and this run changed code to fix it ` +
        `— but it never ran the app. No device, browser or capture tool was called, though they were ` +
        `connected. Reading the source and building it cannot show the reported symptom is gone, so ` +
        `this fix is unconfirmed.`,
    }
  }

  return { ...base, unverified: false }
}
