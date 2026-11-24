import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertMessage } from '@/components/common/AlertMessage';
import { useFinanceWrite } from '@/api/financeLifecycle.api';
import { useShops } from '@/api/shops.api';
import { useCan } from '@/hooks/usePermission';
import { PERMISSIONS } from '@/utils/permissions';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import type { ConfigKind, CreateFinanceConfig, FinanceConfig } from '@/types/finance';
import { HelpTip } from '@/components/common/HelpTip';
import { CONFIG_KINDS, PAYLOAD_FIELDS, PAYLOAD_HINTS, REGIMES, todayVn, validateConfig } from './lifecycleShared';
import { shopDisplayName } from '@/features/channel/shopList';

const selectClass = 'h-10 w-full rounded-md border bg-background px-3 text-sm';
export function FinanceConfigForm({ existing, correction = false, onClose, onSaved }: {
  existing?: FinanceConfig; correction?: boolean; onClose: () => void; onSaved: (config: FinanceConfig) => void;
}) {
  const editing = Boolean(existing && !correction); const [kind, setKind] = useState<ConfigKind>(existing?.kind ?? 'fee');
  const [shopId, setShopId] = useState(existing?.shopId ?? ''); const [effectiveFrom, setFrom] = useState(existing?.effectiveFrom ?? todayVn());
  const [retroactiveFrom, setRetroactiveFrom] = useState(existing?.effectiveFrom ?? todayVn());
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(existing?.payload ?? {}).map(([key, value]) => [key, Array.isArray(value) ? value.join(',') : String(value)])));
  const [errors, setErrors] = useState<Record<string, string>>({}); const [error, setError] = useState('');
  const shops = useShops({ enabled: useCan()(PERMISSIONS.shopView) });
  const save = useFinanceWrite<FinanceConfig, CreateFinanceConfig | { version: number; payload: Record<string, unknown>; effectiveFrom: string }>(editing ? 'put' : 'post', editing ? `/finance/configs/${existing!.id}` : '/finance/configs');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    const payload = Object.fromEntries(Object.keys(PAYLOAD_FIELDS[kind]).map((key) => {
      const value = values[key] ?? '';
      return [key, key === 'regime' ? value : key === 'milestones' ? (value.trim() ? value.split(',').map((v) => v.trim() ? Number(v) : NaN) : []) : value.trim() ? Number(value) : NaN];
    }));
    const input: CreateFinanceConfig = { kind, ...(kind === 'fee' ? { shopId } : {}), payload, effectiveFrom,
      ...(correction ? { isCorrection: true, supersedesId: existing!.id, retroactiveFrom } : {}) };
    const next = validateConfig(input, correction ? existing!.effectiveFrom : null); setErrors(next); if (Object.keys(next).length) return;
    try { const result = await save.mutateAsync(editing ? { version: existing!.version, payload, effectiveFrom } : input); toast.success('Đã lưu bản nháp'); onSaved(result); }
    catch (e) { setError(problemMessage(e)); setErrors(getProblem(e)?.errors ?? {}); }
  };
  return <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader>
    <DialogTitle>{editing ? 'Sửa bản nháp' : correction ? 'Bản điều chỉnh hồi tố' : 'Thêm phiên bản cấu hình'}</DialogTitle><DialogDescription>Lưu nháp, tính thử rồi gửi duyệt.</DialogDescription>
    </DialogHeader><form onSubmit={(e) => void submit(e)} className="grid gap-4">
    <div><Label htmlFor="config-kind">Loại cấu hình</Label><select id="config-kind" className={selectClass} disabled={Boolean(existing)} value={kind} onChange={(e) => { setKind(e.target.value as ConfigKind); setValues({}); setErrors({}); }}>{Object.entries(CONFIG_KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    {kind === 'fee' && <div><Label htmlFor="config-shop">Gian hàng</Label><select id="config-shop" className={selectClass} value={shopId} disabled={Boolean(existing) || shops.isLoading} onChange={(e) => setShopId(e.target.value)}><option value="">{shops.isLoading ? 'Đang tải gian hàng…' : 'Chọn gian hàng'}</option>{(shops.data?.items ?? []).map((s) => <option value={s.id} key={s.id}>{shopDisplayName(s)}</option>)}</select>{errors.shopId && <p className="text-sm text-destructive">{errors.shopId}</p>}</div>}
    <div><Label htmlFor="effective-from">Ngày hiệu lực</Label><Input id="effective-from" type="date" value={effectiveFrom} disabled={correction} onChange={(e) => setFrom(e.target.value)} />{correction && <p className="text-xs text-muted-foreground">Phiên bản điều chỉnh giữ nguyên ngày hiệu lực của phiên bản bị điều chỉnh.</p>}{errors.effectiveFrom && <p className="text-destructive">{errors.effectiveFrom}</p>}</div>
    {correction && <div><Label htmlFor="retroactive-from">Điều chỉnh hồi tố từ ngày</Label><Input id="retroactive-from" type="date" value={retroactiveFrom} onChange={(e) => setRetroactiveFrom(e.target.value)} />{errors.retroactiveFrom && <p className="text-destructive">{errors.retroactiveFrom}</p>}</div>}
    {Object.entries(PAYLOAD_FIELDS[kind]).map(([key, label]) => <div key={key}><div className="flex items-center gap-1"><Label htmlFor={`payload-${key}`}>{label}</Label>{PAYLOAD_HINTS[key] && <HelpTip topic={label} content={PAYLOAD_HINTS[key]} />}</div>
      {key === 'regime' ? <select id={`payload-${key}`} className={selectClass} value={values[key] ?? ''} onChange={(e) => setValues({ ...values, [key]: e.target.value })}><option value="">Chọn loại hình kinh doanh</option>{Object.entries(REGIMES).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select>
        : <Input id={`payload-${key}`} inputMode="decimal" value={values[key] ?? ''} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />}
      {errors[`payload.${key}`] && <p className="text-sm text-destructive">{errors[`payload.${key}`]}</p>}</div>)}
    {kind === 'fee' && <p className="text-xs text-muted-foreground">Các khoản phí sàn hạch toán vào chi phí bán hàng (TK 641 theo Thông tư 200, TK 6421 theo Thông tư 133).</p>}
    {error && <AlertMessage severity="error">{error}</AlertMessage>}
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>Đóng</Button><Button disabled={save.isPending} type="submit">Lưu nháp</Button></div>
  </form></DialogContent></Dialog>;
}
