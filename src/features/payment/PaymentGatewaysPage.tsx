import { useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { CopyButton } from '@/components/common/CopyButton';
import { PasswordInput } from '@/components/common/PasswordInput';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useGateways, useSaveGateway } from '@/api/payment.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { formatDateTime } from '@/utils/format';
import type { Gateway, GatewayAvailability } from '@/types/payment';
import { GATEWAY_LABELS } from '@/features/sales/shared';

const GATEWAYS: Gateway[] = ['vnpay', 'momo', 'zalopay', 'vietqr'];

/** Các ô khoá của từng cổng (Documents/21 mục 12.8); secret là ô ẩn ký tự */
const FIELDS: Record<Gateway, { name: string; label: string; secret: boolean }[]> = {
  vnpay: [
    { name: 'tmnCode', label: 'Mã website (TMN Code)', secret: true },
    { name: 'hashSecret', label: 'Chuỗi bí mật (Hash Secret)', secret: true },
  ],
  momo: [
    { name: 'partnerCode', label: 'Partner Code', secret: true },
    { name: 'accessKey', label: 'Access Key', secret: true },
    { name: 'secretKey', label: 'Secret Key', secret: true },
  ],
  zalopay: [
    { name: 'appId', label: 'App ID', secret: true },
    { name: 'key1', label: 'Key 1', secret: true },
    { name: 'key2', label: 'Key 2', secret: true },
  ],
  vietqr: [
    { name: 'bankBin', label: 'Mã ngân hàng (BIN)', secret: false },
    { name: 'accountNo', label: 'Số tài khoản', secret: true },
    { name: 'accountName', label: 'Chủ tài khoản', secret: false },
    { name: 'sepayApiKey', label: 'API key SePay', secret: true },
  ],
};

function GatewayCard({ config, onEdit }: { config: GatewayAvailability; onEdit: () => void }) {
  const g = config.gateway;
  return (
    <Card className="py-4" data-testid={`gateway-${g}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{GATEWAY_LABELS[g]}</CardTitle>
        <Badge variant={config.configured ? 'success' : 'secondary'}>
          {config.configured ? 'Đã cấu hình' : 'Chưa cấu hình'}
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {config.configured && config.credentials && (
          <dl className="grid gap-1">
            {FIELDS[g].map((f) => (
              <div key={f.name} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{f.label}</dt>
                <dd className="font-mono">••••{config.credentials?.[f.name]?.last4 ?? ''}</dd>
              </div>
            ))}
          </dl>
        )}
        {g === 'vietqr' && config.display && (
          <p>
            {config.display.bankName} · {config.display.accountName}
          </p>
        )}
        {g === 'vietqr' && config.webhookUrl && (
          <div className="grid gap-1">
            <Label>URL webhook</Label>
            <div className="flex items-center gap-1">
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs" data-testid="webhook-url">
                {config.webhookUrl}
              </code>
              <CopyButton value={config.webhookUrl} label="Sao chép URL webhook" />
            </div>
            <p className="text-xs text-muted-foreground">Dán URL này vào SePay để nhận báo có tiền về.</p>
          </div>
        )}
        {config.updatedAt && (
          <p className="text-xs text-muted-foreground">
            Cập nhật {formatDateTime(config.updatedAt)}
            {config.updatedBy && ` bởi ${config.updatedBy.name}`}
          </p>
        )}
        <Button type="button" variant="outline" className="justify-self-start" onClick={onEdit}>
          <KeyRound />
          {config.configured ? 'Thay khoá' : 'Cấu hình'}
        </Button>
      </CardContent>
    </Card>
  );
}

/** UC-PF-01 — Khoá cổng thanh toán của công ty. Không bao giờ hiện lại khoá đầy đủ. */
export function PaymentGatewaysPage() {
  const query = useGateways();
  const saveMut = useSaveGateway();
  const [editing, setEditing] = useState<Gateway | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const configOf = (g: Gateway) => query.data?.find((c) => c.gateway === g);

  const openEdit = (g: Gateway) => {
    // Form luôn trống: không đổ khoá cũ (T4)
    setValues({});
    setErrors({});
    setFormError(null);
    setEditing(g);
  };

  const save = async () => {
    if (!editing) return;
    const credentials = Object.fromEntries(FIELDS[editing].map((f) => [f.name, (values[f.name] ?? '').trim()]));
    const missing = Object.fromEntries(
      Object.entries(credentials)
        .filter(([, v]) => !v)
        .map(([k]) => [k, 'Bắt buộc nhập']),
    );
    if (Object.keys(missing).length > 0) {
      setErrors(missing);
      return;
    }
    setErrors({});
    setFormError(null);
    try {
      await saveMut.mutateAsync({ gateway: editing, credentials, version: configOf(editing)?.version ?? 0 });
      toast.success(`Đã lưu khoá cổng ${GATEWAY_LABELS[editing]}`);
      setEditing(null);
    } catch (e) {
      const problem = getProblem(e);
      if (problem?.code === 'version_conflict') {
        // Hook đã tải lại danh sách cổng; lưu lần nữa sẽ dùng phiên bản mới
        setFormError('Khoá vừa được người khác đổi. Đã tải lại, kiểm tra rồi lưu lại nếu vẫn muốn thay.');
      } else if (problem?.errors) {
        setErrors(
          Object.fromEntries(Object.entries(problem.errors).map(([k, v]) => [k.replace(/^credentials\./, ''), v])),
        );
      } else {
        setFormError(problemMessage(e));
      }
    }
  };

  return (
    <div>
      <PageHeader
        title="Cổng thanh toán"
        subtitle="Khoá được mã hoá khi lưu và không hiện lại. Chỉ dùng khoá sandbox trong môi trường thử."
      />
      {query.isError && (
        <AlertMessage severity="error" className="mb-4">
          {problemMessage(query.error)}
        </AlertMessage>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {query.isLoading
          ? GATEWAYS.map((g) => <Skeleton key={g} className="h-48 w-full" />)
          : GATEWAYS.map((g) => (
              <GatewayCard key={g} config={configOf(g) ?? { gateway: g, configured: false }} onEdit={() => openEdit(g)} />
            ))}
      </div>

      <Dialog open={editing !== null} onOpenChange={(v) => !v && !saveMut.isPending && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          {editing && (
            <form
              noValidate
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <DialogHeader>
                <DialogTitle>Khoá cổng {GATEWAY_LABELS[editing]}</DialogTitle>
                <DialogDescription>
                  Nhập đủ các ô. Khoá cũ không hiện lại; lưu sẽ thay toàn bộ khoá hiện có.
                </DialogDescription>
              </DialogHeader>
              {formError && <AlertMessage severity="error">{formError}</AlertMessage>}
              {FIELDS[editing].map((f) => {
                const id = `cred-${f.name}`;
                const common = {
                  id,
                  autoComplete: 'off',
                  value: values[f.name] ?? '',
                  'aria-invalid': Boolean(errors[f.name]),
                  disabled: saveMut.isPending,
                  onChange: (e: ChangeEvent<HTMLInputElement>) =>
                    setValues((v) => ({ ...v, [f.name]: e.target.value })),
                };
                return (
                  <div key={f.name} className="grid gap-1.5">
                    <Label htmlFor={id}>{f.label}</Label>
                    {f.secret ? <PasswordInput {...common} /> : <Input {...common} />}
                    {errors[f.name] && <p className="text-sm text-destructive">{errors[f.name]}</p>}
                  </div>
                );
              })}
              <DialogFooter>
                <Button type="button" variant="outline" disabled={saveMut.isPending} onClick={() => setEditing(null)}>
                  Huỷ
                </Button>
                <Button type="submit" disabled={saveMut.isPending}>
                  {saveMut.isPending ? 'Đang lưu...' : 'Lưu khoá'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
