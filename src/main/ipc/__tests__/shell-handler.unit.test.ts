import * as Effect from 'effect/Effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  handlers,
  mockAppGetPath,
  mockBrowserWindowClose,
  mockBrowserWindowFocus,
  mockBrowserWindowIsDestroyed,
  mockBrowserWindowLoadURL,
  mockBrowserWindowOn,
  mockBrowserWindowOnce,
  mockBrowserWindowSetPosition,
  mockBrowserWindowSetWindowOpenHandler,
  mockBrowserWindowShow,
  mockGetAllWindows,
  mockGetFocusedWindow,
  mockShellOpenExternal,
  mockShellOpenPath,
} = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  mockAppGetPath: vi.fn((_name: string) => '/tmp/logs'),
  mockBrowserWindowClose: vi.fn(),
  mockBrowserWindowFocus: vi.fn(),
  mockBrowserWindowIsDestroyed: vi.fn(() => false),
  mockBrowserWindowLoadURL: vi.fn(async (_url: string) => {}),
  mockBrowserWindowOn: vi.fn(),
  mockBrowserWindowOnce: vi.fn(),
  mockBrowserWindowSetPosition: vi.fn(),
  mockBrowserWindowSetWindowOpenHandler: vi.fn(),
  mockBrowserWindowShow: vi.fn(),
  mockGetAllWindows: vi.fn(() => []),
  mockGetFocusedWindow: vi.fn(() => null),
  mockShellOpenExternal: vi.fn(async (_url: string) => {}),
  mockShellOpenPath: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: class {
    static getFocusedWindow = mockGetFocusedWindow
    static getAllWindows = mockGetAllWindows

    webContents = {
      setWindowOpenHandler: mockBrowserWindowSetWindowOpenHandler,
      on: mockBrowserWindowOn,
    }

    loadURL = mockBrowserWindowLoadURL
    show = mockBrowserWindowShow
    focus = mockBrowserWindowFocus
    close = mockBrowserWindowClose
    setPosition = mockBrowserWindowSetPosition
    once = mockBrowserWindowOnce
    isDestroyed = mockBrowserWindowIsDestroyed
  },
  shell: {
    openPath: (p: string) => mockShellOpenPath(p),
    openExternal: (url: string) => mockShellOpenExternal(url),
  },
  app: { getPath: (name: string) => mockAppGetPath(name) },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    },
    on: vi.fn(),
  },
}))

vi.mock('../../runtime', () => ({
  runAppEffect: (effect: Effect.Effect<unknown, unknown, never>) => Effect.runPromise(effect),
  runAppEffectExit: (effect: Effect.Effect<unknown, unknown, never>) =>
    Effect.runPromiseExit(effect),
}))

vi.mock('../../logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('../../security/electron-security', () => ({
  SECURE_WEB_PREFERENCES: {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
  },
  assertSecureWebPreferences: vi.fn(),
}))

import { registerShellHandlers } from '../shell-handler'

describe('shell-handler', () => {
  beforeEach(() => {
    handlers.clear()
    mockShellOpenPath.mockReset()
    mockShellOpenExternal.mockReset()
    mockAppGetPath.mockReset()
    mockBrowserWindowLoadURL.mockReset()
    mockBrowserWindowShow.mockReset()
    mockBrowserWindowFocus.mockReset()
    mockBrowserWindowClose.mockReset()
    mockBrowserWindowSetPosition.mockReset()
    mockBrowserWindowSetWindowOpenHandler.mockReset()
    mockBrowserWindowOn.mockReset()
    mockBrowserWindowOnce.mockReset()
    mockBrowserWindowIsDestroyed.mockReset()
    mockGetFocusedWindow.mockReset()
    mockGetAllWindows.mockReset()
    mockShellOpenPath.mockResolvedValue('')
    mockAppGetPath.mockReturnValue('/tmp/logs')
    mockBrowserWindowLoadURL.mockResolvedValue(undefined)
    mockBrowserWindowIsDestroyed.mockReturnValue(false)
    mockGetFocusedWindow.mockReturnValue(null)
    mockGetAllWindows.mockReturnValue([])
    mockBrowserWindowOnce.mockImplementation((event, callback) => {
      if (event === 'ready-to-show' || event === 'closed') {
        callback()
      }
      return undefined
    })
  })

  it('registers exactly five handlers', () => {
    registerShellHandlers()

    expect(handlers.size).toBe(5)
    expect(handlers.has('app:open-logs-dir')).toBe(true)
    expect(handlers.has('app:get-logs-path')).toBe(true)
    expect(handlers.has('shell:open-path')).toBe(true)
    expect(handlers.has('shell:open-external')).toBe(true)
    expect(handlers.has('shell:open-billing-overlay')).toBe(true)
  })

  describe('app:open-logs-dir', () => {
    it('calls shell.openPath with the logs directory', async () => {
      registerShellHandlers()

      const handler = handlers.get('app:open-logs-dir')
      expect(handler).toBeDefined()
      await handler?.({})
      expect(mockShellOpenPath).toHaveBeenCalledWith('/tmp/logs')
      expect(mockAppGetPath).toHaveBeenCalledWith('logs')
    })

    it('uses the path returned by app.getPath', async () => {
      mockAppGetPath.mockReturnValue('/custom/log/dir')
      registerShellHandlers()

      const handler = handlers.get('app:open-logs-dir')
      await handler?.({})
      expect(mockShellOpenPath).toHaveBeenCalledWith('/custom/log/dir')
    })
  })

  describe('app:get-logs-path', () => {
    it('returns app.getPath("logs")', async () => {
      registerShellHandlers()

      const handler = handlers.get('app:get-logs-path')
      expect(handler).toBeDefined()
      const result = await handler?.()
      expect(mockAppGetPath).toHaveBeenCalledWith('logs')
      expect(result).toBe('/tmp/logs')
    })

    it('reflects the current logs path dynamically', async () => {
      mockAppGetPath.mockReturnValue('/another/path')
      registerShellHandlers()

      const handler = handlers.get('app:get-logs-path')
      const result = await handler?.()
      expect(result).toBe('/another/path')
    })
  })

  describe('shell:open-external', () => {
    it('opens https URLs via shell.openExternal', async () => {
      registerShellHandlers()
      const handler = handlers.get('shell:open-external')
      expect(handler).toBeDefined()

      await handler?.({}, 'https://github.com')
      expect(mockShellOpenExternal).toHaveBeenCalledWith('https://github.com')
    })

    it('opens http URLs via shell.openExternal', async () => {
      registerShellHandlers()
      const handler = handlers.get('shell:open-external')

      await handler?.({}, 'http://localhost:3000')
      expect(mockShellOpenExternal).toHaveBeenCalledWith('http://localhost:3000')
    })

    it('rejects disallowed URL protocols', async () => {
      registerShellHandlers()
      const handler = handlers.get('shell:open-external')

      await expect(handler?.({}, 'file:///etc/passwd')).rejects.toThrow(
        'Disallowed URL protocol: file:',
      )
      expect(mockShellOpenExternal).not.toHaveBeenCalled()
    })
  })

  describe('shell:open-billing-overlay', () => {
    it('opens checkout inside a dedicated modal browser window', async () => {
      registerShellHandlers()
      const handler = handlers.get('shell:open-billing-overlay')
      expect(handler).toBeDefined()

      await handler?.({}, 'https://checkout.dodopayments.com/session/cks_test')

      expect(mockBrowserWindowLoadURL).toHaveBeenCalledWith(
        'https://checkout.dodopayments.com/session/cks_test',
      )
      expect(mockShellOpenExternal).not.toHaveBeenCalled()
      expect(mockBrowserWindowSetWindowOpenHandler).toHaveBeenCalledTimes(1)
    })

    it('rejects disallowed billing overlay URLs', async () => {
      registerShellHandlers()
      const handler = handlers.get('shell:open-billing-overlay')

      await expect(handler?.({}, 'file:///tmp/checkout')).rejects.toThrow(
        'Disallowed URL protocol: file:',
      )
      expect(mockBrowserWindowLoadURL).not.toHaveBeenCalled()
    })
  })

  describe('shell:open-path', () => {
    it('opens local paths through shell.openPath', async () => {
      registerShellHandlers()
      const handler = handlers.get('shell:open-path')
      expect(handler).toBeDefined()

      await handler?.({}, '/tmp/project')
      expect(mockShellOpenPath).toHaveBeenCalledWith('/tmp/project')
    })

    it('rejects empty paths', async () => {
      registerShellHandlers()
      const handler = handlers.get('shell:open-path')

      await expect(handler?.({}, '  ')).rejects.toThrow('Path is required.')
      expect(mockShellOpenPath).not.toHaveBeenCalled()
    })

    it('rejects shell.openPath failures', async () => {
      mockShellOpenPath.mockResolvedValueOnce('No application can open the file')
      registerShellHandlers()
      const handler = handlers.get('shell:open-path')

      await expect(handler?.({}, '/tmp/project')).rejects.toThrow(
        'No application can open the file',
      )
    })
  })

})
