import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { docRefPath } from '@/router/routes';
import type { DocRef } from '@/types/inventory';

export function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

/** Link tới chứng từ gốc hoặc chứng từ sinh tiếp */
export function DocLink({ companyId, docRef }: { companyId: string; docRef: DocRef }) {
  const to = docRefPath(companyId, docRef);
  if (!to) return <span>{docRef.number}</span>;
  return (
    <Link className="text-primary underline-offset-4 hover:underline" to={to}>
      {docRef.number}
    </Link>
  );
}

/** Lỗi tải phiếu hoặc không có quyền: hiện thông báo kèm nút về danh sách */
export function PageError({ message, severity = 'error', onBack }: { message: string; severity?: 'error' | 'warning'; onBack: () => void }) {
  return (
    <div className="grid justify-items-start gap-4">
      <AlertMessage severity={severity}>{message}</AlertMessage>
      <Button variant="outline" onClick={onBack}>
        <ArrowLeft />
        Về danh sách
      </Button>
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

/** Chặn rời trang khi form còn thay đổi chưa lưu (trình duyệt đóng tab, tải lại) */
export function beforeUnloadGuard(active: boolean) {
  if (!active) return undefined;
  const handler = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}
