import { useEffect, useState } from 'react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSetStaffRoles } from '@/api/identity.api';
import { problemCode, problemMessage } from '@/api/problemMessages';
import type { Role, StaffMember } from '@/types/identity';
import { RoleChecklist } from './RoleChecklist';
import { conflictCurrent, STAFF_STATUS_LABELS } from './shared';

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
      if (problemCode(e) === 'version_conflict' && latest) {
        setCurrent(latest);
        setRoleIds(latest.roles.map((r) => r.id));
        setError(
          `Tài khoản vừa được người khác sửa. Vai trò hiện tại: ${
            latest.roles.map((r) => r.name).join(', ') || 'không có'
          } (${STAFF_STATUS_LABELS[latest.status].toLowerCase()}). Chưa có gì thay đổi; chọn lại rồi lưu.`,
        );
        return;
      }
      setError(problemMessage(e));
    }
  };

  return (
    <Dialog open={Boolean(member)} onOpenChange={(next) => !next && !setRoles.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Đổi vai trò</DialogTitle>
          {current && (
            <DialogDescription>
              <strong className="text-foreground">{current.fullName}</strong> · {current.email}
            </DialogDescription>
          )}
        </DialogHeader>
        {error && <AlertMessage severity="warning">{error}</AlertMessage>}
        <div className="max-h-72 overflow-y-auto rounded-md border p-1">
          <RoleChecklist
            roles={roles}
            value={roleIds}
            onChange={(ids) => {
              setRoleIds(ids);
              setFieldError(undefined);
            }}
          />
        </div>
        {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={setRoles.isPending}>
            Huỷ
          </Button>
          <Button onClick={save} disabled={setRoles.isPending}>
            {setRoles.isPending ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
