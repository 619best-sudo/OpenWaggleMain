import type { SidebarView } from '../model'

export function activeViewFromPathname(pathname: string): SidebarView {
  if (pathname.startsWith('/mcp')) return 'mcp'
  if (pathname.startsWith('/skills')) return 'skills'
  if (pathname.startsWith('/settings')) return 'settings'
  if (pathname.startsWith('/teammates')) return 'teammates'
  if (pathname.startsWith('/waggle')) return 'waggle'
  return 'chat'
}
