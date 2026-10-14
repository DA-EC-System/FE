import { useState } from 'react';
import { Box, Toolbar, useMediaQuery, useTheme } from '@mui/material';
import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { DRAWER_WIDTH } from './drawerConfig';

export function AdminLayout() {
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
