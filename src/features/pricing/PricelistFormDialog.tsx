import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertMessage } from '@/components/common/AlertMessage';
import { FormTextField } from '@/components/common/FormTextField';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreatePricelist, useUpdatePricelist } from '@/api/pricing.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { conflictCurrent } from '@/features/identity/shared';
import { PLATFORM_LABELS } from '@/features/channel/shopSchemas';
import type { Shop } from '@/types/shop';
import type { Pricelist } from '@/types/pricing';
import {
  pricelistCreateSchema,
  pricelistRenameSchema,
  type PricelistCreateForm,
  type PricelistRenameForm,
} from './shared';

interface CreateDialogProps {
  open: boolean;
  /** Gian hàng còn kết nối và chưa có bảng giá */
  shops: Shop[];
  onClose: () => void;
  onDone: (created: Pricelist) => void;
}

/** UC-CP-03 bước 3: tạo bảng giá theo gian hàng (D15); bảng giá chuẩn có sẵn, không tạo thêm */
export function CreatePricelistDialog({ open, shops, onClose, onDone }: CreateDialogProps) {
  const createMut = useCreatePricelist();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<PricelistCreateForm>({
    resolver: zodResolver(pricelistCreateSchema),
    defaultValues: { name: '', shopId: '', copyFromStandard: true },
  });
  const { control, reset, setValue, getValues, setError: setFieldError } = form;

  useEffect(() => {
    if (open) {
      reset({ name: '', shopId: '', copyFromStandard: true });
      setError(null);
    }
  }, [open, reset]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      onDone(await createMut.mutateAsync(values));
    } catch (e) {
      const problem = getProblem(e);
      const fields = problem?.errors ?? {};
      if (problem?.code === 'name_taken') {
        setFieldError('name', { message: fields.name ?? 'Đã có bảng giá cùng tên' });
        return;
      }
      if (fields.name) setFieldError('name', { message: fields.name });
      if (fields.shopId) setFieldError('shopId', { message: fields.shopId });
      if (!fields.name && !fields.shopId) setError(problemMessage(e));
    }
  });

  const busy = createMut.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tạo bảng giá theo gian hàng</DialogTitle>
          <DialogDescription>Đơn từ gian hàng được chọn sẽ lấy giá trong bảng mới.</DialogDescription>
        </DialogHeader>

        {error && <AlertMessage severity="error">{error}</AlertMessage>}
        {!shops.length && (
          <AlertMessage severity="info">Mọi gian hàng đang kết nối đều đã có bảng giá.</AlertMessage>
        )}

        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            <FormField
              control={control}
              name="shopId"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Gian hàng</FormLabel>
                  <Select
                    value={field.value}
                    disabled={!shops.length}
                    onValueChange={(value) => {
                      field.onChange(value);
                      // Gợi ý tên theo gian hàng nếu người dùng chưa gõ
                      const shop = shops.find((s) => s.id === value);
                      if (shop && !getValues('name').trim()) {
                        setValue('name', `Giá ${shop.shopName}`, { shouldValidate: true });
                      }
                    }}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full" aria-label="Gian hàng">
                        <SelectValue placeholder="Chọn gian hàng" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {shops.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.shopName} ({PLATFORM_LABELS[s.platform]})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.error ? (
                    <FormMessage />
                  ) : (
                    <FormDescription>Chỉ hiện gian hàng còn kết nối và chưa có bảng giá.</FormDescription>
                  )}
                </FormItem>
              )}
            />
            <FormTextField control={control} name="name" label="Tên bảng giá" />
            <FormField
              control={control}
              name="copyFromStandard"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                  </FormControl>
                  <FormLabel className="font-normal">Chép giá từ bảng giá chuẩn</FormLabel>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                Huỷ
              </Button>
              <Button type="submit" disabled={busy || !shops.length}>
                {busy ? 'Đang tạo...' : 'Tạo'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface RenameDialogProps {
  pricelist: Pricelist | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

export function RenamePricelistDialog({ pricelist, onClose, onDone }: RenameDialogProps) {
  const updateMut = useUpdatePricelist();
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const form = useForm<PricelistRenameForm>({
    resolver: zodResolver(pricelistRenameSchema),
    defaultValues: { name: '' },
  });
  const { control, reset, setError: setFieldError } = form;

  useEffect(() => {
    if (pricelist) {
      reset({ name: pricelist.name });
      setVersion(pricelist.version);
      setError(null);
    }
  }, [pricelist, reset]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!pricelist) return;
    setError(null);
    try {
      await updateMut.mutateAsync({ id: pricelist.id, version, name: values.name });
      onDone(`Đã đổi tên thành ${values.name}`);
    } catch (e) {
      const problem = getProblem(e);
      const latest = conflictCurrent<Pricelist>(e);
      if (problem?.code === 'version_conflict' && latest) {
        reset({ name: latest.name });
        setVersion(latest.version);
        setError('Bảng giá vừa được người khác sửa. Form đã hiện tên mới nhất, chưa có gì thay đổi.');
        return;
      }
      const name = problem?.errors?.name ?? (problem?.code === 'name_taken' ? 'Đã có bảng giá cùng tên' : null);
      if (name) setFieldError('name', { message: name });
      else setError(problemMessage(e));
    }
  });

  const busy = updateMut.isPending;

  return (
    <Dialog open={Boolean(pricelist)} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Đổi tên bảng giá</DialogTitle>
          <DialogDescription>Tên bảng giá không trùng trong công ty.</DialogDescription>
        </DialogHeader>
        {error && <AlertMessage severity="warning">{error}</AlertMessage>}
        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            <FormTextField control={control} name="name" label="Tên bảng giá" autoFocus />
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
