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
} from '@mui/material';
import { NavLink, matchPath, useLocation } from 'react-router-dom';
import { DRAWER_WIDTH } from './drawerConfig';
import type { NavSection } from './navigation';
import { useAuth } from '@/hooks/useAuth';
import { hasPermission, isModuleEnabled } from '@/utils/permissions';
import { BrandLogo } from '@/components/common/BrandLogo';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  variant: 'permanent' | 'temporary';
  sections: NavSection[];
  subtitle: string;
}

export function Sidebar({ open, onClose, variant, sections, subtitle }: SidebarProps) {
  const { companyContext } = useAuth();
  const location = useLocation();

  // Ẩn mục của phân hệ chưa bật hoặc thiếu quyền; bỏ nhóm không còn mục nào
  const visibleSections = useMemo(
    () =>
      sections
        .map((section) => ({
          ...section,
          items: section.items.filter(
            (i) =>
              (!i.module || isModuleEnabled(companyContext, i.module)) &&
              (!i.permission || hasPermission(companyContext, i.permission)),
          ),
        }))
        .filter((section) => section.items.length > 0),
    [sections, companyContext],
  );

  const drawerContent = (
    <Box>
      <Toolbar sx={{ minHeight: 64, px: 2, gap: 1.5 }}>
        <BrandLogo size={32} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={800} lineHeight={1.2}>
            Commerio
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {subtitle}
          </Typography>
        </Box>
      </Toolbar>
      <Divider />

      <List sx={{ px: 1.5, py: 2 }}>
        {visibleSections.map((section) => (
          <Box key={section.title} sx={{ mb: 1.5 }}>
            <Typography
              variant="overline"
              color="text.secondary"
              sx={{ px: 1.5, fontSize: 11 }}
            >
              {section.title}
            </Typography>
            {section.items.map((item) => {
              const isActive = Boolean(
                matchPath({ path: item.to, end: Boolean(item.end) }, location.pathname),
              );
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
          </Box>
        ))}
      </List>
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
