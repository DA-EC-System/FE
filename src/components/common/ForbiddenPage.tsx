import { Box, Button, Paper, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { ROUTES } from '@/router/routes';

interface ForbiddenPageProps {
  title?: string;
  message: string;
  backTo?: string;
  backLabel?: string;
}

export function ForbiddenPage({
  title = '403 — Không có quyền truy cập',
  message,
  backTo = ROUTES.home,
  backLabel = 'Về trang chính',
}: ForbiddenPageProps) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 4 }}>
      <Paper
        sx={{ p: 4, maxWidth: 480, textAlign: 'center', border: 1, borderColor: 'divider' }}
        elevation={0}
      >
        <Typography variant="h5" fontWeight={700} gutterBottom>
          {title}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {message}
        </Typography>
        <Button component={RouterLink} to={backTo} variant="contained">
          {backLabel}
        </Button>
      </Paper>
    </Box>
  );
}
