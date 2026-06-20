import { TERMINAL } from '@shared/constants/resource-limits'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/shared/lib/ipc'

const FONT_SIZE = 14

const TERMINAL_THEME = {
  background: 'transparent',
  foreground: 'var(--color-text-primary)',
  cursor: 'var(--color-accent)',
  selectionBackground: 'color-mix(in srgb, var(--color-accent) 30%, transparent)',
  black: '#0a0a0a',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#f59e0b',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#fbbf24',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#ffffff',
}

function createTerminal() {
  return new Terminal({
    theme: TERMINAL_THEME,
    fontSize: FONT_SIZE,
    fontFamily: '"SF Mono", "Fira Code", "JetBrains Mono", monospace',
    cursorBlink: true,
    allowProposedApi: true,
  })
}

export function clampTerminalDimensions(cols: number, rows: number) {
  return {
    cols: Math.min(Math.max(Math.floor(cols), TERMINAL.MIN_COLS), TERMINAL.MAX_COLS),
    rows: Math.min(Math.max(Math.floor(rows), TERMINAL.MIN_ROWS), TERMINAL.MAX_ROWS),
  }
}

function resizeTerminalInstance(terminalId: string | null, term: Terminal, fitAddon: FitAddon) {
  if (!terminalId) {
    return
  }
  fitAddon.fit()
  const size = clampTerminalDimensions(term.cols, term.rows)
  void api.resizeTerminal(terminalId, size.cols, size.rows).catch(() => {})
}

function setTerminalReady(
  terminalIdRef: React.MutableRefObject<string | null>,
  id: string,
  term: Terminal,
  setTerminalStatus: (status: {
    readonly isReady: boolean
    readonly errorMessage: string | null
  }) => void,
) {
  terminalIdRef.current = id
  setTerminalStatus({ isReady: true, errorMessage: null })
  const size = clampTerminalDimensions(term.cols, term.rows)
  void api.resizeTerminal(id, size.cols, size.rows).catch(() => {})
}

function setTerminalError(
  error: unknown,
  setTerminalStatus: (status: {
    readonly isReady: boolean
    readonly errorMessage: string | null
  }) => void,
) {
  setTerminalStatus({
    isReady: false,
    errorMessage: error instanceof Error ? error.message : 'Failed to open terminal.',
  })
}

export function useTerminalSession(projectPath: string | null) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalIdRef = useRef<string | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [terminalStatus, setTerminalStatus] = useState<{
    readonly isReady: boolean
    readonly errorMessage: string | null
  }>({
    isReady: false,
    errorMessage: null,
  })

  useEffect(() => {
    if (!containerRef.current) return
    let cleanedUp = false

    const term = createTerminal()
    const fitAddon = new FitAddon()
    terminalRef.current = term
    fitAddonRef.current = fitAddon
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    requestAnimationFrame(() => fitAddon.fit())

    const cwd = projectPath ?? ''
    api
      .createTerminal(cwd)
      .then((id) => {
        if (!cleanedUp) setTerminalReady(terminalIdRef, id, term, setTerminalStatus)
      })
      .catch((error: unknown) => {
        if (!cleanedUp) setTerminalError(error, setTerminalStatus)
      })

    const inputDispose = term.onData((data) => {
      if (terminalIdRef.current) api.writeTerminal(terminalIdRef.current, data)
    })
    const unsubscribe = api.onTerminalData((payload) => {
      if (payload.terminalId === terminalIdRef.current) term.write(payload.data)
    })
    const resizeObserver = new ResizeObserver(() => {
      resizeTerminalInstance(terminalIdRef.current, term, fitAddon)
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      cleanedUp = true
      inputDispose.dispose()
      unsubscribe()
      resizeObserver.disconnect()
      if (terminalIdRef.current) api.closeTerminal(terminalIdRef.current)
      terminalRef.current = null
      fitAddonRef.current = null
      term.dispose()
    }
  }, [projectPath])

  return { containerRef, terminalStatus, terminalIdRef, terminalRef, fitAddonRef }
}

export function useTerminalSessionActivation(
  active: boolean,
  terminalIdRef: React.RefObject<string | null>,
  terminalRef: React.RefObject<Terminal | null>,
  fitAddonRef: React.RefObject<FitAddon | null>,
) {
  useEffect(() => {
    if (!active || !terminalRef.current || !fitAddonRef.current) {
      return
    }
    const frame = requestAnimationFrame(() => {
      resizeTerminalInstance(terminalIdRef.current, terminalRef.current!, fitAddonRef.current!)
      terminalRef.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [active, terminalIdRef, terminalRef, fitAddonRef])
}
