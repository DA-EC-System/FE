import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import { useSetStaffRoles } from '@/api/identity.api';
import { getErrorMessage, getProblem } from '@/api/client';
import type { Role, StaffMember } from '@/types/identity';
import { RoleChecklist } from './RoleChecklist';
import { conflictCurrent } from './shared';

interface EditStaffRolesDialogProps {
  member: StaffMember | null;
  roles: Role[];
  onClose: () => void;
  onDone: (message: string) => void;
}

/** UC-PI-05: đổi vai trò của nhân viên */
export function EditStaffRolesDialog({ member, roles, onClose, onDone }: EditStaffRolesDialogProps) {
  const setRoles = useSetStaffRoles();
  // Bản đang sửa; thay bằng bản hiện tại khi người khác vừa sửa
  const [current, setCurrent] = useState<StaffMember | null>(member);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  useEffect(() => {
    setCurrent(member);
    setRoleIds(member?.roles.map((r) => r.id) ?? []);
    setError(null);
    setFieldError(undefined);
  }, [member]);

  const save = async () => {
    if (!current) return;
    if (roleIds.length === 0) {
      setFieldError('Chọn ít nhất một vai trò');
      return;
    }
    setError(null);
    try {
      await setRoles.mutateAsync({ accountId: current.accountId, roleIds, version: current.version });
      onDone(`Đã cập nhật vai trò của ${current.fullName}`);
    } catch (e) {
      const latest = conflictCurrent<StaffMember>(e);
      if (getProblem(e)?.code === 'version_conflict' && latest) {
        setCurrent(latest);
        setRoleIds(latest.roles.map((r) => r.id));
        setError(
          `Tài khoản vừa được người khác sửa. Vai trò hiện tại: ${
            latest.roles.map((r) => r.name).join(', ') || 'không có'
          }${latest.status === 'locked' ? ' (đang tạm khoá)' : ''}. Chưa có gì thay đổi; chọn lại rồi lưu.`,
        );
        return;
      }
      setError(getErrorMessage(e));
    }
  };

  return (
    <Dialog open={Boolean(member)} onClose={setRoles.isPending ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Đổi vai trò</DialogTitle>
      <DialogContent dividers>
        {current && (
          <Typography variant="body2" sx={{ mb: 2 }}>
            <strong>{current.fullName}</strong> · {current.email}
          </Typography>
        )}
        {error && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <RoleChecklist
          roles={roles}
          value={roleIds}
          onChange={(ids) => {
            setRoleIds(ids);
            setFieldError(undefined);
          }}
          error={fieldError}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={setRoles.isPending}>
          Huỷ
        </Button>
        <Button variant="contained" onClick={save} disabled={setRoles.isPending}>
          {setRoles.isPending ? 'Đang lưu...' : 'Lưu'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
