import { Plus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useTerminalSession,
  useTerminalSessionActivation,
} from '@/features/terminal/hooks/useTerminalSession'
import '@xterm/xterm/css/xterm.css'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'

interface TerminalPanelProps {
  projectPath: string | null
  onClose: () => void
}

interface TerminalTab {
  readonly key: number
}

function getTerminalLabel(status: {
  readonly isReady: boolean
  readonly errorMessage: string | null
}) {
  if (status.errorMessage) return 'unavailable'
  return status.isReady ? '/bin/zsh' : 'connecting...'
}

function getTabTitle(
  index: number,
  status: {
    readonly isReady: boolean
    readonly errorMessage: string | null
  },
) {
  const label = getTerminalLabel(status)
  if (label === '/bin/zsh') {
    return `Terminal ${index + 1}`
  }
  return `Terminal ${index + 1} ${label}`
}

function TerminalSessionView({
  projectPath,
  active,
}: {
  readonly projectPath: string | null
  readonly active: boolean
}) {
  const { containerRef, terminalStatus, terminalIdRef, terminalRef, fitAddonRef } =
    useTerminalSession(projectPath)

  useTerminalSessionActivation(active, terminalIdRef, terminalRef, fitAddonRef)

  return (
    <>
      <div
        ref={containerRef}
        className={cn('h-full flex-1 overflow-hidden bg-black', !active && 'hidden')}
      />
      {active && terminalStatus.errorMessage && (
        <div className="home-divider-t px-3 py-2 text-[12px] text-error">
          {terminalStatus.errorMessage}
        </div>
      )}
    </>
  )
}

function TerminalTabButton({
  active,
  title,
  onSelect,
  onClose,
}: {
  readonly active: boolean
  readonly title: string
  readonly onSelect: () => void
  readonly onClose: () => void
}) {
  return (
    <div
      className={cn(
        'group relative inline-flex h-full max-w-44 shrink-0 items-center gap-1 pl-4 pr-2.5 text-[13px] transition-colors',
        active
          ? 'text-text-primary bg-bg-secondary'
          : 'bg-transparent text-text-secondary hover:bg-bg-hover hover:text-text-primary',
      )}
    >
      {active && <div className="absolute left-0 top-0 h-[2px] w-full bg-home-border-vibrant" />}
      <button
        type="button"
        role="tab"
        aria-selected={active}
        onClick={onSelect}
        className="min-w-0 flex-1 truncate text-left outline-none"
        title={title}
      >
        <span className="truncate">{title}</span>
      </button>
      <Button
        variant="unstyled"
        type="button"
        onClick={onClose}
        className={cn(
          'flex size-5 items-center justify-center rounded text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary',
          active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
        title={`Close ${title}`}
        aria-label={`Close ${title}`}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  )
}

export function TerminalPanel({ projectPath, onClose }: TerminalPanelProps) {
  const nextTabKeyRef = useRef(2)
  const [tabs, setTabs] = useState<readonly TerminalTab[]>([{ key: 1 }])
  const [activeTabKey, setActiveTabKey] = useState(1)

  useEffect(() => {
    setTabs([{ key: 1 }])
    setActiveTabKey(1)
    nextTabKeyRef.current = 2
  }, [projectPath])

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.key === activeTabKey) ?? tabs[0] ?? null,
    [activeTabKey, tabs],
  )

  function handleAddTerminal() {
    const key = nextTabKeyRef.current
    nextTabKeyRef.current += 1
    setTabs((currentTabs) => [...currentTabs, { key }])
    setActiveTabKey(key)
  }

  function handleCloseTab(tabKey: number) {
    setTabs((currentTabs) => {
      if (currentTabs.length === 1) {
        onClose()
        return currentTabs
      }
      const closingIndex = currentTabs.findIndex((tab) => tab.key === tabKey)
      const nextTabs = currentTabs.filter((tab) => tab.key !== tabKey)
      if (tabKey === activeTabKey) {
        const fallbackTab = nextTabs[closingIndex] ?? nextTabs[closingIndex - 1] ?? nextTabs[0]
        if (fallbackTab) {
          setActiveTabKey(fallbackTab.key)
        }
      }
      return nextTabs
    })
  }

  return (
    <div className="home-divider-t flex h-full shrink-0 flex-col bg-black">
      <div className="home-divider-b flex h-11 items-center justify-between gap-2 bg-bg-tertiary pr-2">
        <div className="flex h-full min-w-0 flex-1 items-center overflow-x-auto" role="tablist">
          {tabs.map((tab, index) => {
            const isActive = tab.key === activeTab?.key
            return (
              <TerminalTabButton
                key={tab.key}
                active={isActive}
                title={`Terminal ${index + 1}`}
                onSelect={() => setActiveTabKey(tab.key)}
                onClose={() => handleCloseTab(tab.key)}
              />
            )
          })}
          <Button
            variant="unstyled"
            type="button"
            onClick={handleAddTerminal}
            className="ml-1 flex size-7 items-center justify-center rounded text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
            title="New terminal"
            aria-label="New terminal"
          >
            <Plus className="size-4" />
          </Button>
        </div>
        <Button
          variant="unstyled"
          type="button"
          onClick={onClose}
          className="flex size-7 items-center justify-center rounded text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors"
          title="Close terminal panel"
          aria-label="Close terminal panel"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="relative flex-1 bg-black">
        {tabs.map((tab, index) => (
          <div
            key={tab.key}
            className={cn('h-full bg-black', tab.key !== activeTab?.key && 'hidden')}
            role="tabpanel"
            aria-label={getTabTitle(index, { isReady: true, errorMessage: null })}
          >
            <TerminalSessionView projectPath={projectPath} active={tab.key === activeTab?.key} />
          </div>
        ))}
      </div>
    </div>
  )
}
