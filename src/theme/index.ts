import { createTheme, type Theme } from '@mui/material/styles';
import type { PaletteMode } from '@mui/material';

/**
 * Commerio brand palette:
 * - primary: indigo (#4F46E5)
 * - secondary: violet (#7C3AED)
 * Light + dark variants.
 */
const tokens = {
  primary: '#4F46E5',
  primaryLight: '#818CF8',
  primaryDark: '#3730A3',
  secondary: '#7C3AED',
  secondaryLight: '#A78BFA',
  success: '#16A34A',
  warning: '#F59E0B',
  error: '#DC2626',
  info: '#0EA5E9',
} as const;

const sharedTypography = {
  fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  h1: { fontWeight: 700 },
  h2: { fontWeight: 700 },
  h3: { fontWeight: 600 },
  h4: { fontWeight: 600 },
  h5: { fontWeight: 600 },
  h6: { fontWeight: 600 },
  button: { textTransform: 'none' as const, fontWeight: 600 },
};

const baseShape = { borderRadius: 8 };

function buildTheme(mode: PaletteMode): Theme {
  return createTheme({
    palette: {
      mode,
      primary: {
        main: tokens.primary,
        light: tokens.primaryLight,
        dark: tokens.primaryDark,
      },
      secondary: {
        main: tokens.secondary,
        light: tokens.secondaryLight,
      },
      success: { main: tokens.success },
      warning: { main: tokens.warning },
      error: { main: tokens.error },
      info: { main: tokens.info },
      background:
        mode === 'light'
          ? { default: '#F8FAFC', paper: '#FFFFFF' }
          : { default: '#0B1020', paper: '#111827' },
    },
    shape: baseShape,
    typography: sharedTypography,
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 8 },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
        },
      },
      MuiAppBar: {
        defaultProps: { color: 'inherit' },
        styleOverrides: {
          root: {
            backgroundColor: mode === 'light' ? '#FFFFFF' : '#0F172A',
            borderBottom: `1px solid ${mode === 'light' ? '#E2E8F0' : '#1E293B'}`,
            boxShadow: 'none',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: mode === 'light' ? '#FFFFFF' : '#0F172A',
            borderRight: `1px solid ${mode === 'light' ? '#E2E8F0' : '#1E293B'}`,
          },
        },
      },
      // DataGrid styleOverrides đặt trực tiếp trong component sx prop để
      // tránh phải augment MUI theme.
    },
  });
}

export const lightTheme = buildTheme('light');
export const darkTheme = buildTheme('dark');

export const brandTokens = tokens;
