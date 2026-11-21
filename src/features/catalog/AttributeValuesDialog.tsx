import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAddAttributeValue, useAttributes, useDeleteAttributeValue } from '@/api/catalog.api';
import { getProblem } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import type { Attribute, AttributeValue } from '@/types/catalog';
import { splitByScope } from './scope';

interface AttributeValuesDialogProps {
  /** Thuộc tính chuẩn nền tảng đang mở; null là đóng */
  attribute: Attribute | null;
  onClose: () => void;
}

/**
 * Giá trị riêng của công ty trên thuộc tính chuẩn (Màu sắc, Kích cỡ…), chốt 4 dữ liệu chung: giá trị chuẩn chỉ đọc,
 * công ty thêm và xoá giá trị của mình (`POST`, `DELETE /catalog/attributes/:id/values`). Mã SKU bỏ trống thì BE sinh
 */
export function AttributeValuesDialog({ attribute, onClose }: AttributeValuesDialogProps) {
  // Đọc bản mới nhất trong cache để danh sách cập nhật ngay sau khi thêm, xoá
  const live = useAttributes().data?.find((a) => a.id === attribute?.id) ?? attribute;
  const addMut = useAddAttributeValue();
  const deleteMut = useDeleteAttributeValue();
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<{ value?: string; code?: string; form?: string }>({});

  useEffect(() => {
    if (attribute) {
      setValue('');
      setCode('');
      setErrors({});
    }
  }, [attribute]);

  const { platform, company } = splitByScope(live?.values ?? []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!live) return;
    const v = value.trim();
    if (!v) {
      setErrors({ value: 'Nhập giá trị' });
      return;
    }
    setErrors({});
    try {
      const created = await addMut.mutateAsync({ attributeId: live.id, value: v, code: code.trim() || undefined });
      toast.success(`Đã thêm ${created.value} vào ${live.name}`);
      setValue('');
      setCode('');
    } catch (err) {
      const fields = getProblem(err)?.errors ?? {};
      if (problemCode(err) === 'name_taken' || fields.value) setErrors({ value: fields.value ?? 'Đã có giá trị này' });
      else if (problemCode(err) === 'code_taken' || fields.code) setErrors({ code: fields.code ?? 'Mã này đã dùng' });
      else setErrors({ form: problemMessage(err) });
    }
  };

  const remove = async (v: AttributeValue) => {
    if (!live) return;
    try {
      await deleteMut.mutateAsync({ attributeId: live.id, valueId: v.id });
      toast.success(`Đã xoá ${v.value}`);
    } catch (err) {
      toast.warning(problemCode(err) === 'in_use' ? `Không xoá được ${v.value}: đã có biến thể dùng.` : problemMessage(err));
    }
  };

  const busy = addMut.isPending || deleteMut.isPending;

  return (
    <Dialog open={Boolean(attribute)} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Giá trị của {live?.name}</DialogTitle>
          <DialogDescription>
            Thuộc tính chuẩn của nền tảng. Giá trị chuẩn dùng chung mọi công ty; công ty thêm giá trị riêng khi cần.
          </DialogDescription>
        </DialogHeader>

        {errors.form && <AlertMessage severity="error">{errors.form}</AlertMessage>}

        <section className="grid gap-2" aria-label="Giá trị chuẩn">
          <h3 className="text-sm font-medium">
            Mặc định của hệ thống <span className="font-normal text-muted-foreground tabular-nums">{platform.length}</span>
          </h3>
          {platform.length ? (
            <div className="flex flex-wrap gap-1">
              {platform.map((v) => (
                <Badge key={v.id} variant="outline">
                  {v.value}
                  <span className="font-mono text-muted-foreground">{v.code}</span>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Chưa có giá trị chuẩn</p>
          )}
        </section>

        <section className="grid gap-2" aria-label="Giá trị riêng của công ty">
          <h3 className="text-sm font-medium">
            Tự tạo <span className="font-normal text-muted-foreground tabular-nums">{company.length}</span>
          </h3>
          {company.length ? (
            <ul className="flex flex-wrap gap-1">
              {company.map((v) => (
                <li key={v.id}>
                  <Badge variant="secondary" className="gap-1 pr-0.5">
                    {v.value}
                    <span className="font-mono text-muted-foreground">{v.code}</span>
                    <button
                      type="button"
                      className="inline-flex size-6 cursor-pointer items-center justify-center rounded-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={v.inUse ? `${v.value} đã có biến thể dùng, không xoá được` : `Xoá ${v.value}`}
                      title={v.inUse ? 'Đã có biến thể dùng, không xoá được' : `Xoá ${v.value}`}
                      disabled={busy || v.inUse}
                      onClick={() => void remove(v)}
                    >
                      <X className="size-3.5" />
                    </button>
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Chưa có giá trị riêng</p>
          )}
        </section>

        <form onSubmit={add} noValidate className="grid gap-3 sm:grid-cols-[1fr_9rem_auto] sm:items-start">
          <div className="grid gap-1.5">
            <Label htmlFor="attr-value-new">Giá trị mới</Label>
            <Input
              id="attr-value-new"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={Boolean(errors.value)}
              aria-describedby={errors.value ? 'attr-value-new-err' : undefined}
              disabled={busy}
            />
            {errors.value && (
              <p id="attr-value-new-err" role="alert" className="text-sm text-destructive">
                {errors.value}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="attr-code-new">Mã trong SKU</Label>
            <Input
              id="attr-code-new"
              value={code}
              placeholder="Tự sinh"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              aria-invalid={Boolean(errors.code)}
              aria-describedby={errors.code ? 'attr-code-new-err' : undefined}
              className="font-mono"
              disabled={busy}
            />
            {errors.code && (
              <p id="attr-code-new-err" role="alert" className="text-sm text-destructive">
                {errors.code}
              </p>
            )}
          </div>
          <Button type="submit" className="sm:mt-6" disabled={busy}>
            {addMut.isPending ? 'Đang thêm...' : 'Thêm'}
          </Button>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
