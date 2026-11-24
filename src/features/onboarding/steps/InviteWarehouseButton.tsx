import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRoles } from '@/api/identity.api';
import { useCan } from '@/hooks/usePermission';
import { PERMISSIONS } from '@/utils/permissions';
import { InviteStaffDialog } from '@/features/identity/InviteStaffDialog';
import { WAREHOUSE_ROLE_ID } from '@/features/identity/shared';

/**
 * "Mời nhân viên kho" ngay trong wizard (design v2.html s5, s7; Thành chốt 24/11/2026 cách A): vai trò cố định Nhân viên
 * kho, mời xong ở lại bước. Người không có quyền quản lý nhân viên thì không thấy nút.
 */
export function InviteWarehouseButton() {
  const can = useCan();
  const [open, setOpen] = useState(false);
  const roles = useRoles();
  if (!can(PERMISSIONS.staffManage)) return null;
  const name = roles.data?.find((r) => r.id === WAREHOUSE_ROLE_ID)?.name ?? 'Nhân viên kho';
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <UserPlus />
        Mời nhân viên kho
      </Button>
      <InviteStaffDialog
        open={open}
        roles={roles.data ?? []}
        onClose={() => setOpen(false)}
        fixedRole={{
          id: WAREHOUSE_ROLE_ID,
          name,
          hint: 'Gửi link này cho người đếm hàng. Họ tạo tài khoản, đăng nhập thì vào thẳng bước Tồn đầu kỳ để đếm và gửi duyệt; bạn duyệt để ghi sổ.',
        }}
      />
    </>
  );
}
