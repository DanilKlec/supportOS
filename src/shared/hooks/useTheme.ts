import { useCallback, useEffect, useState } from 'react'
import { getPreferences, setTheme as saveTheme } from '#/shared/lib/db'
import type { Preferences } from '#/types/bind'

function applyTheme(theme: Preferences['theme']) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  localStorage.setItem('supportos-theme', theme)
}

export function useTheme() {
  const [theme, setThemeState] = useState<Preferences['theme']>(() => {
    if (typeof window === 'undefined') return 'dark'
    return (localStorage.getItem('supportos-theme') as Preferences['theme']) || 'dark'
  })

  useEffect(() => {
    getPreferences().then((prefs) => {
      setThemeState(prefs.theme)
      applyTheme(prefs.theme)
    })
  }, [])

  const toggleTheme = useCallback(async () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setThemeState(next)
    applyTheme(next)
    await saveTheme(next)
  }, [theme])

  return { theme, toggleTheme, isDark: theme === 'dark' }
}
