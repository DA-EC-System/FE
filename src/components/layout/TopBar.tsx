import { useState } from 'react';
import {
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Box,
  Avatar,
  Menu,
  MenuItem,
  Tooltip,
  Stack,
  Divider,
  ListItemIcon,
  Chip,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import MenuIcon from '@mui/icons-material/Menu';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LogoutIcon from '@mui/icons-material/Logout';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { useAuth } from '@/hooks/useAuth';
import { useColorMode } from '@/theme/ColorModeContext';
import { DRAWER_WIDTH } from './drawerConfig';

interface TopBarProps {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

export function TopBar({ onToggleSidebar, sidebarOpen }: TopBarProps) {
  const { user, clear } = useAuth();
  const { mode, toggle } = useColorMode();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  return (
    <AppBar
      position="fixed"
      sx={{
        zIndex: (t) => t.zIndex.drawer + 1,
        width: { md: sidebarOpen ? `calc(100% - ${DRAWER_WIDTH}px)` : '100%' },
        ml: { md: sidebarOpen ? `${DRAWER_WIDTH}px` : 0 },
        transition: 'width 0.2s, margin 0.2s',
      }}
    >
      <Toolbar sx={{ gap: 1 }}>
        <IconButton
          color="inherit"
          edge="start"
          onClick={onToggleSidebar}
          sx={{ display: { md: 'none' } }}
          aria-label="Mở menu"
        >
          <MenuIcon />
        </IconButton>

        <Stack
          direction="row"
          spacing={1.5}
          alignItems="center"
          component={RouterLink}
          to="/"
          sx={{ textDecoration: 'none', color: 'inherit' }}
        >
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1.5,
              background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 800,
            }}
          >
            C
          </Box>
          <Typography variant="h6" fontWeight={700} letterSpacing={-0.5}>
            Commerio
          </Typography>
          <Chip
            label="Admin"
            size="small"
            sx={{ ml: 0.5, fontWeight: 600 }}
            color="primary"
            variant="outlined"
          />
        </Stack>

        <Box sx={{ flexGrow: 1 }} />

        <Tooltip title={mode === 'dark' ? 'Chuyển sáng' : 'Chuyển tối'}>
          <IconButton onClick={toggle} color="inherit" aria-label="Đổi giao diện">
            {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
        </Tooltip>

        <Tooltip title={user?.fullName ?? 'Tài khoản'}>
          <IconButton onClick={(e) => setAnchor(e.currentTarget)} color="inherit">
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
              {user?.fullName?.charAt(0).toUpperCase() ?? <AccountCircleIcon />}
            </Avatar>
          </IconButton>
        </Tooltip>

        <Menu
          anchorEl={anchor}
          open={Boolean(anchor)}
          onClose={() => setAnchor(null)}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          <Box sx={{ px: 2, py: 1.5, minWidth: 220 }}>
            <Typography variant="subtitle2" fontWeight={700}>
              {user?.fullName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {user?.email}
            </Typography>
            <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
              {user?.isPlatformAdmin && (
                <Chip size="small" color="primary" label="Platform Admin" />
              )}
              {user?.roles.map((r) => (
                <Chip key={r} size="small" variant="outlined" label={r} />
              ))}
            </Stack>
          </Box>
          <Divider />
          <MenuItem
            onClick={() => {
              setAnchor(null);
              clear();
              window.location.assign('/login');
            }}
          >
            <ListItemIcon>
              <LogoutIcon fontSize="small" />
            </ListItemIcon>
            Đăng xuất
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
