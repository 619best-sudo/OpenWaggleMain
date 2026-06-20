import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/settings')({
  component: SettingsRouteLayout,
})

function SettingsRouteLayout() {
  return <Outlet />
}
