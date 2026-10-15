import { useEffect, useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import BusinessIcon from '@mui/icons-material/Business';
import LockIcon from '@mui/icons-material/Lock';
import { useAuth, useLogout, useMe } from '@/hooks/useAuth';
import { getErrorMessage } from '@/api/client';
import { ROUTES } from '@/router/routes';
import type { Membership } from '@/types/auth';

function blockedReason(m: Membership): string | null {
  if (m.companyStatus === 'locked') return 'Công ty đang bị khoá';
  if (m.status === 'locked') return 'Tài khoản của bạn bị khoá trong công ty này';
  return null;
}

/** Một tài khoản có thể thuộc nhiều công ty; mỗi công ty là một phiên làm việc riêng. */
export function SelectCompanyPage() {
  const { account, memberships } = useAuth();
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();

  const usable = useMemo(() => memberships.filter((m) => !blockedReason(m)), [memberships]);

  // Chỉ có một công ty vào được thì đi thẳng, sau khi đã tải lại trạng thái mới nhất
  useEffect(() => {
    if (me.isSuccess && usable.length === 1 && memberships.length === 1) {
      navigate(ROUTES.company.root(usable[0].companyId), { replace: true });
    }
  }, [me.isSuccess, usable, memberships.length, navigate]);

  if (account?.isPlatformAdmin) return <Navigate to={ROUTES.platform.root} replace />;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        p: { xs: 2, md: 6 },
        backgroundColor: 'background.default',
      }}
    >
      <Box sx={{ width: '100%', maxWidth: 640 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3 }}>
          <Box>
            <Typography variant="h5" fontWeight={700}>
              Chọn công ty
            </Typography>
            <Typography color="text.secondary">
              Xin chào {account?.fullName}. Chọn công ty bạn muốn làm việc.
            </Typography>
          </Box>
          <Button onClick={logout}>Đăng xuất</Button>
        </Stack>

        {me.isError && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Không tải lại được danh sách công ty: {getErrorMessage(me.error)}
          </Alert>
        )}

        {me.isPending && memberships.length === 0 ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : memberships.length === 0 ? (
          <Alert severity="info">
            Tài khoản chưa thuộc công ty nào. Liên hệ CEO hoặc Admin của công ty để được mời.
          </Alert>
        ) : (
          <Stack spacing={1.5}>
            {memberships.map((m) => {
              const reason = blockedReason(m);
              return (
                <Card
                  key={m.companyId}
                  variant="outlined"
                  sx={{ opacity: reason ? 0.6 : 1 }}
                >
                  <CardActionArea
                    disabled={Boolean(reason)}
                    onClick={() => navigate(ROUTES.company.root(m.companyId))}
                  >
                    <CardContent>
                      <Stack direction="row" spacing={2} alignItems="center">
                        {reason ? (
                          <LockIcon color="disabled" />
                        ) : (
                          <BusinessIcon color="primary" />
                        )}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography fontWeight={600} noWrap>
                            {m.companyName}
                          </Typography>
                          <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                            {m.roles.map((r) => (
                              <Chip key={r} label={r} size="small" variant="outlined" />
                            ))}
                          </Stack>
                          {reason && (
                            <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
                              {reason}
                            </Typography>
                          )}
                        </Box>
                      </Stack>
                    </CardContent>
                  </CardActionArea>
                </Card>
              );
            })}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
