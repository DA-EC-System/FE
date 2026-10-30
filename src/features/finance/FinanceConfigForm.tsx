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
import { CONFIG_KINDS, PAYLOAD_FIELDS, todayVn, validateConfig } from './lifecycleShared';

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
    const next = validateConfig(input); setErrors(next); if (Object.keys(next).length) return;
    try { const result = await save.mutateAsync(editing ? { version: existing!.version, payload, effectiveFrom } : input); toast.success('Đã lưu bản nháp'); onSaved(result); }
    catch (e) { setError(problemMessage(e)); setErrors(getProblem(e)?.errors ?? {}); }
  };
  return <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader>
    <DialogTitle>{editing ? 'Sửa bản nháp' : correction ? 'Bản sửa lỗi hồi tố' : 'Soạn phiên bản cấu hình'}</DialogTitle><DialogDescription>Lưu nháp, chạy thử rồi gửi người có quyền duyệt.</DialogDescription>
    </DialogHeader><form onSubmit={(e) => void submit(e)} className="grid gap-4">
    <div><Label htmlFor="config-kind">Loại cấu hình</Label><select id="config-kind" className={selectClass} disabled={Boolean(existing)} value={kind} onChange={(e) => { setKind(e.target.value as ConfigKind); setValues({}); setErrors({}); }}>{Object.entries(CONFIG_KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    {kind === 'fee' && <div><Label htmlFor="config-shop">Gian hàng</Label><select id="config-shop" className={selectClass} value={shopId} disabled={Boolean(existing)} onChange={(e) => setShopId(e.target.value)}><option value="">Chọn gian hàng</option>{(shops.data?.items ?? []).map((s) => <option value={s.id} key={s.id}>{s.shopName}</option>)}</select>{errors.shopId && <p className="text-sm text-destructive">{errors.shopId}</p>}</div>}
    <div><Label htmlFor="effective-from">Ngày hiệu lực</Label><Input id="effective-from" type="date" value={effectiveFrom} onChange={(e) => setFrom(e.target.value)} />{errors.effectiveFrom && <p className="text-destructive">{errors.effectiveFrom}</p>}</div>
    {correction && <div><Label htmlFor="retroactive-from">Điều chỉnh hồi tố từ ngày</Label><Input id="retroactive-from" type="date" value={retroactiveFrom} onChange={(e) => setRetroactiveFrom(e.target.value)} />{errors.retroactiveFrom && <p className="text-destructive">{errors.retroactiveFrom}</p>}</div>}
    {Object.entries(PAYLOAD_FIELDS[kind]).map(([key, label]) => <div key={key}><Label htmlFor={`payload-${key}`}>{label}</Label>
      {key === 'regime' ? <select id={`payload-${key}`} className={selectClass} value={values[key] ?? ''} onChange={(e) => setValues({ ...values, [key]: e.target.value })}><option value="">Chọn loại hình</option><option value="company">Doanh nghiệp</option><option value="household">Hộ kinh doanh</option><option value="individual">Cá nhân</option></select>
        : <Input id={`payload-${key}`} inputMode="decimal" value={values[key] ?? ''} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />}
      {errors[`payload.${key}`] && <p className="text-sm text-destructive">{errors[`payload.${key}`]}</p>}</div>)}
    {error && <AlertMessage severity="error">{error}</AlertMessage>}
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>Đóng</Button><Button disabled={save.isPending} type="submit">Lưu nháp</Button></div>
  </form></DialogContent></Dialog>;
}
