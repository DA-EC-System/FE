import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { lightTheme, darkTheme } from './index';
import { brand, surface } from './tokens';

type Mode = 'light' | 'dark';

interface ColorModeCtx {
  mode: Mode;
  toggle: () => void;
}

const ColorModeContext = createContext<ColorModeCtx>({
  mode: 'light',
  toggle: () => undefined,
});

export function useColorMode() {
  return useContext(ColorModeContext);
}

const STORAGE_KEY = 'commerio.themeMode';

function readInitialMode(): Mode {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>(readInitialMode);

  // Một chế độ màu cho cả hai lớp UI: class `.dark` cho Tailwind/shadcn, theme cho các trang MUI còn lại
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, mode);
    const root = document.documentElement;
    root.classList.toggle('dark', mode === 'dark');
    root.style.colorScheme = mode;
    document
      .querySelector("meta[name='theme-color']")
      ?.setAttribute('content', mode === 'dark' ? surface.dark.background : brand[900]);
  }, [mode]);

  const value = useMemo<ColorModeCtx>(
    () => ({
      mode,
      toggle: () => setMode((m) => (m === 'light' ? 'dark' : 'light')),
    }),
    [mode],
  );

  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={mode === 'light' ? lightTheme : darkTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}
