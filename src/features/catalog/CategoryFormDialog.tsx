import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertMessage } from '@/components/common/AlertMessage';
import { FormTextField } from '@/components/common/FormTextField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { useCreateCategory, useUpdateCategory } from '@/api/catalog.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { conflictCurrent } from '@/features/identity/shared';
import { renderSku, skuPatternError } from '@/utils/sku';
import type { Category } from '@/types/catalog';
import { categorySchema, type CategoryForm } from './shared';

interface CategoryFormDialogProps {
  open: boolean;
  /** null: tạo mới */
  category: Category | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

/** UC-CP-01: category và quy tắc SKU của category (D14, D25) */
export function CategoryFormDialog({ open, category, onClose, onDone }: CategoryFormDialogProps) {
  const createMut = useCreateCategory();
  const updateMut = useUpdateCategory();
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [seq, setSeq] = useState(1);

  const form = useForm<CategoryForm>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', skuPattern: '' },
  });
  const { control, reset, setError: setFieldError } = form;

  useEffect(() => {
    if (open) {
      reset({ name: category?.name ?? '', skuPattern: category?.skuPattern ?? '' });
      setVersion(category?.version ?? 0);
      setSeq(category?.skuNextSeq ?? 1);
      setError(null);
    }
  }, [open, category, reset]);

  // Xem trước theo đúng chữ người dùng gõ; quy tắc sai thì hiện câu của bảng 9.3 (AC-4)
  const pattern = (useWatch({ control, name: 'skuPattern' }) ?? '').trim();
  const patternError = pattern ? skuPatternError(pattern) : null;
  const preview =
    pattern && !patternError
      ? [renderSku(pattern, seq, ['DEN', 'XL']), renderSku(pattern, seq + 1, [])]
      : null;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      if (category) {
        await updateMut.mutateAsync({ id: category.id, version, ...values });
        onDone(`Đã cập nhật category ${values.name}`);
      } else {
        await createMut.mutateAsync(values);
        onDone(`Đã tạo category ${values.name}`);
      }
    } catch (e) {
      const problem = getProblem(e);
      const latest = conflictCurrent<Category>(e);
      if (problem?.code === 'version_conflict' && latest) {
        reset({ name: latest.name, skuPattern: latest.skuPattern });
        setVersion(latest.version);
        setSeq(latest.skuNextSeq);
        setError('Category vừa được người khác sửa. Form đã hiện bản mới nhất, chưa có gì thay đổi.');
        return;
      }
      const fields = problem?.errors ?? {};
      if (problem?.code === 'name_taken') {
        setFieldError('name', { message: fields.name ?? 'Đã có category cùng tên' });
        return;
      }
      if (fields.name) setFieldError('name', { message: fields.name });
      if (fields.skuPattern) setFieldError('skuPattern', { message: fields.skuPattern });
      if (!fields.name && !fields.skuPattern) setError(problemMessage(e));
    }
  });

  const busy = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{category ? 'Sửa category' : 'Thêm category'}</DialogTitle>
          <DialogDescription>SKU của variant sinh theo quy tắc của category.</DialogDescription>
        </DialogHeader>

        {error && <AlertMessage severity="warning">{error}</AlertMessage>}

        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            <FormTextField control={control} name="name" label="Tên category" autoFocus />
            <FormTextField
              control={control}
              name="skuPattern"
              label="Quy tắc SKU"
              placeholder="AO-{SEQ:4}-{VAL}"
              className="[&_input]:font-mono"
              description="{SEQ:n}: số thứ tự, thêm số 0 phía trước cho đủ n chữ số; {VAL}: mã giá trị phân loại của variant (vd DEN-XL). Chỉ dùng chữ hoa."
            />
            <div className="rounded-md bg-muted p-3" data-testid="sku-preview">
              <p className="text-xs text-muted-foreground">
                SKU mẫu (variant có mã DEN / XL và variant không có thuộc tính phân loại)
              </p>
              <p className="font-mono text-sm">{preview ? preview.join('   ·   ') : '—'}</p>
              {patternError && <p className="mt-1 text-sm text-destructive">{patternError}</p>}
            </div>
            {category && category.productCount > 0 && (
              <AlertMessage severity="info">
                Đổi quy tắc chỉ áp dụng cho variant tạo sau này. SKU đã sinh của{' '}
                {category.productCount} sản phẩm giữ nguyên.
              </AlertMessage>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                Huỷ
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Đang lưu...' : 'Lưu'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
