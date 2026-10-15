import type { ReactNode } from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';
import { BrandLogo } from '@/components/common/BrandLogo';
import { brandGradient } from '@/theme/tokens';

interface AuthShellProps {
  title: string;
  subtitle?: ReactNode;
  /** Form rộng hơn (trang đăng ký) */
  wide?: boolean;
  children: ReactNode;
}

/** Khung chung cho đăng nhập, đăng ký công ty, đổi mật khẩu: panel thương hiệu bên trái, form bên phải. */
export function AuthShell({ title, subtitle, wide, children }: AuthShellProps) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'stretch', bgcolor: 'background.default' }}>
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flex: wide ? 0.8 : 1,
          background: brandGradient,
          color: 'white',
          flexDirection: 'column',
          justifyContent: 'space-between',
          p: 6,
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <BrandLogo size={40} onDark />
          <Typography variant="h5" fontWeight={800}>
            Commerio
          </Typography>
        </Stack>

        <Box>
          <Typography variant="h3" fontWeight={800} sx={{ mb: 2, lineHeight: 1.1 }}>
            Hệ thống quản lý
            <br />
            đa kênh cho doanh nghiệp
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.85, maxWidth: 480 }}>
            Một trang quản lý vận hành bán hàng cho nhiều công ty, đồng bộ sản phẩm, tồn kho và
            đơn hàng từ Shopee, Lazada, TikTok Shop và kênh tin nhắn về một nơi duy nhất.
          </Typography>
        </Box>

        <Typography variant="caption" sx={{ opacity: 0.6 }}>
          © 2026 Commerio · Đồ án chuyên ngành — HCMUT
        </Typography>
      </Box>

      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: { xs: 2, sm: 3, md: 6 },
        }}
      >
        <Paper
          elevation={0}
          sx={{
            width: '100%',
            maxWidth: wide ? 640 : 440,
            p: { xs: 3, md: 5 },
            border: 1,
            borderColor: 'divider',
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 3, display: { md: 'none' } }}>
            <BrandLogo size={32} />
            <Typography variant="h6" fontWeight={800}>
              Commerio
            </Typography>
          </Stack>
          <Stack spacing={1} sx={{ mb: 3 }}>
            <Typography variant="h4" fontWeight={800}>
              {title}
            </Typography>
            {subtitle && <Typography color="text.secondary">{subtitle}</Typography>}
          </Stack>
          {children}
        </Paper>
      </Box>
    </Box>
  );
}
