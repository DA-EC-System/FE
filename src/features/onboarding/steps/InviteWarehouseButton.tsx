import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRoles } from '@/api/identity.api';
import { useCan } from '@/hooks/usePermission';
import { useAuthStore } from '@/stores/authStore';
import { PERMISSIONS } from '@/utils/permissions';
import { ROUTES } from '@/router/routes';
import { cn } from '@/lib/utils';
import { InviteStaffDialog } from '@/features/identity/InviteStaffDialog';
import { WAREHOUSE_ROLE_ID } from '@/features/identity/shared';
import { markWelcome } from '@/features/company/welcomeFlow';

/**
 * "Mời nhân viên kho" ngay trong wizard (bước 5 và 7; design v2.html s5, s7; Thành chốt 24/11/2026 cách A): vai trò cố
 * định Nhân viên kho, mời xong ở lại bước. Người nhận link tạo tài khoản rồi gửi yêu cầu tham gia, cần được duyệt ở tab
 * "Yêu cầu tham gia" của trang Nhân viên (trang này mở được cả lúc bị ép về wizard). `showRequests`: thêm link tới tab
 * đó. Người không có quyền quản lý nhân viên thì không thấy gì, cả câu dẫn `label`.
 */
export function InviteWarehouseActions({
  label,
  showRequests = false,
  className,
}: {
  label: string;
  showRequests?: boolean;
  className?: string;
}) {
  const can = useCan();
  const companyId = useAuthStore((s) => s.companyContext?.companyId ?? '');
  const [open, setOpen] = useState(false);
  const allowed = can(PERMISSIONS.staffManage);
  const roles = useRoles();
  if (!allowed) return null;
  const name = roles.data?.find((r) => r.id === WAREHOUSE_ROLE_ID)?.name ?? 'Nhân viên kho';
  return (
    <div className={cn('flex flex-wrap items-center gap-2 text-sm', className)}>
      <span>{label}</span>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <UserPlus />
        Mời nhân viên kho
      </Button>
      {showRequests && (
        <Link
          to={`${ROUTES.company.staff(companyId)}?tab=pending`}
          // Dấu "đến từ wizard": trang Nhân viên hiện thanh quay lại hướng dẫn
          onClick={() => markWelcome(companyId)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Duyệt yêu cầu tham gia
        </Link>
      )}
      <InviteStaffDialog
        open={open}
        roles={roles.data ?? []}
        onClose={() => setOpen(false)}
        fixedRole={{
          id: WAREHOUSE_ROLE_ID,
          name,
          hint: 'Gửi link này cho người đếm hàng. Họ tạo tài khoản và gửi yêu cầu tham gia; bạn duyệt yêu cầu ở trang Nhân viên, tab Yêu cầu tham gia. Được duyệt rồi, họ đăng nhập là vào thẳng bước Tồn đầu kỳ để đếm và gửi duyệt; bạn duyệt phiếu để ghi sổ.',
        }}
      />
    </div>
  );
}
