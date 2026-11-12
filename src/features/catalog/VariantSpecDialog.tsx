import { useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { useUpdateVariant } from '@/api/catalog.api';
import { getProblem } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { conflictCurrent } from '@/features/identity/shared';
import { priceTextSchema } from '@/utils/price';
import type { ProductDetail, ProductVariant, VariantUpdateInput } from '@/types/catalog';

/** Ô số nguyên dương, trống là chưa có (null) */
const positiveInt = (max: number, tooBig: string) =>
  z.string().transform((raw, ctx): number | null => {
    const text = raw.trim().replace(/[.,\s]/g, '');
    if (!text) return null;
    if (!/^\d+$/.test(text) || Number(text) <= 0) {
      ctx.addIssue({ code: 'custom', message: 'Số nguyên dương' });
      return z.NEVER;
    }
    if (Number(text) > max) {
      ctx.addIssue({ code: 'custom', message: tooBig });
      return z.NEVER;
    }
    return Number(text);
  });

const size = positiveInt(2000, 'Quá 2 m, kiểm tra lại đơn vị mm');
const specSchema = z
  .object({
    standardPrice: priceTextSchema,
    weightG: positiveInt(50000, 'Quá 50 kg, kiểm tra lại đơn vị gram'),
    lengthMm: size,
    widthMm: size,
    heightMm: size,
  })
  .superRefine((v, ctx) => {
    // Kích thước gói đủ ba cạnh mới dùng được để tính phí vận chuyển
    const sides = [v.lengthMm, v.widthMm, v.heightMm];
    if (sides.some((s) => s !== null) && sides.some((s) => s === null)) {
      for (const k of ['lengthMm', 'widthMm', 'heightMm'] as const) {
        if (v[k] === null) ctx.addIssue({ code: 'custom', path: [k], message: 'Nhập đủ ba cạnh' });
      }
    }
  });
type SpecForm = z.input<typeof specSchema>;
const FIELDS = ['standardPrice', 'weightG', 'lengthMm', 'widthMm', 'heightMm'] as const;

const toForm = (v: ProductVariant): SpecForm => ({
  standardPrice: v.standardPrice?.toString() ?? '',
  weightG: v.weightG?.toString() ?? '',
  lengthMm: v.lengthMm?.toString() ?? '',
  widthMm: v.widthMm?.toString() ?? '',
  heightMm: v.heightMm?.toString() ?? '',
});

interface VariantSpecDialogProps {
  productId: string;
  /** null là đóng */
  variant: ProductVariant | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

/** FE#154 (D9): giá chuẩn, khối lượng, kích thước gói là cột của SKU; gọi PATCH §17.2 */
export function VariantSpecDialog({ productId, variant, onClose, onDone }: VariantSpecDialogProps) {
  const updateMut = useUpdateVariant();
  const [error, setError] = useState<string | null>(null);
  // Version gửi kèm; đổi khi 409 nạp bản mới
  const [version, setVersion] = useState(0);
  const form = useForm<SpecForm>({
    // Resolver trả số đã đổi (z.output) dù form giữ chữ; FormTextField chỉ nhận Control<SpecForm>
    resolver: zodResolver(specSchema) as unknown as Resolver<SpecForm>,
    defaultValues: { standardPrice: '', weightG: '', lengthMm: '', widthMm: '', heightMm: '' },
  });
  const { control, reset, setError: setFieldError } = form;

  const variantId = variant?.id;
  useEffect(() => {
    if (variant) {
      reset(toForm(variant));
      setVersion(variant.version);
      setError(null);
    }
    // Chỉ nạp khi mở hộp cho SKU khác; refetch nền không đè chỗ đang gõ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantId, reset]);

  const submit = form.handleSubmit(async (raw) => {
    if (!variant) return;
    const values = raw as unknown as z.output<typeof specSchema>;
    setError(null);
    // Chỉ gửi ô đã đổi
    const input: VariantUpdateInput = { version };
    for (const f of FIELDS) if (values[f] !== variant[f]) input[f] = values[f];
    if (Object.keys(input).length === 1) {
      onClose();
      return;
    }
    try {
      await updateMut.mutateAsync({ productId, variantId: variant.id, ...input });
      onDone(`Đã lưu thông tin ${variant.sku}`);
    } catch (e) {
      const latest = conflictCurrent<ProductDetail>(e)?.variants.find((v) => v.id === variant.id);
      if (problemCode(e) === 'version_conflict' && latest) {
        reset(toForm(latest));
        setVersion(latest.version);
        setError('SKU vừa được người khác sửa. Hộp đã hiện số mới nhất, chưa có gì thay đổi.');
        return;
      }
      const fieldErrors = getProblem(e)?.errors ?? {};
      for (const f of FIELDS) if (fieldErrors[f]) setFieldError(f, { message: fieldErrors[f] });
      if (!FIELDS.some((f) => fieldErrors[f])) setError(problemMessage(e));
    }
  });

  const busy = updateMut.isPending;

  return (
    <Dialog open={Boolean(variant)} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <Form {...form}>
          <form
            onSubmit={(e) => {
              // Sự kiện React đi xuyên portal; không để lọt lên form sản phẩm
              e.stopPropagation();
              void submit(e);
            }}
            noValidate
            className="grid gap-4"
          >
            <DialogHeader>
              <DialogTitle>Thông tin SKU {variant?.sku}</DialogTitle>
              <DialogDescription>
                Giá chuẩn, khối lượng và kích thước gói dùng để đăng sàn và tính phí vận chuyển. Để trống là chưa có.
              </DialogDescription>
            </DialogHeader>
            <FormTextField
              control={control}
              name="standardPrice"
              label="Giá muốn bán (đ)"
              inputMode="numeric"
              hint="Giá chuẩn của SKU. Giá niêm yết trên từng sàn tính từ giá này ở phần Kênh bán."
            />
            <FormTextField control={control} name="weightG" label="Khối lượng (g)" inputMode="numeric" />
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Kích thước gói (mm)</legend>
              <div className="grid grid-cols-3 gap-2">
                <FormTextField control={control} name="lengthMm" label="Dài" inputMode="numeric" />
                <FormTextField control={control} name="widthMm" label="Rộng" inputMode="numeric" />
                <FormTextField control={control} name="heightMm" label="Cao" inputMode="numeric" />
              </div>
            </fieldset>
            {error && <AlertMessage severity="warning">{error}</AlertMessage>}
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
