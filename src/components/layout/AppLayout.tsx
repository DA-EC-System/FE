import { useState } from 'react';
import { Box, Toolbar, useMediaQuery, useTheme } from '@mui/material';
import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { DRAWER_WIDTH } from './drawerConfig';
import { PLATFORM_NAV, companyNav, type NavSection } from './navigation';
import { useAuth } from '@/hooks/useAuth';

interface AppLayoutProps {
  sections: NavSection[];
  subtitle: string;
}

/** Khung chung: AppBar + Drawer + nội dung. Mỗi không gian truyền menu riêng. */
export function AppLayout({ sections, subtitle }: AppLayoutProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [open, setOpen] = useState(true);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <TopBar onToggleSidebar={() => setOpen((o) => !o)} sidebarOpen={open} />
      <Sidebar
        open={isDesktop ? open : false}
        onClose={() => setOpen(false)}
        variant={isDesktop ? 'permanent' : 'temporary'}
        sections={sections}
        subtitle={subtitle}
      />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${open ? DRAWER_WIDTH : 0}px)` },
          minHeight: '100vh',
          backgroundColor: 'background.default',
          transition: 'width 0.2s',
        }}
      >
        <Toolbar />
        <Box sx={{ p: { xs: 2, md: 3 } }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}

export function PlatformLayout() {
  return <AppLayout sections={PLATFORM_NAV} subtitle="Quản trị nền tảng" />;
}

export function CompanyLayout() {
  const { companyContext } = useAuth();
  // RequireCompany đảm bảo đã có companyContext trước khi render layout
  const companyId = companyContext?.companyId ?? '';
  return (
    <AppLayout
      sections={companyNav(companyId)}
      subtitle={companyContext?.companyName ?? ''}
    />
  );
}
