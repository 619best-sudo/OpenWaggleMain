import * as Effect from 'effect/Effect'
import { app, BrowserWindow, clipboard, shell } from 'electron'
import { createLogger } from '../logger'
import { assertSecureWebPreferences, SECURE_WEB_PREFERENCES } from '../security/electron-security'
import { typedHandle, typedOn } from './typed-ipc'

const logger = createLogger('ipc:shell')

const ALLOWED_URL_PROTOCOLS = new Set(['https:', 'http:'])
const BILLING_OVERLAY_PARTITION = 'persist:openwaggle-billing-overlay'
const BILLING_OVERLAY_MIN_WIDTH = 820
const BILLING_OVERLAY_MIN_HEIGHT = 640
const BILLING_OVERLAY_WIDTH = 960
const BILLING_OVERLAY_HEIGHT = 760
type BillingOverlayResult = { finalUrl: string | null; matchedReturnUrl: boolean }

function assertAllowedUrl(url: string) {
  const parsed = new URL(url)
  if (!ALLOWED_URL_PROTOCOLS.has(parsed.protocol)) {
    logger.warn('blocked url with disallowed protocol', {
      protocol: parsed.protocol,
    })
    throw new Error(`Disallowed URL protocol: ${parsed.protocol}`)
  }
  return parsed
}

function isBillingReturnUrl(url: string) {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (parsed.protocol === 'openwaggle:') {
    return parsed.pathname.startsWith('/settings/profile')
  }

  const isLocalReturnHost =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '0.0.0.0'
  return isLocalReturnHost && parsed.pathname.startsWith('/settings/profile')
}

function createBillingOverlayWindow() {
  const parentWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
  const parentBounds = parentWindow?.getBounds() ?? null
  const webPreferences = {
    ...SECURE_WEB_PREFERENCES,
    partition: BILLING_OVERLAY_PARTITION,
  }
  assertSecureWebPreferences(webPreferences)

  const overlayWindow = new BrowserWindow({
    parent: parentWindow ?? undefined,
    modal: parentWindow !== null,
    show: false,
    title: 'OpenWaggle Billing',
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#141619',
    width: Math.min(BILLING_OVERLAY_WIDTH, parentBounds?.width ?? BILLING_OVERLAY_WIDTH),
    height: Math.min(BILLING_OVERLAY_HEIGHT, parentBounds?.height ?? BILLING_OVERLAY_HEIGHT),
    minWidth: BILLING_OVERLAY_MIN_WIDTH,
    minHeight: BILLING_OVERLAY_MIN_HEIGHT,
    webPreferences,
  })

  if (parentBounds) {
    overlayWindow.setPosition(
      parentBounds.x + Math.max(0, Math.floor((parentBounds.width - BILLING_OVERLAY_WIDTH) / 2)),
      parentBounds.y + Math.max(0, Math.floor((parentBounds.height - BILLING_OVERLAY_HEIGHT) / 2)),
    )
  }

  overlayWindow.once('ready-to-show', () => {
    overlayWindow.show()
    overlayWindow.focus()
  })

  return overlayWindow
}

function closeBillingOverlayWindow(overlayWindow: BrowserWindow) {
  if (!overlayWindow.isDestroyed()) {
    overlayWindow.close()
  }
}

function reportBlockedBillingOverlayUrl(kind: string, url: string, error: unknown) {
  logger.warn(`blocked billing overlay ${kind} with disallowed protocol`, {
    url,
    error: error instanceof Error ? error.message : String(error),
  })
}

function tryLoadBillingOverlayUrl(overlayWindow: BrowserWindow, url: string, kind: string) {
  try {
    assertAllowedUrl(url)
  } catch (error) {
    reportBlockedBillingOverlayUrl(kind, url, error)
    return false
  }

  void overlayWindow.loadURL(url).catch((error: unknown) => {
    logger.error(`failed to load billing overlay ${kind} url`, {
      url,
      error: error instanceof Error ? error.message : String(error),
    })
  })
  return true
}

function attachBillingOverlayNavigationHandlers(
  overlayWindow: BrowserWindow,
  finish: (result: BillingOverlayResult) => void,
) {
  const closeForReturn = (targetUrl: string) => {
    if (!isBillingReturnUrl(targetUrl)) return false
    finish({ finalUrl: targetUrl, matchedReturnUrl: true })
    closeBillingOverlayWindow(overlayWindow)
    return true
  }

  overlayWindow.once('closed', () => {
    finish({ finalUrl: null, matchedReturnUrl: false })
  })

  overlayWindow.webContents.setWindowOpenHandler((details) => {
    if (closeForReturn(details.url)) {
      return { action: 'deny' }
    }

    tryLoadBillingOverlayUrl(overlayWindow, details.url, 'popup')
    return { action: 'deny' }
  })

  overlayWindow.webContents.on('will-redirect', (event, targetUrl) => {
    if (closeForReturn(targetUrl)) {
      event.preventDefault()
    }
  })

  overlayWindow.webContents.on('will-navigate', (event, targetUrl) => {
    try {
      assertAllowedUrl(targetUrl)
    } catch (error) {
      reportBlockedBillingOverlayUrl('navigation', targetUrl, error)
      event.preventDefault()
      return
    }

    if (closeForReturn(targetUrl)) {
      event.preventDefault()
    }
  })

  overlayWindow.webContents.on('did-navigate', (_event, targetUrl) => {
    closeForReturn(targetUrl)
  })
}

async function openBillingOverlay(url: string) {
  const parsed = assertAllowedUrl(url)
  const overlayWindow = createBillingOverlayWindow()

  return new Promise<BillingOverlayResult>((resolve, reject) => {
    let settled = false

    const finish = (result: BillingOverlayResult) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    attachBillingOverlayNavigationHandlers(overlayWindow, finish)

    void overlayWindow.loadURL(parsed.toString()).catch((error: unknown) => {
      closeBillingOverlayWindow(overlayWindow)
      if (settled) return
      settled = true
      reject(error instanceof Error ? error : new Error(String(error)))
    })
  })
}

export function registerShellHandlers(): void {
  typedHandle('app:open-logs-dir', () =>
    Effect.sync(() => {
      shell.openPath(app.getPath('logs'))
    }),
  )

  typedHandle('app:get-logs-path', () => Effect.sync(() => app.getPath('logs')))

  typedOn('clipboard:write-text', (_event, text) => Effect.sync(() => clipboard.writeText(text)))

  // Forward renderer logs into the main-process log file so the full pipeline
  // (renderer message-cache / hydration / chat-rows) is captured alongside the
  // main-process logs in openwaggle-YYYY-MM-DD.log. Diagnostic only.
  typedOn('log:renderer', (_event, entry) =>
    Effect.sync(() => {
      const rendererLogger = createLogger(`renderer:${entry.namespace}`)
      const level = entry.level as 'debug' | 'info' | 'warn' | 'error'
      rendererLogger[level](entry.message, entry.data as object | undefined)
    }),
  )

  typedHandle('shell:open-path', (_event, targetPath) =>
    Effect.gen(function* () {
      const trimmedPath = targetPath.trim()
      if (!trimmedPath) {
        return yield* Effect.fail(new Error('Path is required.'))
      }
      const result = yield* Effect.promise(() => shell.openPath(trimmedPath))
      if (result) {
        return yield* Effect.fail(new Error(result))
      }
    }),
  )

  typedHandle('shell:open-external', (_event, url) =>
    Effect.gen(function* () {
      assertAllowedUrl(url)
      yield* Effect.promise(() => shell.openExternal(url))
    }),
  )

  typedHandle('shell:open-billing-overlay', (_event, url) =>
    Effect.promise(() => openBillingOverlay(url)),
  )
}
