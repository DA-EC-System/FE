import type { ReactNode } from 'react';
import { ShieldCheck, TriangleAlert } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';

interface SecondPersonDialogProps {
  open: boolean;
  /** Ví dụ "Duyệt đề nghị nhập PR-0012" */
  title: string;
  /** Người lập chứng từ */
  createdByName: string;
  /** Vai của người phải khác, ví dụ "Người gửi" hay "Người lập đề nghị" */
  ownerLabel?: string;
  /** Người duyệt chính là người lập và được tự duyệt (`check()` trả `selfApproved`) */
  selfApproval?: boolean;
  /** Tóm tắt chứng từ để người duyệt soát lại */
  children?: ReactNode;
  confirmLabel?: string;
  loading?: boolean;
  /** Lỗi từ API, nơi gọi tự đặt (ví dụ 409 second_person_required) */
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Hộp duyệt của bước cần người thứ hai, dùng chung cho mọi chứng từ (Documents/19, 25 §11).
 * Nói rõ ai lập; khi tự duyệt (CEO, công ty một người) thì cảnh báo nhật ký sẽ ghi lại.
 */
export function SecondPersonDialog({
  open,
  title,
  createdByName,
  ownerLabel = 'Người lập',
  selfApproval = false,
  children,
  confirmLabel = 'Duyệt',
  loading,
  error,
  onConfirm,
  onClose,
}: SecondPersonDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      title={title}
      confirmLabel={confirmLabel}
      loading={loading}
      onConfirm={onConfirm}
      onClose={onClose}
      message={
        <div className="grid gap-3 text-sm" data-testid="second-person-dialog">
          {selfApproval ? (
            <p className="flex gap-2 rounded-md bg-warning-soft px-3 py-2 text-warning" data-testid="self-approval">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                Bạn đang tự duyệt chứng từ do chính mình lập. Bạn được phép vì là CEO hoặc công ty chỉ có một người;
                nhật ký ghi lại đây là tự duyệt.
              </span>
            </p>
          ) : (
            <p className="flex gap-2 text-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
              <span>
                {ownerLabel}: <b>{createdByName}</b>. Bạn là người thứ hai kiểm và duyệt.
              </span>
            </p>
          )}
          {children}
          {error && <AlertMessage severity="error">{error}</AlertMessage>}
        </div>
      }
    />
  );
}
