import { useMemo } from 'react';
import {
  Drawer,
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Divider,
  Typography,
  Chip,
  Tooltip,
  Stack,
} from '@mui/material';
import { NavLink, useLocation } from 'react-router-dom';
import BusinessIcon from '@mui/icons-material/Business';
import StoreIcon from '@mui/icons-material/Store';
import CategoryIcon from '@mui/icons-material/Category';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import { DRAWER_WIDTH } from './drawerConfig';
import { ROUTES } from '@/router/routes';
import { useAuth } from '@/hooks/useAuth';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  variant: 'permanent' | 'temporary';
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  /** hiển thị khi user thoả điều kiện này (mặc định luôn hiển thị) */
  show?: (isPlatformAdmin: boolean) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    to: ROUTES.admin.companies,
    label: 'Công ty',
    icon: <BusinessIcon />,
    show: () => true,
  },
  {
    to: ROUTES.admin.catalog,
    label: 'Danh mục sản phẩm',
    icon: <CategoryIcon />,
    disabled: true,
  },
  {
    to: ROUTES.admin.inventory,
    label: 'Kho hàng',
    icon: <Inventory2Icon />,
    disabled: true,
  },
  {
    to: ROUTES.admin.orders,
    label: 'Đơn hàng',
    icon: <ShoppingCartIcon />,
    disabled: true,
  },
];

export function Sidebar({ open, onClose, variant }: SidebarProps) {
  const { user } = useAuth();
  const location = useLocation();

  const visibleItems = useMemo(
    () => NAV_ITEMS.filter((i) => !i.show || i.show(user?.isPlatformAdmin ?? false)),
    [user],
  );

  const drawerContent = (
    <Box>
      <Toolbar sx={{ minHeight: 64, px: 2, gap: 1.5 }}>
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
        <Box>
          <Typography variant="subtitle1" fontWeight={800} lineHeight={1.2}>
            Commerio
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Quản lý đa kênh
          </Typography>
        </Box>
      </Toolbar>
      <Divider />

      <List sx={{ px: 1.5, py: 2 }}>
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ px: 1.5, fontSize: 11 }}
        >
          Quản trị
        </Typography>
        {visibleItems.map((item) => {
          const isActive = location.pathname.startsWith(item.to);
          const button = (
            <ListItemButton
              component={item.disabled ? 'div' : NavLink}
              to={item.disabled ? undefined : item.to}
              disabled={item.disabled}
              selected={isActive}
              onClick={variant === 'temporary' ? onClose : undefined}
              sx={{
                borderRadius: 1.5,
                my: 0.25,
                '&.Mui-selected': {
                  backgroundColor: 'primary.main',
                  color: 'primary.contrastText',
                  '& .MuiListItemIcon-root': { color: 'primary.contrastText' },
                  '&:hover': { backgroundColor: 'primary.dark' },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{ fontSize: 14, fontWeight: 600 }}
              />
              {item.disabled && (
                <Chip label="Soon" size="small" sx={{ height: 18, fontSize: 10 }} />
              )}
            </ListItemButton>
          );

          return (
            <ListItem key={item.to} disablePadding>
              {item.disabled ? (
                <Tooltip title="Sắp ra mắt" placement="right">
                  <Box sx={{ width: '100%' }}>{button}</Box>
                </Tooltip>
              ) : (
                button
              )}
            </ListItem>
          );
        })}
      </List>

      <Divider />
      <Box sx={{ p: 2 }}>
        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            background: 'linear-gradient(135deg, #EEF2FF 0%, #F5F3FF 100%)',
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <StoreIcon color="primary" fontSize="small" />
            <Typography variant="subtitle2" fontWeight={700}>
              Kênh bán hàng
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Vào trang chi tiết một công ty để quản lý các gian hàng kết nối sàn.
          </Typography>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Drawer
      variant={variant}
      open={open}
      onClose={onClose}
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
        },
      }}
      ModalProps={{ keepMounted: true }}
    >
      {drawerContent}
    </Drawer>
  );
}

// (Stack imported at top)
