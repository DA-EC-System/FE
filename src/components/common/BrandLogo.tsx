import { Box } from '@mui/material';
import logoUrl from '@/assets/logo.png';

interface BrandLogoProps {
  size?: number;
  /** Đặt trên nền tối (panel navy, dark mode): thêm nền trắng để viền navy của logo không chìm. */
  onDark?: boolean;
}

/** Logo Commerio — dùng chung cho Sidebar, TopBar, trang đăng nhập. */
export function BrandLogo({ size = 32, onDark }: BrandLogoProps) {
  return (
    <Box
      sx={(theme) => {
        const badge = onDark ?? theme.palette.mode === 'dark';
        return {
          width: size,
          height: size,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 1.5,
          ...(badge && { bgcolor: '#FFFFFF', p: `${Math.round(size * 0.14)}px` }),
        };
      }}
    >
      <Box
        component="img"
        src={logoUrl}
        alt="Commerio"
        sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </Box>
  );
}
