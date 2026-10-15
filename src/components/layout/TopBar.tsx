import { useState } from 'react';
import logoUrl from '@/assets/logo.png';
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
  ListItemText,
  Chip,
  Button,
} from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import MenuIcon from '@mui/icons-material/Menu';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LogoutIcon from '@mui/icons-material/Logout';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import BusinessIcon from '@mui/icons-material/Business';
import CheckIcon from '@mui/icons-material/Check';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useAuth, useLogout } from '@/hooks/useAuth';
import { useColorMode } from '@/theme/ColorModeContext';
import { ROUTES } from '@/router/routes';
import { DRAWER_WIDTH } from './drawerConfig';

interface TopBarProps {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

/** Nút đổi công ty: chỉ liệt kê công ty còn vào được; đổi qua URL để RequireCompany xin token mới. */
function CompanySwitcher() {
  const { memberships, companyContext } = useAuth();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (!companyContext) return null;

  const usable = memberships.filter(
    (m) => m.companyStatus === 'active' && m.status === 'active',
  );

  return (
    <>
      <Button
        color="inherit"
        startIcon={<BusinessIcon />}
        endIcon={<ExpandMoreIcon />}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ textTransform: 'none', fontWeight: 600, maxWidth: 320 }}
      >
        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {companyContext.companyName}
        </Box>
      </Button>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
      >
        {usable.map((m) => (
          <MenuItem
            key={m.companyId}
            selected={m.companyId === companyContext.companyId}
            onClick={() => {
              setAnchor(null);
              if (m.companyId !== companyContext.companyId) {
                navigate(ROUTES.company.root(m.companyId));
              }
            }}
          >
            <ListItemIcon>
              {m.companyId === companyContext.companyId && <CheckIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText primary={m.companyName} secondary={m.roles.join(', ')} />
          </MenuItem>
        ))}
        <Divider />
        <MenuItem component={RouterLink} to={ROUTES.selectCompany} onClick={() => setAnchor(null)}>
          <ListItemIcon>
            <SwapHorizIcon fontSize="small" />
          </ListItemIcon>
          Tất cả công ty
        </MenuItem>
      </Menu>
    </>
  );
}

export function TopBar({ onToggleSidebar, sidebarOpen }: TopBarProps) {
  const { account, companyContext } = useAuth();
  const logout = useLogout();
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
          to={ROUTES.home}
          sx={{ textDecoration: 'none', color: 'inherit', display: { xs: 'none', sm: 'flex' } }}
        >
          <Box
            component="img"
            src={logoUrl}
            alt="Commerio"
            sx={{
              width: 32,
              height: 32,
              objectFit: 'contain',
              flexShrink: 0,
            }}
          />
          <Typography variant="h6" fontWeight={700} letterSpacing={-0.5}>
            Commerio
          </Typography>
        </Stack>

        {account?.isPlatformAdmin ? (
          <Chip
            label="Quản trị nền tảng"
            size="small"
            sx={{ ml: 0.5, fontWeight: 600 }}
            color="primary"
            variant="outlined"
          />
        ) : (
          <CompanySwitcher />
        )}

        <Box sx={{ flexGrow: 1 }} />

        <Tooltip title={mode === 'dark' ? 'Chuyển sáng' : 'Chuyển tối'}>
          <IconButton onClick={toggle} color="inherit" aria-label="Đổi giao diện">
            {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
        </Tooltip>

        <Tooltip title={account?.fullName ?? 'Tài khoản'}>
          <IconButton onClick={(e) => setAnchor(e.currentTarget)} color="inherit">
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
              {account?.fullName?.charAt(0).toUpperCase() ?? <AccountCircleIcon />}
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
              {account?.fullName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {account?.email}
            </Typography>
            <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
              {account?.isPlatformAdmin && (
                <Chip size="small" color="primary" label="Quản trị nền tảng" />
              )}
              {companyContext?.roles.map((r) => (
                <Chip key={r} size="small" variant="outlined" label={r} />
              ))}
            </Stack>
          </Box>
          <Divider />
          <MenuItem
            onClick={() => {
              setAnchor(null);
              logout();
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
