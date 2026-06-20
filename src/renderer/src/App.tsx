import { RouterProvider } from '@tanstack/react-router'
import { AuthScreen } from '@/features/auth/components/AuthScreen'
import { useAppAuth } from '@/features/auth/state/app-auth-store'
import { usePreferences, useSettingsSetup } from '@/features/settings/hooks'
import { router } from '@/router'

function AppLoadingView() {
  return (
    <div className="flex h-full items-center justify-center bg-bg">
      <div className="text-text-tertiary text-sm">Loading…</div>
    </div>
  )
}

export function App() {
  useSettingsSetup()

  const { isLoaded } = usePreferences()
  const { isAuthenticated } = useAppAuth()

  if (!isLoaded) {
    return <AppLoadingView />
  }

  if (!isAuthenticated) {
    return <AuthScreen />
  }

  return <RouterProvider router={router} />
}
