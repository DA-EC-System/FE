import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { FormTextField } from '@/components/common/FormTextField';
import { RowAction } from '@/components/common/RowAction';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useCreateAttribute, useUpdateAttribute } from '@/api/catalog.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { conflictCurrent } from '@/features/identity/shared';
import { valueCode } from '@/utils/sku';
import type { Attribute } from '@/types/catalog';
import { attributeSchema, type AttributeForm } from './shared';

interface AttributeFormDialogProps {
  open: boolean;
  /** null: tạo mới */
  attribute: Attribute | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

const toForm = (a: Attribute | null): AttributeForm => ({
  name: a?.name ?? '',
  values: a?.values.map((v) => ({ id: v.id, value: v.value, code: v.code })) ?? [
    { value: '', code: '' },
  ],
});

/**
 * UC-CP-01: thuộc tính và danh sách giá trị kèm mã dùng trong SKU (V21, AC-16).
 * Giá trị đã có biến thể dùng thì không xoá được.
 */
export function AttributeFormDialog({ open, attribute, onClose, onDone }: AttributeFormDialogProps) {
  const createMut = useCreateAttribute();
  const updateMut = useUpdateAttribute();
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Attribute | null>(attribute);

  const form = useForm<AttributeForm>({
    resolver: zodResolver(attributeSchema),
    defaultValues: toForm(null),
  });
  const { control, reset, getValues, setValue, setError: setFieldError, formState } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'values', keyName: 'key' });

  useEffect(() => {
    if (open) {
      reset(toForm(attribute));
      setCurrent(attribute);
      setError(null);
    }
  }, [open, attribute, reset]);

  const inUse = useMemo(
    () => new Set(current?.values.filter((v) => v.inUse).map((v) => v.id) ?? []),
    [current],
  );

  /** Gõ giá trị thì mã tự sinh theo bảng 9.2, trừ khi người dùng đã tự đặt mã khác */
  const onValueChange = (i: number, next: string, prev: string) => {
    const code = getValues(`values.${i}.code`);
    if (!code || code === valueCode(prev)) {
      setValue(`values.${i}.code`, valueCode(next), { shouldValidate: formState.isSubmitted });
    }
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      if (current) {
        await updateMut.mutateAsync({ id: current.id, version: current.version, ...values });
        onDone(`Đã cập nhật thuộc tính ${values.name}`);
      } else {
        await createMut.mutateAsync(values);
        onDone(`Đã tạo thuộc tính ${values.name}`);
      }
    } catch (e) {
      const problem = getProblem(e);
      const latest = conflictCurrent<Attribute>(e);
      if (problem?.code === 'version_conflict' && latest) {
        reset(toForm(latest));
        setCurrent(latest);
        setError('Thuộc tính vừa được người khác sửa. Form đã hiện bản mới nhất, chưa có gì thay đổi.');
        return;
      }
      const fields = problem?.errors ?? {};
      if (problem?.code === 'name_taken') {
        setFieldError('name', { message: fields.name ?? 'Đã có thuộc tính cùng tên' });
        return;
      }
      // values.<i>.code, values.<i>.value gắn đúng ô (V21)
      let placed = false;
      for (const [key, message] of Object.entries(fields)) {
        if (key === 'name' || key === 'values' || /^values\.\d+\.(value|code)$/.test(key)) {
          setFieldError(key as FieldPath<AttributeForm>, { message });
          placed = true;
        }
      }
      if (!placed) setError(problemMessage(e));
    }
  });

  const busy = createMut.isPending || updateMut.isPending;
  const valuesError = formState.errors.values?.message ?? formState.errors.values?.root?.message;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{attribute ? 'Sửa thuộc tính' : 'Thêm thuộc tính'}</DialogTitle>
          <DialogDescription>
            Mã của giá trị dùng trong {'{VAL}'} của SKU; bỏ trống thì tự sinh từ giá trị.
          </DialogDescription>
        </DialogHeader>

        {error && <AlertMessage severity="warning">{error}</AlertMessage>}

        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="grid min-h-0 gap-4">
            <FormTextField
              control={control}
              name="name"
              label="Tên thuộc tính"
              placeholder="Màu sắc"
              autoFocus
            />
            <div className="grid gap-2">
              <div className="grid grid-cols-[1fr_7rem_2rem] gap-2 text-sm font-medium">
                <span>Giá trị</span>
                <span>Mã</span>
              </div>
              <div className="grid max-h-[45vh] gap-2 overflow-y-auto">
                {fields.map((f, i) => {
                  const locked = Boolean(f.id && inUse.has(f.id));
                  return (
                    <div
                      key={f.key}
                      className="grid grid-cols-[1fr_7rem_2rem] items-start gap-2"
                      data-value-row={i}
                    >
                      <FormField
                        control={control}
                        name={`values.${i}.value`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder={`Giá trị ${i + 1}`}
                                aria-label={`Giá trị ${i + 1}`}
                                onChange={(e) => {
                                  onValueChange(i, e.target.value, field.value);
                                  field.onChange(e);
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={control}
                        name={`values.${i}.code`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                {...field}
                                value={field.value ?? ''}
                                onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                                maxLength={6}
                                aria-label={`Mã giá trị ${i + 1}`}
                                className="font-mono"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="pt-0.5">
                        <RowAction
                          label="Xoá giá trị"
                          destructive
                          reason={
                            locked
                              ? 'Đã có biến thể dùng, không xoá được'
                              : fields.length === 1
                                ? 'Cần ít nhất một giá trị'
                                : null
                          }
                          onClick={() => remove(i)}
                        >
                          <Trash2 />
                        </RowAction>
                      </div>
                    </div>
                  );
                })}
              </div>
              {valuesError && <p className="text-sm text-destructive">{valuesError}</p>}
              <div>
                <Button type="button" variant="ghost" size="sm" onClick={() => append({ value: '', code: '' })}>
                  <Plus />
                  Thêm giá trị
                </Button>
              </div>
              {inUse.size > 0 && (
                <p className="text-xs text-muted-foreground">
                  Đổi chữ hoặc mã của giá trị đang dùng không đổi SKU đã sinh; mã mới chỉ áp dụng cho
                  biến thể tạo sau.
                </p>
              )}
            </div>
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
