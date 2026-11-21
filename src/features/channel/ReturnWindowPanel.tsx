import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getProblem } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { shopKeys, useUpdateShop } from '@/api/shops.api';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { PERMISSIONS } from '@/utils/permissions';
import type { Shop } from '@/types/shop';
import { returnDaysError } from './shopSchemas';
import { missingReturnWindow } from './shopList';

/** Tham số URL mở sẵn ô sửa hạn trả, dùng ở nhãn "Chưa nhập số ngày hạn trả" của Kênh bán */
export const RETURN_WINDOW_EDIT = 'sua=han-tra';
const [EDIT_KEY, EDIT_VALUE] = RETURN_WINDOW_EDIT.split('=');

/**
 * Hạn trả hàng của gian hàng (§18.4, §18.7.2; FE#273). Chỉ hiện khi sàn tính hạn trả theo số ngày
 * (`capabilities.returnWindow = days`), không theo mã sàn. Sửa cần quyền kết nối gian hàng.
 */
export function ReturnWindowPanel({ shop }: { shop: Shop }) {
  if (shop.capabilities.returnWindow !== 'days') return null;
  return <ReturnWindowEditor shop={shop} />;
}

function ReturnWindowEditor({ shop }: { shop: Shop }) {
  const can = useCan();
  const qc = useQueryClient();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const [params, setParams] = useSearchParams();
  const update = useUpdateShop();
  const canEdit = can(PERMISSIONS.shopConnect) && shop.status !== 'disconnected';
  const missing = missingReturnWindow(shop);
  const [editing, setEditing] = useState(() => canEdit && params.get(EDIT_KEY) === EDIT_VALUE);
  const [value, setValue] = useState(() => (shop.returnWindowDays == null ? '' : String(shop.returnWindowDays)));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const open = () => {
    setValue(shop.returnWindowDays == null ? '' : String(shop.returnWindowDays));
    setError(null);
    setNotice(null);
    setEditing(true);
  };
  const close = () => {
    setEditing(false);
    setError(null);
    setNotice(null);
    if (params.has(EDIT_KEY)) {
      const next = new URLSearchParams(params);
      next.delete(EDIT_KEY);
      setParams(next, { replace: true });
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const bad = returnDaysError(value);
    if (bad) {
      setError(bad);
      return;
    }
    const days = Number(value.trim());
    update.mutate(
      { id: shop.id, version: shop.version, returnWindowDays: days },
      {
        onSuccess: () => {
          toast.success(`Đã lưu hạn trả hàng ${days} ngày`);
          close();
        },
        onError: (err) => {
          const problem = getProblem(err) as (ReturnType<typeof getProblem> & { current?: Shop }) | undefined;
          if (problemCode(err) === 'version_conflict' && problem?.current) {
            // Nạp lại bản mới BE gửi kèm, giữ ô mở để người dùng xem rồi lưu lại
            const current = problem.current;
            qc.setQueryData(shopKeys.detail(companyId, current.id), current);
            setValue(current.returnWindowDays == null ? '' : String(current.returnWindowDays));
            setError(null);
            setNotice('Gian hàng vừa được người khác sửa. Đã nạp lại số mới, kiểm tra rồi lưu lại.');
            return;
          }
          setNotice(null);
          setError(problem?.errors?.returnWindowDays ?? problemMessage(err));
        },
      },
    );
  };

  const form = editing && (
    <form className="mt-2 flex flex-wrap items-start gap-2" onSubmit={submit} data-testid="return-window-form" noValidate>
      <div className="grid gap-1">
        <Label htmlFor="return-window-days">Hạn trả hàng (ngày)</Label>
        <Input
          id="return-window-days"
          name="returnWindowDays"
          type="number"
          inputMode="numeric"
          min={1}
          max={60}
          step={1}
          className="w-32"
          autoFocus
          value={value}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'return-window-days-error' : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
        />
        {error && (
          <p id="return-window-days-error" className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="flex gap-2 sm:mt-6">
        <Button type="submit" size="sm" disabled={update.isPending}>
          {update.isPending ? 'Đang lưu...' : 'Lưu'}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={update.isPending} onClick={close}>
          Huỷ
        </Button>
      </div>
      {notice && (
        <p className="basis-full text-xs text-warning" data-testid="return-window-notice">
          {notice}
        </p>
      )}
    </form>
  );

  if (missing) {
    return (
      <AlertMessage severity="warning" className="mb-4">
        <div data-testid="return-window-missing">
          <p>
            <span className="font-medium">Chưa nhập hạn trả hàng.</span> Gian hàng này kết nối trước khi Commerio hỏi hạn
            trả hàng, nên chưa biết đơn nào còn trong hạn trả.
            {!canEdit && ' Người có quyền kết nối gian hàng nhập được số ngày.'}
          </p>
          {canEdit && !editing && (
            <Button size="sm" variant="outline" className="mt-2" onClick={open}>
              <Pencil />
              Nhập số ngày
            </Button>
          )}
          {form}
        </div>
      </AlertMessage>
    );
  }

  return (
    <div className="mb-4 rounded-md border px-4 py-3 text-sm" data-testid="return-window">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-muted-foreground">Hạn trả hàng</span>
        <span className="font-medium" data-testid="return-window-days">
          {shop.returnWindowDays == null ? '—' : `${shop.returnWindowDays} ngày`}
        </span>
        {canEdit && !editing && (
          <Button size="sm" variant="ghost" onClick={open} aria-label="Sửa hạn trả hàng">
            <Pencil />
            Sửa
          </Button>
        )}
      </div>
      {form}
    </div>
  );
}
