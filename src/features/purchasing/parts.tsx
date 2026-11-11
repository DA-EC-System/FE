import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { codeMessage } from '@/api/problemMessages';
import { docRefPath } from '@/router/routes';
import type { OwnedRecord, StateMachine, TransitionOption } from '@/lib/stateMachine';
import type { DocRef } from '@/types/inventory';

export function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

/**
 * Khung chi tiết `.dt-grid` của Test_UI (FE#137): cột chính và cột Lịch sử rộng 300px bên phải.
 * Dưới 1100px hai cột xếp dọc. Chưa có lịch sử (phiếu mới) thì chỉ có cột chính.
 */
export function DetailGrid({ children, history }: { children: ReactNode; history?: ReactNode }) {
  if (!history) return <div className="grid min-w-0 gap-4">{children}</div>;
  return (
    <div className="grid items-start gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_300px]">
      <div className="grid min-w-0 gap-4">{children}</div>
      <Card className="py-4" data-guide="detail-history">
        <CardHeader>
          <CardTitle className="text-base">Lịch sử</CardTitle>
        </CardHeader>
        <CardContent>{history}</CardContent>
      </Card>
    </div>
  );
}

/** Thao tác duyệt: luôn hiện nút khi phiếu đang chờ duyệt, thiếu quyền thì nút mờ kèm lý do */
const APPROVAL_ACTIONS = new Set(['approve', 'approve_send']);
const APPROVAL_REASON: Record<string, string> = {
  forbidden: 'Bạn không có quyền này.',
  second_person_required: 'Người duyệt phải khác người soạn.',
};

/** Lý do nút bị khoá; nút duyệt dùng câu ngắn của Test_UI, nút khác giữ câu chung theo mã lỗi */
export function blockedText(action: string, code: string | null): string | null {
  if (!code) return null;
  return (APPROVAL_ACTIONS.has(action) && APPROVAL_REASON[code]) || codeMessage(code);
}

/**
 * Thêm nút duyệt mờ cho người thiếu quyền duyệt (máy trạng thái ẩn thao tác thiếu quyền).
 * Chỉ áp cho thao tác duyệt, không đổi quyền: bấm vẫn không được.
 */
export function withApprovalHint<S extends string, A extends string, R extends OwnedRecord>(
  machine: StateMachine<S, A, R>,
  from: S,
  options: TransitionOption<S, A, R>[],
): TransitionOption<S, A, R>[] {
  const shown = new Set<string>(options.map((o) => o.transition.action));
  const extra = machine.transitions
    .filter(
      (t) =>
        APPROVAL_ACTIONS.has(t.action) &&
        !t.system &&
        !shown.has(t.action) &&
        (Array.isArray(t.from) ? t.from : [t.from]).includes(from),
    )
    .map((t) => ({ transition: t, blocked: 'forbidden' }));
  return [...options, ...extra];
}

/**
 * Dòng chênh khi nhận hàng (`tr.chg` của Test_UI): báo giao khác số còn chờ, hoặc đạt ít hơn báo giao.
 * Dòng chưa giao lần này (báo giao 0) không tính chênh. Trả câu giải thích cho tooltip, không chênh thì null.
 */
export function receiptDiff(l: {
  outstanding: number;
  announced: number;
  accepted: number;
  defectKept: number;
  returnedOnSpot: number;
  short: number;
}): string | null {
  const parts: string[] = [];
  if (l.announced > 0 && l.announced !== l.outstanding) {
    parts.push(`NCC báo giao ${l.announced}, còn chờ ${l.outstanding}`);
  }
  if (l.defectKept > 0) parts.push(`lỗi giữ ${l.defectKept}`);
  if (l.returnedOnSpot > 0) parts.push(`trả tại chỗ ${l.returnedOnSpot}`);
  if (l.short > 0) parts.push(`thiếu ${l.short}`);
  if (!parts.length) return null;
  const text = parts.join(', ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/** Nhãn "Chênh" cạnh SKU, rê chuột hoặc Tab tới thì hiện giải thích */
export function DiffTag({ sku, note }: { sku: string; note: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          role="note"
          aria-label={`Chênh lệch ${sku}: ${note}`}
          data-testid="receipt-diff"
          className="ms-2 inline-flex cursor-help items-center rounded bg-warning-soft px-1.5 py-px text-[11px] font-normal whitespace-nowrap text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Chênh
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{note}</TooltipContent>
    </Tooltip>
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
