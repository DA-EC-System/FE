import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, PackageCheck, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePackage, usePackageCarriers, usePackageCommand } from '@/api/fulfillment.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { PageError, PageLoading } from '@/features/purchasing/parts';
import { useAuth } from '@/hooks/useAuth';
import { useTransitionActor } from '@/hooks/usePermission';
import { ROUTES } from '@/router/routes';
import { cn } from '@/lib/utils';
import { packageButtons } from './shared';

/** Quét đóng gói: quét (hoặc gõ) SKU từng món tới khi đủ, rồi đóng kiện */
export function PackScanPage() {
  const { packageId = '' } = useParams();
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const actor = useTransitionActor();
  const query = usePackage(packageId);
  const command = usePackageCommand();
  // Kiện sàn: chọn đơn vị vận chuyển sàn cho phép, mặc định theo sàn (§19.3)
  const carriers = usePackageCarriers(packageId, query.data?.source === 'marketplace');
  const [carrier, setCarrier] = useState<string | null>(null);
  const [scanned, setScanned] = useState<Record<string, number>>({});
  const [input, setInput] = useState('');
  const [message, setMessage] = useState<{ severity: 'error' | 'warning'; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toDetail = () => navigate(ROUTES.company.package(companyId, packageId));

  if (query.isLoading) return <PageLoading />;
  if (query.isError || !query.data) return <PageError message={problemMessage(query.error)} onBack={toDetail} />;
  const p = query.data;
  if (!packageButtons(p, actor).actions.includes('pack')) {
    return <PageError severity="warning" message={`Kiện ${p.code} không ở bước đóng gói`} onBack={toDetail} />;
  }

  const complete = p.lines.every((l) => (scanned[l.variantId] ?? 0) === l.quantity);
  const carrierItems = p.source === 'marketplace' ? (carriers.data?.items ?? []) : [];
  const carrierCode = carrier ?? carrierItems.find((c) => c.isDefault)?.code ?? null;
  const needsCarrier = p.source === 'marketplace' && !carrierCode;

  const scan = () => {
    const sku = input.trim().toUpperCase();
    setInput('');
    inputRef.current?.focus();
    if (!sku) return;
    const line = p.lines.find((l) => l.sku.toUpperCase() === sku);
    if (!line) return setMessage({ severity: 'error', text: `${sku} không có trong kiện` });
    const n = scanned[line.variantId] ?? 0;
    if (n >= line.quantity) return setMessage({ severity: 'warning', text: `${line.sku} đã đủ ${line.quantity}` });
    setMessage(null);
    setScanned({ ...scanned, [line.variantId]: n + 1 });
  };

  const pack = async () => {
    try {
      await command.mutateAsync({
        id: p.id,
        version: p.version,
        command: {
          kind: 'pack',
          lines: p.lines.map((l) => ({ variantId: l.variantId, quantity: scanned[l.variantId] ?? 0 })),
          ...(carrierCode ? { carrierCode } : {}),
        },
      });
      toast.success(`Đã đóng gói kiện ${p.code}`);
      toDetail();
    } catch (e) {
      const problem = getProblem(e);
      if (problem?.code === 'version_conflict') setScanned({});
      setMessage({ severity: 'error', text: problemMessage(e) });
    }
  };

  return (
    <div className="grid gap-4">
      <PageHeader
        title={`Đóng gói kiện ${p.code}`}
        subtitle={`Đơn ${p.order.code} · ${p.totalQty} món`}
        action={
          <Button variant="outline" onClick={toDetail}>
            <ArrowLeft />
            Về kiện
          </Button>
        }
      />
      <Card className="py-4">
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              scan();
            }}
          >
            <div className="grid flex-1 gap-1.5">
              <Label htmlFor="scan-sku">Quét SKU</Label>
              <Input id="scan-sku" ref={inputRef} autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder="Quét mã vạch hoặc gõ SKU rồi Enter" />
            </div>
            <Button type="submit" variant="outline">
              Thêm
            </Button>
            <Button type="button" variant="ghost" onClick={() => setScanned({})}>
              <RotateCcw />
              Quét lại
            </Button>
          </form>
          {message && (
            <AlertMessage severity={message.severity} className="mt-3" onClose={() => setMessage(null)}>
              {message.text}
            </AlertMessage>
          )}
        </CardContent>
      </Card>
      <Card className="py-4">
        <CardHeader>
          <CardTitle className="text-base">Hàng cần đóng</CardTitle>
        </CardHeader>
        <CardContent>
          <Table data-testid="pack-lines">
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">SKU</TableHead>
                <TableHead>Sản phẩm</TableHead>
                <TableHead>Thuộc tính</TableHead>
                <TableHead className="w-28 text-right">Đã quét</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.lines.map((l) => {
                const n = scanned[l.variantId] ?? 0;
                return (
                  <TableRow key={l.variantId} data-row-id={l.sku} className={cn(n === l.quantity && 'bg-success/10')}>
                    <TableCell className="font-medium">{l.sku}</TableCell>
                    <TableCell className="whitespace-normal">{l.productName}</TableCell>
                    <TableCell>{l.attributesLabel || '—'}</TableCell>
                    <TableCell className="text-right">
                      {n}/{l.quantity}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {p.source === 'marketplace' && (
            <div className="mt-4 grid gap-2" data-testid="pack-carrier">
              <Label>Đơn vị vận chuyển</Label>
              {carriers.isError && <AlertMessage severity="error">{problemMessage(carriers.error)}</AlertMessage>}
              <RadioGroup
                value={carrierCode ?? ''}
                onValueChange={setCarrier}
                aria-label="Đơn vị vận chuyển"
                className="flex flex-wrap gap-4"
              >
                {carrierItems.map((c) => (
                  <div key={c.code} className="flex items-center gap-2">
                    <RadioGroupItem id={`carrier-${c.code}`} value={c.code} />
                    <Label htmlFor={`carrier-${c.code}`} className="font-normal">
                      {c.name}
                      {c.isDefault && <span className="text-muted-foreground"> (mặc định)</span>}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <Button disabled={!complete || needsCarrier || command.isPending} onClick={pack}>
              <PackageCheck />
              Đóng gói
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
