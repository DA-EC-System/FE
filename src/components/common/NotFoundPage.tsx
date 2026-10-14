import { Box, Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { ROUTES } from '@/router/routes';

export function NotFoundPage() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 3,
      }}
    >
      <Stack alignItems="center" spacing={2}>
        <Typography variant="h1" fontWeight={800} color="primary">
          404
        </Typography>
        <Typography variant="h6">Không tìm thấy trang</Typography>
        <Typography color="text.secondary">
          Trang bạn truy cập không tồn tại hoặc đã bị di chuyển.
        </Typography>
        <Button component={RouterLink} to={ROUTES.admin.companies} variant="contained">
          Về trang chính
        </Button>
      </Stack>
    </Box>
  );
}
