import { Box, Checkbox, FormControlLabel, FormHelperText, Stack, Typography } from '@mui/material';
import { useAuth } from '@/hooks/useAuth';
import type { Role } from '@/types/identity';
import { CEO_ROLE_NAME, roleLockReason } from './shared';

interface RoleChecklistProps {
  roles: Role[];
  value: string[];
  onChange: (roleIds: string[]) => void;
  error?: string;
}

/**
 * Chọn vai trò cho nhân viên. Vai trò có quyền người đang đăng nhập không có
 * hiện mờ và không đổi được (giữ nguyên nếu nhân viên đang mang).
 */
export function RoleChecklist({ roles, value, onChange, error }: RoleChecklistProps) {
  const { companyContext } = useAuth();
  // CEO chỉ hiện khi nhân viên đang mang (không xảy ra ở màn này, CEO không sửa được)
  const visible = roles.filter((r) => r.name !== CEO_ROLE_NAME || value.includes(r.id));

  return (
    <Box>
      <Stack spacing={0.25}>
        {visible.map((role) => {
          const lock = roleLockReason(role, companyContext);
          return (
            <FormControlLabel
              key={role.id}
              sx={{ alignItems: 'flex-start', mr: 0 }}
              disabled={Boolean(lock)}
              control={
                <Checkbox
                  checked={value.includes(role.id)}
                  onChange={(e) =>
                    onChange(
                      e.target.checked ? [...value, role.id] : value.filter((id) => id !== role.id),
                    )
                  }
                  sx={{ pt: 0.5 }}
                />
              }
              label={
                <Box sx={{ py: 0.5 }}>
                  <Typography variant="body2" fontWeight={600}>
                    {role.name}
                    {role.builtIn && (
                      <Typography component="span" variant="caption" color="text.secondary">
                        {' '}
                        · có sẵn
                      </Typography>
                    )}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {lock ?? `${role.permissions.length} quyền`}
                  </Typography>
                </Box>
              }
            />
          );
        })}
      </Stack>
      {error && <FormHelperText error>{error}</FormHelperText>}
    </Box>
  );
}
