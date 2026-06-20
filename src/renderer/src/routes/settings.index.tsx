import { createFileRoute } from '@tanstack/react-router'
import { SettingsRouteSurface } from './-settings-route-surface'

export const Route = createFileRoute('/settings/')({
  component: SettingsIndexRouteView,
})

function SettingsIndexRouteView() {
  return <SettingsRouteSurface tab="profile" />
}
