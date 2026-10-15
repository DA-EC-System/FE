import { Chip, Paper, Stack, Typography } from '@mui/material';
import { PageHeader } from '@/components/common/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { MODULE_LABELS, isOptionalModule } from '@/utils/modules';

/** Tổng quan của công ty — tạm hiện vai trò và phân hệ đang bật; số liệu kinh doanh làm sau. */
export function CompanyHomePage() {
  const { companyContext } = useAuth();
  if (!companyContext) return null;
  const optional = companyContext.enabledModules.filter(isOptionalModule);

  return (
    <>
      <PageHeader title={companyContext.companyName} subtitle="Tổng quan công ty" />
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack spacing={2}>
          <div>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Vai trò của bạn
            </Typography>
            <Stack direction="row" spacing={1}>
              {companyContext.roles.map((r) => (
                <Chip key={r} label={r} color="primary" variant="outlined" />
              ))}
            </Stack>
          </div>
          <div>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Phân hệ tuỳ chọn đang bật
            </Typography>
            {optional.length === 0 ? (
              <Typography variant="body2">Chưa bật phân hệ tuỳ chọn nào.</Typography>
            ) : (
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                {optional.map((m) => (
                  <Chip key={m} label={MODULE_LABELS[m]} />
                ))}
              </Stack>
            )}
          </div>
        </Stack>
      </Paper>
    </>
  );
}
