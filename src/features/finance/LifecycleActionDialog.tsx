import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useFinanceWrite } from '@/api/financeLifecycle.api';
import { problemMessage } from '@/api/problemMessages';
import { bankRefSchema, reasonSchema } from './lifecycleShared';

/** Toast mặc định: "Duyệt" thành "Đã duyệt"; tiêu đề mở đầu bằng chữ viết tắt (vd "CEO duyệt") thành "CEO duyệt xong" */
function defaultSuccess(title: string) {
  const startsWithAcronym = title.length > 1 && title[1] !== title[1].toLowerCase();
  return startsWithAcronym ? `${title} xong` : `Đã ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
}

/**
 * `successMessage`: toast khi xong, mặc định "Đã <title>". `fieldLabel`: nhãn ô nhập, mặc định theo `field`.
 * `confirmMessage`: thân hộp khi không có ô nhập; không truyền mà có `description` thì chỉ hiện `description`.
 */
export function LifecycleActionDialog({ path, title, version, field, description, fieldLabel, successMessage, confirmMessage, onDone, onClose }: {
  path: string; title: string; version?: number; field?: 'reason' | 'bankRef'; description?: string; fieldLabel?: string;
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
      toast.success(successMessage ?? defaultSuccess(title)); onDone?.(); onClose();
    } catch (e) { setError(problemMessage(e)); }
  };
  return <ConfirmDialog open title={title} confirmLabel={title} loading={mutation.isPending} onClose={onClose} onConfirm={() => void submit()}
    message={<div className="grid gap-3">{description && <p className="text-sm text-muted-foreground">{description}</p>}{field ? <div><Label htmlFor="action-value">{fieldLabel ?? (field === 'reason' ? 'Lý do' : 'Mã giao dịch ngân hàng')}</Label><Input id="action-value" value={value} onChange={(e) => setValue(e.target.value)} maxLength={field === 'reason' ? 500 : 100} /></div> : (confirmMessage ?? (description ? null : 'Xác nhận thực hiện thao tác này?'))}
      {error && <AlertMessage severity="error">{error}</AlertMessage>}</div>} />;
}
