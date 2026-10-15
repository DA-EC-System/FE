import { alpha, createTheme, type Theme } from '@mui/material/styles';
import type { PaletteMode } from '@mui/material';
import type {} from '@mui/x-data-grid/themeAugmentation';
import { brand, neutral, semantic, surface } from './tokens';

declare module '@mui/material/styles' {
  interface Palette {
    brand: typeof brand;
  }
  interface PaletteOptions {
    brand?: typeof brand;
  }
}

/**
 * Theme MUI dựng từ bộ màu logo (xem ./tokens.ts).
 *  - primary   = thép #486A8C: nút, link, mục đang chọn. Bản tối dùng bậc 300 để đủ tương phản.
 *  - secondary = navy #0D2143: điểm nhấn đậm, nút phụ.
 *  - palette.brand: cả thang 50–900, dùng trong sx như `bgcolor: 'brand.100'`.
 */
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

function buildTheme(mode: PaletteMode): Theme {
  const light = mode === 'light';
  const s = light ? surface.light : surface.dark;
  const status = light ? semantic.light : semantic.dark;
  const onStatus = light ? '#FFFFFF' : brand[900];

  const theme = createTheme({
    palette: {
      mode,
      brand,
      primary: light
        ? { main: brand[500], light: brand[300], dark: brand[700], contrastText: '#FFFFFF' }
        : { main: brand[300], light: brand[200], dark: brand[400], contrastText: brand[900] },
      secondary: light
        ? { main: brand[900], light: brand[700], dark: '#081428', contrastText: '#FFFFFF' }
        : { main: brand[100], light: brand[50], dark: brand[200], contrastText: brand[900] },
      success: { main: status.success, contrastText: onStatus },
      warning: { main: status.warning, contrastText: onStatus },
      error: { main: status.error, contrastText: onStatus },
      info: { main: status.info, contrastText: onStatus },
      grey: neutral,
      background: { default: s.background, paper: s.paper },
      text: { primary: s.textPrimary, secondary: s.textSecondary },
      divider: s.border,
    },
    shape: { borderRadius: 8 },
    typography: sharedTypography,
  });

  const { palette } = theme;
  const selectedBg = alpha(palette.primary.main, light ? 0.1 : 0.16);

  return createTheme(theme, {
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          '::selection': { backgroundColor: alpha(palette.primary.main, 0.25) },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: 8 } },
      },
      MuiPaper: {
        styleOverrides: { root: { backgroundImage: 'none' } },
      },
      MuiAppBar: {
        defaultProps: { color: 'inherit' },
        styleOverrides: {
          root: {
            backgroundColor: s.paper,
            borderBottom: `1px solid ${s.border}`,
            boxShadow: 'none',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: { backgroundColor: s.paper, borderRight: `1px solid ${s.border}` },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            '&.Mui-selected': { backgroundColor: selectedBg },
            '&.Mui-selected:hover': { backgroundColor: alpha(palette.primary.main, light ? 0.16 : 0.24) },
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: { '&.Mui-selected': { backgroundColor: selectedBg } },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          notchedOutline: { borderColor: light ? neutral[300] : s.border },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { backgroundColor: light ? brand[900] : brand[100], color: light ? '#FFFFFF' : brand[900] },
          arrow: { color: light ? brand[900] : brand[100] },
        },
      },
      MuiAvatar: {
        styleOverrides: {
          colorDefault: { backgroundColor: palette.primary.main, color: palette.primary.contrastText },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { backgroundColor: light ? brand[100] : s.border },
        },
      },
      MuiDataGrid: {
        styleOverrides: {
          root: { '--DataGrid-containerBackground': light ? brand[50] : s.background },
          columnHeaderTitle: { fontWeight: 600, color: s.textSecondary },
          row: {
            '&.Mui-selected': { backgroundColor: selectedBg },
          },
        },
      },
    },
  });
}

export const lightTheme = buildTheme('light');
export const darkTheme = buildTheme('dark');

export { brand, brandGradient, neutral, semantic, surface } from './tokens';
