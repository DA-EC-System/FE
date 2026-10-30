import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useFinanceWrite } from '@/api/financeLifecycle.api';
import { problemMessage } from '@/api/problemMessages';
import { bankRefSchema, reasonSchema } from './lifecycleShared';

export function LifecycleActionDialog({ path, title, version, field, onClose }: {
  path: string; title: string; version?: number; field?: 'reason' | 'bankRef'; onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const mutation = useFinanceWrite<unknown, { version?: number; reason?: string; bankRef?: string }>('post', path);
  const submit = async () => {
    const parsed = field ? (field === 'reason' ? reasonSchema : bankRefSchema).safeParse(value) : null;
    if (parsed && !parsed.success) { setError(parsed.error.issues[0].message); return; }
    try {
      await mutation.mutateAsync({ ...(version !== undefined ? { version } : {}), ...(field ? { [field]: parsed?.data } : {}) });
      toast.success(`${title} thành công`); onClose();
    } catch (e) { setError(problemMessage(e)); }
  };
  return <ConfirmDialog open title={title} confirmLabel={title} loading={mutation.isPending} onClose={onClose} onConfirm={() => void submit()}
    message={<div className="grid gap-3">{field ? <div><Label htmlFor="action-value">{field === 'reason' ? 'Lý do' : 'Mã sao kê'}</Label><Input id="action-value" value={value} onChange={(e) => setValue(e.target.value)} maxLength={field === 'reason' ? 500 : 100} /></div> : 'Xác nhận thực hiện thao tác này?'}
      {error && <AlertMessage severity="error">{error}</AlertMessage>}</div>} />;
}
