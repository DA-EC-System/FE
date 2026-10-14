import { Box, Stack, Typography, Button } from '@mui/material';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** nút primary mặc định — sẽ ẩn nếu action được cung cấp */
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  action,
  actionLabel,
  onAction,
  actionIcon,
}: PageHeaderProps) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      alignItems={{ xs: 'flex-start', sm: 'center' }}
      justifyContent="space-between"
      spacing={2}
      sx={{ mb: 3 }}
    >
      <Box>
        <Typography variant="h5" fontWeight={700}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {action ?? (actionLabel && onAction ? (
        <Button
          variant="contained"
          startIcon={actionIcon}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      ) : null)}
    </Stack>
  );
}
