import type { ReactNode } from 'react';
import {
  Alert,
  Box,
  Chip,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import BusinessIcon from '@mui/icons-material/Business';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LockIcon from '@mui/icons-material/Lock';
import FiberNewIcon from '@mui/icons-material/FiberNew';
import { PageHeader } from '@/components/common/PageHeader';
import { usePlatformOverview } from '@/api/platform.api';
import { getErrorMessage } from '@/api/client';
import { MODULE_LABELS } from '@/utils/modules';
import { formatDateTime } from '@/utils/format';
import { AUDIT_ACTION_LABELS } from './auditLabels';

function StatCard({ label, value, icon }: { label: string; value?: number; icon: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack direction="row" spacing={2} alignItems="center">
        <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
        <Box>
          <Typography variant="body2" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="h5" fontWeight={700}>
            {value ?? <Skeleton width={40} />}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}

/** Tổng quan nền tảng: chỉ số liệu về công ty, không có số liệu kinh doanh (QT-03). */
export function PlatformOverviewPage() {
  const { data, error, isError } = usePlatformOverview();

  return (
    <>
      <PageHeader title="Tổng quan nền tảng" subtitle="Tình hình các công ty dùng Commerio" />
      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(error)}
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' },
          mb: 3,
        }}
      >
        <StatCard label="Tổng số công ty" value={data?.totalCompanies} icon={<BusinessIcon />} />
        <StatCard label="Đang hoạt động" value={data?.activeCompanies} icon={<CheckCircleIcon />} />
        <StatCard label="Đang bị khoá" value={data?.lockedCompanies} icon={<LockIcon />} />
        <StatCard
          label="Đăng ký trong 30 ngày"
          value={data?.registeredLast30Days}
          icon={<FiberNewIcon />}
        />
      </Box>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            Phân hệ tuỳ chọn đang dùng
          </Typography>
          <Stack spacing={1.5}>
            {data?.optionalModuleUsage.map(({ module, companies }) => (
              <Box key={module}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2">{MODULE_LABELS[module]}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {companies}/{data.totalCompanies} công ty
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={data.totalCompanies ? (companies / data.totalCompanies) * 100 : 0}
                  sx={{ mt: 0.5, height: 6, borderRadius: 3 }}
                />
              </Box>
            )) ?? <Skeleton height={120} />}
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="subtitle1" fontWeight={700}>
            Hoạt động gần đây
          </Typography>
          <List dense disablePadding>
            {data?.recentActivities.map((log) => {
              const action = AUDIT_ACTION_LABELS[log.action];
              return (
                <ListItem key={log.id} disableGutters>
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip size="small" color={action.color} label={action.label} />
                        <span>{log.targetCompanyName}</span>
                      </Stack>
                    }
                    secondary={`${formatDateTime(log.createdAt)} · ${log.actorEmail}`}
                  />
                </ListItem>
              );
            }) ?? <Skeleton height={120} />}
          </List>
        </Paper>
      </Box>
    </>
  );
}
