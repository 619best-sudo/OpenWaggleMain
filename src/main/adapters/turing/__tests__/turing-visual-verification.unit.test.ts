import { describe, expect, it } from 'vitest'
import {
  auditVisualVerification,
  isRuntimeObservationTool,
  isViewLayerPath,
  isVisualCaptureTool,
} from '../turing-visual-verification'

/**
 * The audit's whole value is its PRECISION. It fires after the run has stopped,
 * so it cannot fix anything — it can only withhold a green check. A false
 * positive therefore costs more than a miss: one run wrongly marked unverified
 * teaches the user to ignore the warning, after which it protects nothing.
 * These tests are weighted accordingly — most of them assert it stays SILENT.
 */
describe('isViewLayerPath', () => {
  it('accepts files that are view-layer wherever they live', () => {
    // No non-visual use for these, so the extension alone is enough.
    for (const path of [
      'src/app.css',
      'web/index.html',
      'src/App.vue',
      'src/Card.svelte',
      'ios/Runner/Base.lproj/Main.storyboard',
      'theme/tokens.scss',
    ]) {
      expect(isViewLayerPath(path), path).toBe(true)
    }
  })

  it('accepts ambiguous code only when the path also says view', () => {
    for (const path of [
      'lib/screens/contacts_screen.dart',
      'lib/widgets/status_badge.dart',
      'src/components/Button.tsx',
      'app/views/profile.kt',
      'src/pages/home.jsx',
      // Filename evidence, with no view directory to lean on.
      'lib/contacts_page.dart',
    ]) {
      expect(isViewLayerPath(path), path).toBe(true)
    }
  })

  it('stays silent on non-view code that merely shares an extension', () => {
    // The false-positive set. A `.dart`/`.tsx` file is as likely to be a model,
    // a repository or a util as a screen — flagging these would mark ordinary
    // backend and logic runs unverified and make the signal noise.
    for (const path of [
      'lib/models/contact.dart',
      'lib/services/api_client.dart',
      'lib/repositories/contact_repository.dart',
      'src/utils/format.ts',
      'src/store/auth-store.ts',
      'server/routes/contacts.ts',
      'test/contact_test.dart',
    ]) {
      expect(isViewLayerPath(path), path).toBe(false)
    }
  })

  it('matches directories by segment, not by substring', () => {
    // `packages/` contains "page" and `views/` does not appear in `reviews/`.
    // Substring matching would call both of these view-layer.
    expect(isViewLayerPath('src/packages/parser.ts')).toBe(false)
    expect(isViewLayerPath('src/reviews/scoring.ts')).toBe(false)
    expect(isViewLayerPath('src/pages/parser.ts')).toBe(true)
  })

  it('ignores non-source artifacts and empty input', () => {
    for (const path of ['README.md', 'pubspec.yaml', 'package.json', '.gitignore', '']) {
      expect(isViewLayerPath(path), path).toBe(false)
    }
  })

  it('handles windows separators and casing', () => {
    expect(isViewLayerPath('src\\Components\\Button.TSX')).toBe(true)
  })
})

describe('isVisualCaptureTool', () => {
  it('accepts capture tools under any MCP namespacing scheme', () => {
    for (const name of [
      'mobile_take_screenshot',
      'browser_take_screenshot',
      'playwright_screenshot',
      'mcp__playwright__browser_take_screenshot',
      'turing-machine:mcp:device/mobile_take_screenshot',
      'activity_inspect',
    ]) {
      expect(isVisualCaptureTool(name), name).toBe(true)
    }
  })

  it('rejects structural inspection, which is not looking at pixels', () => {
    // These answer "is the widget present", never "does it look right".
    // Accepting them would let the exact non-check this audit exists to catch
    // pass as a check.
    for (const name of [
      'mobile_list_elements_on_screen',
      'browser_snapshot',
      'read',
      'bash',
      'grep',
      'activity_collect',
    ]) {
      expect(isVisualCaptureTool(name), name).toBe(false)
    }
  })
})

describe('auditVisualVerification', () => {
  it('flags the real failure: a screen edited, never looked at', () => {
    // Reconstructed from the session that motivated this — view file written,
    // shell used to "verify", a device server connected but never called.
    const audit = auditVisualVerification({
      writtenPaths: ['lib/screens/contacts_screen.dart'],
      toolNames: ['read', 'grep', 'edit', 'bash'],
    })
    expect(audit.unverified).toBe(true)
    expect(audit.requiresVisualCheck).toBe(true)
    expect(audit.capturedVisual).toBe(false)
    expect(audit.reason).toMatch(/never captured the result/)
    expect(audit.reason).toMatch(/contacts_screen\.dart/)
  })

  it('clears a run that captured the screen', () => {
    const audit = auditVisualVerification({
      writtenPaths: ['lib/screens/contacts_screen.dart'],
      toolNames: ['edit', 'mobile_take_screenshot', 'media_analysis'],
    })
    expect(audit.unverified).toBe(false)
    expect(audit.captureTools).toEqual(['mobile_take_screenshot'])
    expect(audit.reason).toBeUndefined()
  })

  it('stays silent on a run that changed no view layer', () => {
    // A backend/logic run must never be asked for a screenshot.
    const audit = auditVisualVerification({
      writtenPaths: ['lib/services/api_client.dart', 'server/routes/contacts.ts'],
      toolNames: ['read', 'edit', 'bash'],
    })
    expect(audit.requiresVisualCheck).toBe(false)
    expect(audit.unverified).toBe(false)
  })

  it('stays silent on a run that wrote nothing at all', () => {
    // A question-answering or exploration turn writes no files; there is
    // nothing to have verified.
    const audit = auditVisualVerification({ writtenPaths: [], toolNames: ['read', 'grep'] })
    expect(audit.unverified).toBe(false)
  })

  it('is unbothered by missing inputs', () => {
    expect(auditVisualVerification({}).unverified).toBe(false)
  })

  it('names at most three files and counts the rest', () => {
    const audit = auditVisualVerification({
      writtenPaths: ['a/views/a.tsx', 'a/views/b.tsx', 'a/views/c.tsx', 'a/views/d.tsx'],
      toolNames: [],
    })
    expect(audit.viewFiles).toHaveLength(4)
    expect(audit.reason).toMatch(/\(\+1 more\)/)
  })
})

// ---------------------------------------------------------------------------
// Replay of the sessions that motivated this gate, reconstructed from the app
// database (written paths, tool names and prompts taken verbatim from the run
// records). This is the part that matters: an earlier, file-extension-only
// version of this audit passed every unit test above and would still have
// stayed silent on all three real runs, because the edits landed in an
// AppDelegate, a util and a plist rather than in anything view-shaped.
// ---------------------------------------------------------------------------
// A device server was connected in every one of these sessions (turing_bridge_status).
const AVAILABLE = [
  'mobile_take_screenshot',
  'mobile_launch_app',
  'mobile_open_url',
  'browser_navigate',
  'browser_take_screenshot',
]

const SESSIONS = [
  {
    id: 'fd8329e4 deep-link',
    userText:
      'Chottu link deep linking not working in iOS, can you check why ? earlier it was working we have not made any change to this side of the code',
    writtenPaths: ['/p/cards_mobile_app/ios/Runner/AppDelegate.swift'],
    toolNames: ['bash', 'read', 'grep', 'edit', 'file_memory', 'project_memory'],
    expect: true,
  },
  {
    id: 'dd22faeb deep-link',
    userText: 'Chottu link deep linking not working in iOS, can you check why ?',
    writtenPaths: ['/p/cards_mobile_app/ios/Runner/Info.plist'],
    toolNames: ['bash', 'read', 'file_memory', 'edit'],
    expect: true,
  },
  {
    id: 'b2d328f1 turn1 polling',
    userText:
      'bug: on polling in the contacts page, the status is not changing as we get the new status. Had to refresh page to update.  can you check',
    writtenPaths: ['/p/cards_mobile_app/lib/features/lead_capture/utils/lead_utils.dart'],
    toolNames: ['read', 'grep', 'bash', 'edit'],
    expect: true,
  },
  {
    id: 'b2d328f1 full (user forced a device server)',
    userText: 'bug: on polling in the contacts page, the status is not changing',
    writtenPaths: ['/p/cards_mobile_app/lib/features/lead_capture/utils/lead_utils.dart'],
    toolNames: [
      'read',
      'grep',
      'bash',
      'edit',
      'mobile_take_screenshot',
      'media_analysis',
      'mobile_launch_app',
    ],
    expect: false,
  },
  {
    id: 'CONTROL fresh feature request',
    userText: 'add a settings screen with a dark mode toggle',
    writtenPaths: ['/p/lib/services/settings_service.dart'],
    toolNames: ['read', 'edit', 'bash'],
    expect: false,
  },
  {
    id: 'CONTROL backend refactor',
    userText: 'this function is not working, refactor the parser',
    writtenPaths: ['/p/server/parser.ts'],
    toolNames: ['read', 'edit', 'bash'],
    expect: true,
  },
  {
    id: 'CONTROL no runtime tooling connected',
    userText: 'the login is not working',
    writtenPaths: ['/p/lib/auth.dart'],
    toolNames: ['read', 'edit'],
    available: [],
    expect: false,
  },
  {
    id: 'CONTROL question, no edits',
    userText: 'why is deep linking not working?',
    writtenPaths: [],
    toolNames: ['read', 'grep'],
    expect: false,
  },
]

describe('replay of the real sessions', () => {
  for (const s of SESSIONS) {
    it(`${s.id} -> ${s.expect ? 'FLAGGED' : 'silent'}`, () => {
      const a = auditVisualVerification({
        writtenPaths: s.writtenPaths,
        toolNames: s.toolNames,
        userText: s.userText,
        availableToolNames: s.available ?? AVAILABLE,
      })
      expect(a.unverified, `${s.id} trigger=${a.trigger}`).toBe(s.expect)
    })
  }
})

describe('build vs test: the line that decides a false positive', () => {
  const base = {
    writtenPaths: ['/p/server/parser.ts'],
    toolNames: ['read', 'edit', 'bash'],
    userText: 'this function is not working, refactor the parser',
    availableToolNames: AVAILABLE,
  }
  it('a test run clears it — the code was actually executed', () => {
    expect(auditVisualVerification({ ...base, executedCommands: ['npm test'] }).unverified).toBe(
      false,
    )
    expect(
      auditVisualVerification({ ...base, executedCommands: ['npx vitest run x'] }).unverified,
    ).toBe(false)
    expect(
      auditVisualVerification({ ...base, executedCommands: ['flutter test'] }).unverified,
    ).toBe(false)
  })
  it('a BUILD does not clear it — compiling is not running', () => {
    for (const cmd of ['flutter build ios', 'npx tsc --noEmit', 'cargo check', 'npm run build']) {
      expect(auditVisualVerification({ ...base, executedCommands: [cmd] }).unverified, cmd).toBe(
        true,
      )
    }
  })
  it('the real deep-link session is still caught after the mitigation', () => {
    // Its actual commands: archaeology and file reads, no execution at all.
    const a = auditVisualVerification({
      writtenPaths: ['/p/ios/Runner/AppDelegate.swift'],
      toolNames: ['bash', 'read', 'edit'],
      userText: 'Chottu link deep linking not working in iOS',
      availableToolNames: AVAILABLE,
      executedCommands: [
        'git log --oneline -20',
        'cat ios/Runner/Info.plist',
        'sed -n 290,330p AppDelegate.swift',
      ],
    })
    expect(a.unverified).toBe(true)
    expect(a.trigger).toBe('runtime-symptom')
  })
})

// ---------------------------------------------------------------------------
// Machine mode is runTuringSession with planMode:true, so it reaches the same
// audit. These are real plan-mode runs from the app database.

describe('machine mode (planMode) runs reach the gate', () => {
  it('flags the solar-system run: wrote index.html, never rendered it', () => {
    const a = auditVisualVerification({
      writtenPaths: ['/Users/shashankv/Projects/Test/index.html'],
      toolNames: ['write', 'read'],
      executedCommands: [],
      userText:
        'create a realistic animation of solar system, use svg of planet to give realistic look. make it all in index.html.',
      availableToolNames: AVAILABLE,
    })
    expect(a.unverified).toBe(true)
    expect(a.trigger).toBe('view-layer') // fresh development, not a bug report
  })

  it('clears the same run once it renders the page', () => {
    const a = auditVisualVerification({
      writtenPaths: ['/Users/shashankv/Projects/Test/index.html'],
      toolNames: ['write', 'read', 'activity_inspect'],
      userText: 'create a realistic animation of solar system',
      availableToolNames: AVAILABLE,
    })
    expect(a.unverified).toBe(false)
  })
})

/**
 * The harness's OWN device and web tools.
 *
 * The marker lists were written against the external device MCP server this
 * backend replaced, whose tools were named one-per-action
 * (`mobile_take_screenshot`). The first-party replacements are single tools that
 * take the action as an argument — `mobile { action: 'look' }`, `drive { action:
 * 'shot' }` — so their names carry none of the words the markers look for, and
 * `'mobile'.includes('mobile_')` is false.
 *
 * The result was not a near miss. Every run that verified on a simulator or in
 * the browser was reported as never having captured anything, which is the false
 * positive the header comment on this file calls the expensive kind. Replayed
 * below from the run that surfaced it: eight `mobile { action: 'look' }` calls
 * against a Flutter screen, still flagged unverified.
 */
describe('first-party device and web tools', () => {
  it('counts look and shot as captures', () => {
    for (const name of ['mobile_look', 'drive_look', 'drive_shot']) {
      expect(isVisualCaptureTool(name), name).toBe(true)
    }
  })

  it('does not count driving or launching as a capture', () => {
    // Same rule as the structural-inspection cases above: acting on the screen
    // is not seeing it.
    for (const name of [
      'mobile_tap',
      'mobile_launch',
      'mobile_devices',
      'drive_click',
      'drive_fill',
    ]) {
      expect(isVisualCaptureTool(name), name).toBe(false)
    }
  })

  it('counts any first-party device or web call as having run the software', () => {
    for (const name of ['mobile', 'drive', 'mobile_launch', 'mobile_tap', 'drive_open']) {
      expect(isRuntimeObservationTool(name), name).toBe(true)
    }
  })

  it('does not read an unrelated tool that merely contains "drive" as browser control', () => {
    // Substring matching would have made a Google Drive MCP tool look like a
    // browser session.
    for (const name of [
      'google_drive_search',
      'mcp__gdrive__google_drive_list',
      'driver_options',
    ]) {
      expect(isRuntimeObservationTool(name), name).toBe(false)
      expect(isVisualCaptureTool(name), name).toBe(false)
    }
  })

  it('clears the replayed run: a Flutter screen edited and screenshotted on a simulator', () => {
    const audit = auditVisualVerification({
      writtenPaths: [
        '/Users/shashankv/Documents/Projects/cards_mobile_app/lib/screens/profile/profile_screen.dart',
      ],
      toolNames: [
        'read',
        'edit',
        'bash',
        'mobile_launch',
        'mobile_look',
        'mobile_tap',
        'mobile_look',
      ],
      executedCommands: ['flutter build ios --simulator'],
      userText: 'change the title of delete account popup',
      availableToolNames: ['mobile', 'drive'],
    })
    expect(audit.capturedVisual).toBe(true)
    expect(audit.unverified).toBe(false)
  })

  it('still flags the same run when it only launched the app and never looked', () => {
    const audit = auditVisualVerification({
      writtenPaths: [
        '/Users/shashankv/Documents/Projects/cards_mobile_app/lib/screens/profile/profile_screen.dart',
      ],
      toolNames: ['read', 'edit', 'bash', 'mobile_launch'],
      executedCommands: ['flutter build ios --simulator'],
      userText: 'change the title of delete account popup',
      availableToolNames: ['mobile', 'drive'],
    })
    expect(audit.unverified).toBe(true)
    expect(audit.trigger).toBe('view-layer')
  })
})
