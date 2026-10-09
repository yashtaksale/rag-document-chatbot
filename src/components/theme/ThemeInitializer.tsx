// =============================================================================
// ThemeInitializer Component — Safe client-side theme initialization
// Avoids raw script tags inside React 19 components to prevent console warnings
// =============================================================================

'use client';

import { useEffect } from 'react';
import { useThemeStore } from '../../stores/theme-store';

export function ThemeInitializer() {
  const initTheme = useThemeStore((s) => s.initTheme);

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  return null;
}
