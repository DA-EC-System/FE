import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { ChevronDown, CircleCheck, QrCode, RefreshCw } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { CopyButton } from '@/components/common/CopyButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { useCreatePaymentLink, useGateways, useOrderPayment } from '@/api/payment.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useCan } from '@/hooks/usePermission';
import { PERMISSIONS } from '@/utils/permissions';
import { formatCurrency, formatDateTime } from '@/utils/format';
import type { Gateway, PaymentLink } from '@/types/payment';
import type { Order } from '@/types/sales';
import { GATEWAY_LABELS, LINK_STATUS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS, REFUND_LABELS } from './shared';
import { Info } from './Info';

const GATEWAYS: Gateway[] = ['vnpay', 'momo', 'zalopay', 'vietqr'];
/** Chưa có SSE (FE#15): hỏi lại trạng thái tiền mỗi 5 giây khi còn mã chờ trả */
const POLL_MS = 5000;

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/** Mã đang chờ trả: QR, link, chuyển khoản VietQR, đếm ngược (AC-P2, AC-P3) */
function ActiveLink({ link, remainingMs }: { link: PaymentLink; remainingMs: number }) {
  const bank = link.bankTransfer;
  return (
    <div className="grid gap-4 sm:grid-cols-[auto_1fr]" data-testid="active-link">
      <div className="justify-self-center rounded-md border bg-white p-3">
        <QRCodeSVG value={link.qrContent} size={176} aria-label={`QR thanh toán ${link.paymentCode}`} />
      </div>
      <div className="grid content-start gap-3">
        <Info label="Cổng">{GATEWAY_LABELS[link.gateway]}</Info>
        <Info label="Mã thanh toán">
          <span className="font-mono" data-testid="payment-code">{link.paymentCode}</span>
        </Info>
        <Info label="Số tiền">{formatCurrency(link.amount)}</Info>
        <Info label="Hết hạn sau">
          <span data-testid="countdown" className="font-mono">
            {countdown(remainingMs)}
          </span>
        </Info>
        {link.payUrl && <CopyButton value={link.payUrl} label="Sao chép link thanh toán" text="Sao chép link" />}
      </div>
      {bank && (
        <dl className="grid gap-2 rounded-md border p-3 text-sm sm:col-span-2" data-testid="bank-transfer">
          {(
            [
              ['Ngân hàng', bank.bankName, null],
              ['Số tài khoản', bank.accountNo, 'Sao chép số tài khoản'],
              ['Chủ tài khoản', bank.accountName, 'Sao chép chủ tài khoản'],
              ['Số tiền', String(link.amount), 'Sao chép số tiền'],
              ['Nội dung chuyển khoản', bank.content, 'Sao chép nội dung chuyển khoản'],
            ] as const
          ).map(([label, value, copyLabel]) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="flex items-center gap-1 font-medium">
                {label === 'Số tiền' ? formatCurrency(link.amount) : value}
                {copyLabel && <CopyButton value={value} label={copyLabel} />}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** UC-PF-11 — Trạng thái tiền và mã thanh toán của đơn tạo tay hoặc từ hộp thư */
export function PaymentPanel({ order }: { order: Order }) {
  const can = useCan();
  const canCreateLink = can(PERMISSIONS.paymentLinkCreate);
  const query = useOrderPayment(order.id, { pollMs: POLL_MS });
  const p = query.data;
  const createMut = useCreatePaymentLink(order.id);

  const [open, setOpen] = useState(false);
  const [gateway, setGateway] = useState<Gateway | ''>('');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [reusedNotice, setReusedNotice] = useState(false);
  const gateways = useGateways({ enabled: open && canCreateLink });

  const link = p?.activeLink ?? null;
  const now = useNow(Boolean(link));
  const remainingMs = link ? new Date(link.expiresAt).getTime() - now : 0;
  const linkLive = link !== null && remainingMs > 0;
  // Mã mới nhất đã hết hạn mà chưa có mã khác (AC-P4)
  const expired = p?.status === 'unpaid' && !linkLive && (link !== null || p.links[0]?.status === 'expired');
  const canIssue =
    canCreateLink && p?.method === 'prepaid' && p.status === 'unpaid' && order.status !== 'cancelled' && !linkLive;

  const openDialog = () => {
    setGateway('');
    setDialogError(null);
    setOpen(true);
  };

  const create = async () => {
    if (!gateway) {
      setDialogError('Chọn cổng thanh toán');
      return;
    }
    setDialogError(null);
    try {
      const { reused } = await createMut.mutateAsync(gateway);
      setOpen(false);
      setReusedNotice(reused);
      if (!reused) toast.success('Đã tạo mã thanh toán');
    } catch (e) {
      // Lỗi giữ hộp thoại mở để chọn cổng khác (AC-P5)
      const problem = getProblem(e);
      if (problem?.status === 409) setDialogError(problem.detail ?? problemMessage(e));
      else if (problem?.status === 422) setDialogError('Cổng này chưa được cấu hình');
      else if (problem?.status === 502) setDialogError('Cổng thanh toán đang lỗi, thử lại sau hoặc chọn cổng khác');
      else setDialogError(problemMessage(e));
    }
  };

  return (
    <Card className="py-4" data-testid="payment-panel">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Thanh toán</CardTitle>
        {p && (
          <div className="flex flex-wrap gap-1">
            <Badge variant={PAYMENT_STATUS[p.status].variant}>{PAYMENT_STATUS[p.status].label}</Badge>
            {p.refundStatus !== 'none' && <Badge variant="warning">{REFUND_LABELS[p.refundStatus]}</Badge>}
          </div>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        {query.isError && <AlertMessage severity="error">{problemMessage(query.error)}</AlertMessage>}
        {query.isLoading && <Skeleton className="h-24 w-full" />}
        {p && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Info label="Cách thanh toán">{PAYMENT_METHOD_LABELS[p.method]}</Info>
              <Info label="Số tiền">{formatCurrency(p.amount)}</Info>
            </div>

            {p.status === 'paid' && (
              <AlertMessage severity="success">
                <span className="flex items-center gap-2">
                  <CircleCheck className="size-4" />
                  Đã nhận tiền lúc {formatDateTime(p.paidAt)}
                </span>
              </AlertMessage>
            )}

            {reusedNotice && (
              <AlertMessage severity="info" onClose={() => setReusedNotice(false)}>
                Đơn đã có mã thanh toán còn hiệu lực
              </AlertMessage>
            )}

            {p.status === 'unpaid' && link && linkLive && <ActiveLink link={link} remainingMs={remainingMs} />}

            {expired && (
              <AlertMessage severity="warning">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>Mã đã hết hạn</span>
                  {canIssue && (
                    <Button type="button" size="sm" variant="outline" onClick={openDialog}>
                      <RefreshCw />
                      Tạo lại
                    </Button>
                  )}
                </div>
              </AlertMessage>
            )}

            {canIssue && !expired && (
              <Button type="button" className="justify-self-start" onClick={openDialog}>
                <QrCode />
                Tạo mã thanh toán
              </Button>
            )}

            {p.links.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="-ms-2 group">
                    <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" />
                    Lịch sử mã ({p.links.length})
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="grid gap-2 text-sm" data-testid="link-history">
                    {p.links.map((l) => (
                      <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                        <span>
                          <span className="font-mono">{l.paymentCode}</span>
                          <span className="text-muted-foreground"> · {GATEWAY_LABELS[l.gateway]} · {formatDateTime(l.createdAt)}</span>
                        </span>
                        <Badge variant={LINK_STATUS[l.status].variant}>{LINK_STATUS[l.status].label}</Badge>
                      </li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(v) => !createMut.isPending && setOpen(v)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tạo mã thanh toán</DialogTitle>
            <DialogDescription>Mã có hiệu lực trong thời gian giới hạn. Gửi QR hoặc link cho khách.</DialogDescription>
          </DialogHeader>
          {dialogError && <AlertMessage severity="error">{dialogError}</AlertMessage>}
          {gateways.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <RadioGroup
              value={gateway}
              onValueChange={(v) => setGateway(v as Gateway)}
              aria-label="Cổng thanh toán"
              className="gap-2"
            >
              {GATEWAYS.map((g) => {
                const configured = gateways.data?.find((x) => x.gateway === g)?.configured ?? false;
                return (
                  <div
                    key={g}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 has-disabled:opacity-60"
                  >
                    <span className="flex items-center gap-2">
                      <RadioGroupItem id={`gw-${g}`} value={g} disabled={!configured} />
                      <Label htmlFor={`gw-${g}`}>{GATEWAY_LABELS[g]}</Label>
                    </span>
                    {!configured && <span className="text-xs text-muted-foreground">Chưa cấu hình</span>}
                  </div>
                );
              })}
            </RadioGroup>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={createMut.isPending} onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button type="button" disabled={createMut.isPending} onClick={create}>
              {createMut.isPending ? 'Đang tạo...' : 'Tạo mã'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
