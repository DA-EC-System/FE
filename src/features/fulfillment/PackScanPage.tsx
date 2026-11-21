import { useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Badge } from '@/components/ui/badge';
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
import { expectedScans, matchScan, packPayload, scanKey, scanProgress, scannedOfLine } from './packScan';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { usePageGuide } from '@/guides/usePageGuide';

/** Quét đóng gói: quét (hoặc gõ) SKU từng món tới khi đủ, rồi đóng kiện */
export function PackScanPage() {
  const { packageId = '' } = useParams();
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const actor = useTransitionActor();
  const query = usePackage(packageId);
  useBreadcrumb(query.data?.code);
  const command = usePackageCommand();
  // Kiện sàn: chọn đơn vị vận chuyển sàn cho phép, mặc định theo sàn (§19.3)
  const carriers = usePackageCarriers(packageId, query.data?.source === 'marketplace');
  const [carrier, setCarrier] = useState<string | null>(null);
  const [scanned, setScanned] = useState<Record<string, number>>({});
  const [input, setInput] = useState('');
  const [message, setMessage] = useState<{ severity: 'error' | 'warning'; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { startTour } = usePageGuide('pack-scan', { ready: Boolean(query.data) });
  const location = useLocation();
  // Giữ nơi quay về của chi tiết kiện (vd chi tiết đơn) khi quay lại từ trang quét
  const toDetail = () => navigate(ROUTES.company.package(companyId, packageId), { state: location.state });

  if (query.isLoading) return <PageLoading />;
  if (query.isError || !query.data) return <PageError message={problemMessage(query.error)} onBack={toDetail} />;
  const p = query.data;
  if (!packageButtons(p, actor).actions.includes('pack')) {
    return <PageError severity="warning" message={`Kiện hàng ${p.code} không còn ở trạng thái chờ đóng gói`} onBack={toDetail} />;
  }

  // Đếm theo biến thể (dòng đã ghép) và theo id dòng ("không quản tồn"); dòng chưa ghép SKU không quét (packScan.ts)
  const expected = expectedScans(p.lines);
  const { total: totalToScan, scanned: scannedQty, complete, percent } = scanProgress(p.lines, scanned);
  const carrierItems = p.source === 'marketplace' ? (carriers.data?.items ?? []) : [];
  const carrierCode = carrier ?? carrierItems.find((c) => c.isDefault)?.code ?? null;
  const needsCarrier = p.source === 'marketplace' && (carriers.isPending || carriers.isError || (carrierItems.length > 0 && !carrierCode));

  const scan = () => {
    const code = input.trim().toUpperCase();
    setInput('');
    inputRef.current?.focus();
    if (!code) return;
    const match = matchScan(p.lines, scanned, code);
    if (match.kind === 'not_found') return setMessage({ severity: 'error', text: `Mã ${code} không thuộc kiện hàng này` });
    if (match.kind === 'unmapped') return setMessage({ severity: 'warning', text: `${match.line.sku} chưa liên kết SKU, không cần quét` });
    if (match.kind === 'full') return setMessage({ severity: 'warning', text: `${match.line.sku} đã quét đủ ${match.quantity}, không cần quét thêm` });
    setMessage(null);
    setScanned({ ...scanned, [match.key]: (scanned[match.key] ?? 0) + 1 });
  };

  /** Dòng "không quản tồn" thường không có mã vạch: kho bấm khi đã cho đủ vào hộp */
  const putInBox = (key: string) => {
    setMessage(null);
    setScanned({ ...scanned, [key]: expected.get(key) ?? 0 });
    inputRef.current?.focus();
  };

  const pack = async () => {
    try {
      await command.mutateAsync({
        id: p.id,
        version: p.version,
        command: {
          kind: 'pack',
          ...packPayload(p.lines, scanned),
          ...(carrierCode ? { carrierCode } : {}),
        },
      });
      toast.success(`Đã đóng gói kiện hàng ${p.code}`);
      toDetail();
    } catch (e) {
      const problem = getProblem(e);
      if (problem?.code === 'version_conflict') {
        // Trang xoá số đã quét nên câu lỗi chung ("Chưa có gì thay đổi") không đúng ở đây
        setScanned({});
        return setMessage({ severity: 'error', text: 'Kiện hàng vừa được người khác cập nhật. Số đã quét đã bị xoá, hãy quét lại từ đầu.' });
      }
      setMessage({ severity: 'error', text: problemMessage(e) });
    }
  };

  return (
    <div className="grid gap-4">
      <PageHeader
        title={`Đóng gói kiện hàng ${p.code}`}
        subtitle={`Đơn ${p.order.code} · ${p.totalQty} món`}
        help="Quét từng sản phẩm hoặc gõ SKU (SKU kho hoặc SKU sàn) rồi Enter. Mã không có trong kiện hay quét thừa sẽ báo ngay. Dòng Không quản lý tồn quét SKU sàn hoặc bấm Đã cho vào hộp. Đủ số lượng mọi dòng thì bấm được nút Đóng gói."
        onTour={startTour}
        action={
          <Button variant="outline" onClick={toDetail}>
            Về kiện hàng
          </Button>
        }
      />
      <Card className="py-4">
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-2"
            data-guide="scan-input"
            onSubmit={(e) => {
              e.preventDefault();
              scan();
            }}
          >
            <div className="grid flex-1 gap-1.5">
              <Label htmlFor="scan-sku">Quét SKU</Label>
              <Input
                id="scan-sku"
                ref={inputRef}
                autoFocus
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Quét mã vạch hoặc gõ SKU rồi Enter"
                className="h-14 font-mono text-lg md:text-lg"
              />
            </div>
            <Button type="submit" variant="outline" size="lg" className="h-14">
              Ghi nhận
            </Button>
            <Button type="button" variant="ghost" size="lg" className="h-14" onClick={() => setScanned({})}>
              Quét lại từ đầu
            </Button>
          </form>
          {message && (
            <AlertMessage severity={message.severity} className="mt-3" onClose={() => setMessage(null)}>
              {message.text}
            </AlertMessage>
          )}
        </CardContent>
      </Card>
      <Card className="py-4" data-guide="pack-lines">
        <CardHeader className="grid gap-2">
          <CardTitle className="text-base">Sản phẩm trong kiện</CardTitle>
          <div className="grid gap-1" data-testid="pack-progress">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>
                Đã quét {scannedQty}/{totalToScan} món
              </span>
              <span className="font-mono">{percent}%</span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Tiến độ quét"
              aria-valuemin={0}
              aria-valuemax={totalToScan}
              aria-valuenow={scannedQty}
            >
              <div className={cn('h-full transition-all', complete ? 'bg-success' : 'bg-primary')} style={{ width: `${percent}%` }} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table data-testid="pack-lines">
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">SKU</TableHead>
                <TableHead>Sản phẩm</TableHead>
                <TableHead>Phân loại</TableHead>
                <TableHead className="w-48 text-right">Đã quét</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.lines.map((l, index) => {
                const n = scannedOfLine(p.lines, scanned, index);
                const key = scanKey(l);
                return (
                  <TableRow key={l.id} data-row-id={l.sku} className={cn(n === l.quantity && 'bg-success/10')}>
                    <TableCell>
                      <p className="font-mono font-medium">{l.sku}</p>
                      {l.variantId && l.externalSku && l.externalSku !== l.sku && (
                        <p className="font-mono text-xs text-muted-foreground">SKU sàn {l.externalSku}</p>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {l.productName}
                      {l.untracked && (
                        <Badge variant="secondary" className="ms-2">
                          Không quản lý tồn
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{l.attributesLabel || '—'}</TableCell>
                    <TableCell className="text-right">
                      {n === null ? (
                        'Chưa liên kết SKU'
                      ) : (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {l.untracked && key && n < l.quantity && (
                            <Button type="button" size="sm" variant="outline" onClick={() => putInBox(key)}>
                              Đã cho vào hộp
                            </Button>
                          )}
                          {`${n}/${l.quantity}`}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {p.source === 'marketplace' && (carrierItems.length > 0 || carriers.isError) && (
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
          <div className="mt-4 flex justify-end" data-guide="pack-submit">
            <Button disabled={!complete || needsCarrier || command.isPending} onClick={pack}>
              Đóng gói
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
