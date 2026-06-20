import { useNavigate } from '@tanstack/react-router'
import { Archive, Cable, Settings2, UserRound } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import type { SettingsTab } from '@/shell/ui-store'

interface NavItem {
  id: SettingsTab
  label: string
  icon: typeof Settings2
}

const NAV_ITEMS: NavItem[] = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'archived', label: 'Archived items', icon: Archive },
  { id: 'connections', label: 'Connections', icon: Cable },
]

interface SettingsNavProps {
  readonly activeTab: SettingsTab
}

export function SettingsNav({ activeTab }: SettingsNavProps) {
  const navigate = useNavigate()

  function navigateToTab(tab: SettingsTab) {
    void navigate({ to: '/settings/$tab', params: { tab } })
  }

  return (
    <nav className="flex w-[200px] shrink-0 flex-col gap-0.5 border-r border-border p-2 bg-bg-secondary">
      {NAV_ITEMS.map((item) => {
        const isActive = activeTab === item.id
        return (
          <Button
            variant="row"
            size="md"
            align="start"
            fullWidth
            key={item.id}
            onClick={() => navigateToTab(item.id)}
            className={cn(
              'gap-2.5 border border-transparent transition-colors',
              isActive
                ? 'rounded-xl border-border bg-bg-active text-text-primary font-medium'
                : 'text-text-tertiary hover:border-border/50',
            )}
          >
            <item.icon className="size-4 shrink-0" />
            <span>{item.label}</span>
          </Button>
        )
      })}
    </nav>
  )
}
