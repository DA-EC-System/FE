import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useFinanceWrite } from '@/api/financeLifecycle.api';
import { problemMessage } from '@/api/problemMessages';
import { bankRefSchema, reasonSchema } from './lifecycleShared';

/**
 * `confirmLabel`: chữ nút xác nhận, mặc định `title`. `successMessage`: toast khi xong, mặc định "<title> thành công".
 * `fieldLabel`: nhãn ô nhập, mặc định theo `field`.
 * `confirmMessage`: thân hộp khi không có ô nhập; không truyền mà có `description` thì chỉ hiện `description`.
 */
export function LifecycleActionDialog({ path, title, version, field, description, fieldLabel, confirmLabel, successMessage, confirmMessage, onDone, onClose }: {
  path: string; title: string; version?: number; field?: 'reason' | 'bankRef'; description?: string; fieldLabel?: string; confirmLabel?: string;
  successMessage?: string; confirmMessage?: string; onDone?: () => void; onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const mutation = useFinanceWrite<unknown, { version?: number; reason?: string; bankRef?: string }>('post', path);
  const submit = async () => {
    const parsed = field ? (field === 'reason' ? reasonSchema : bankRefSchema).safeParse(value) : null;
    if (parsed && !parsed.success) { setError(parsed.error.issues[0].message); return; }
    try {
      await mutation.mutateAsync({ ...(version !== undefined ? { version } : {}), ...(field ? { [field]: parsed?.data } : {}) });
      toast.success(successMessage ?? `${title} thành công`); onDone?.(); onClose();
    } catch (e) { setError(problemMessage(e)); }
  };
  return <ConfirmDialog open title={title} confirmLabel={confirmLabel ?? title} loading={mutation.isPending} onClose={onClose} onConfirm={() => void submit()}
    message={<div className="grid gap-3">{description && <p className="text-sm text-muted-foreground">{description}</p>}{field ? <div><Label htmlFor="action-value">{fieldLabel ?? (field === 'reason' ? 'Lý do' : 'Mã giao dịch ngân hàng')}</Label><Input id="action-value" value={value} onChange={(e) => setValue(e.target.value)} maxLength={field === 'reason' ? 500 : 100} /></div> : (confirmMessage ?? (description ? null : 'Xác nhận thực hiện thao tác này?'))}
      {error && <AlertMessage severity="error">{error}</AlertMessage>}</div>} />;
}
