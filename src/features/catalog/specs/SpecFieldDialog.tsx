import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { FormTextField } from '@/components/common/FormTextField';
import { RowAction } from '@/components/common/RowAction';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAddTemplateField, useCreateSpecField, useUpdateSpecField } from '@/api/catalog.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { conflictCurrent } from '@/features/identity/shared';
import type { SpecField, SpecInputKind } from '@/types/catalog';
import { SPEC_INPUTS, SPEC_INPUT_LABELS, hasOptions } from './specLabels';

const schema = z
  .object({
    name: z.string().trim().min(1, 'Nhập tên thuộc tính').max(100, 'Tối đa 100 ký tự'),
    input: z.enum(['select', 'multiselect', 'text', 'number', 'date']),
    unit: z.string().trim().max(20, 'Tối đa 20 ký tự'),
    allowCustom: z.boolean(),
    options: z.array(z.object({ id: z.string().optional(), value: z.string().trim().max(60, 'Tối đa 60 ký tự') })),
  })
  .superRefine((v, ctx) => {
    if (!hasOptions(v.input)) return;
    const seen = new Set<string>();
    v.options.forEach((o, i) => {
      const key = o.value.toLowerCase();
      if (!key) return;
      if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['options', i, 'value'], message: 'Trùng lựa chọn khác' });
      seen.add(key);
    });
    if (!v.options.some((o) => o.value) && !v.allowCustom) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Thêm ít nhất một lựa chọn, hoặc cho phép thêm giá trị mới' });
    }
  });

type SpecFieldForm = z.infer<typeof schema>;

const toForm = (f: SpecField | null): SpecFieldForm => ({
  name: f?.name ?? '',
  input: f?.input ?? 'select',
  unit: f?.unit ?? '',
  allowCustom: f?.allowCustom ?? true,
  options: f ? [...f.options].sort((a, b) => a.position - b.position).map((o) => ({ id: o.id, value: o.value })) : [{ value: '' }],
});

interface SpecFieldDialogProps {
  open: boolean;
  /** null: tạo mới */
  field: SpecField | null;
  onClose: () => void;
  onDone: (message: string) => void;
  /**
   * Tạo mới rồi gắn ngay vào mẫu danh mục này, một giao dịch (`POST /catalog/groups/:id/template/fields`,
   * Documents/21 §5.6). Có thêm ô "Bắt buộc". Bỏ trống: chỉ tạo vào thư viện
   */
  attachTo?: { groupId: string; groupName: string; version: number };
}

/**
 * Thông số trong thư viện của công ty (Documents/21 §5.5). Không đổi được kiểu nhập sau khi tạo; lựa chọn đang có sản
 * phẩm dùng thì không xoá được.
 */
export function SpecFieldDialog({ open, field, onClose, onDone, attachTo }: SpecFieldDialogProps) {
  const createMut = useCreateSpecField();
  const attachMut = useAddTemplateField();
  const [required, setRequired] = useState(false);
  const updateMut = useUpdateSpecField();
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<SpecField | null>(field);

  const form = useForm<SpecFieldForm>({ resolver: zodResolver(schema), defaultValues: toForm(null) });
  const { control, reset, watch, setError: setFieldError, formState } = form;
  const { fields, append, remove, move } = useFieldArray({ control, name: 'options', keyName: 'key' });
  const input = watch('input');

  useEffect(() => {
    if (open) {
      reset(toForm(field));
      setCurrent(field);
      setError(null);
      setRequired(false);
    }
  }, [open, field, reset]);

  const inUse = useMemo(() => new Set(current?.options.filter((o) => o.inUse).map((o) => o.id) ?? []), [current]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const options = hasOptions(values.input) ? values.options.filter((o) => o.value) : undefined;
    const unit = values.input === 'number' ? values.unit || null : undefined;
    try {
      if (current) {
        await updateMut.mutateAsync({
          id: current.id,
          version: current.version,
          name: values.name,
          allowCustom: values.allowCustom,
          ...(unit !== undefined && { unit }),
          ...(options && { options }),
        });
        onDone(`Đã cập nhật thuộc tính ${values.name}`);
      } else if (attachTo) {
        await attachMut.mutateAsync({
          groupId: attachTo.groupId,
          version: attachTo.version,
          required,
          field: {
            name: values.name,
            input: values.input,
            allowCustom: hasOptions(values.input) && values.allowCustom,
            ...(unit !== undefined && { unit }),
            ...(options && { options: options.map((o) => ({ value: o.value })) }),
          },
        });
        onDone(`Đã thêm thuộc tính ${values.name} vào ${attachTo.groupName}`);
      } else {
        await createMut.mutateAsync({
          name: values.name,
          input: values.input,
          allowCustom: hasOptions(values.input) && values.allowCustom,
          ...(unit !== undefined && { unit }),
          ...(options && { options: options.map((o) => ({ value: o.value })) }),
        });
        onDone(`Đã tạo thuộc tính ${values.name}`);
      }
    } catch (e) {
      const problem = getProblem(e);
      // Gắn vào mẫu danh mục: 409 kèm `current` là GroupTemplate, không phải thuộc tính
      const latest = attachTo ? null : conflictCurrent<SpecField>(e);
      if (problem?.code === 'version_conflict' && latest) {
        reset(toForm(latest));
        setCurrent(latest);
        setError('Thuộc tính vừa được người khác sửa. Form đã hiện bản mới nhất, chưa có gì thay đổi.');
        return;
      }
      if (problem?.code === 'version_conflict' && attachTo) {
        setError('Danh mục vừa được người khác sửa. Đóng hộp này rồi thử lại.');
        return;
      }
      // POST …/template/fields trả lỗi theo đường dẫn body `{ field: {...} }` (`field.name`, `field.options.<i>`, be#552):
      // bỏ tiền tố để gắn vào cùng ô của form
      const errs = Object.fromEntries(
        Object.entries(problem?.errors ?? {}).map(([k, v]) => [attachTo ? k.replace(/^field\./, '') : k, v]),
      );
      if (problem?.code === 'name_taken') {
        setFieldError('name', { message: errs.name ?? 'Đã có thuộc tính cùng tên. Chọn thuộc tính đó trong danh sách có sẵn.' });
        return;
      }
      let placed = false;
      for (const [key, message] of Object.entries(errs)) {
        // Lỗi theo ô của BE: name, input, allowCustom, unit, options, options.<i>; xoá lựa chọn đang dùng là 409 in_use
        // kèm options.<i>. `fieldId` (thuộc tính đã có trong mẫu) không có ô riêng: hiện ở đầu hộp
        const path = /^options\.\d+$/.test(key) ? `${key}.value` : key;
        if (['name', 'input', 'allowCustom', 'unit', 'options'].includes(key) || /^options\.\d+\.value$/.test(path)) {
          setFieldError(path as FieldPath<SpecFieldForm>, { message });
          placed = true;
        }
      }
      if (!placed) setError(errs.fieldId ?? problemMessage(e));
    }
  });

  const busy = createMut.isPending || updateMut.isPending || attachMut.isPending;
  const optionsError = formState.errors.options?.message ?? formState.errors.options?.root?.message;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {field ? `Sửa thuộc tính ${field.name}` : attachTo ? `Thêm thuộc tính vào ${attachTo.groupName}` : 'Thêm thuộc tính sản phẩm'}
          </DialogTitle>
          <DialogDescription>
            Thuộc tính tạo một lần, danh mục khác của công ty chọn lại được, không phải tạo lại.
          </DialogDescription>
        </DialogHeader>

        {error && <AlertMessage severity="warning">{error}</AlertMessage>}

        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="grid min-h-0 gap-4">
            <FormTextField control={control} name="name" label="Tên thuộc tính" placeholder="Chất liệu" autoFocus />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={control}
                name="input"
                render={({ field: f }) => (
                  <FormItem>
                    <FormLabel>Kiểu nhập</FormLabel>
                    <Select value={f.value} onValueChange={(v) => f.onChange(v as SpecInputKind)} disabled={Boolean(field)}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SPEC_INPUTS.map((k) => (
                          <SelectItem key={k} value={k}>
                            {SPEC_INPUT_LABELS[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {field && (
                      <p className="text-xs text-muted-foreground">
                        Không đổi được sau khi tạo. Muốn kiểu khác thì tạo thuộc tính mới.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              {input === 'number' && (
                <FormTextField
                  control={control}
                  name="unit"
                  label="Đơn vị"
                  placeholder="ml, g, mAh"
                  disabled={Boolean(field && field.productCount > 0)}
                  description={field && field.productCount > 0 ? 'Đã có sản phẩm điền, đổi đơn vị làm sai số đã lưu' : undefined}
                />
              )}
            </div>

            {hasOptions(input) && (
              <div className="grid gap-2">
                <span className="text-sm font-medium">Lựa chọn</span>
                <div className="grid max-h-[40vh] gap-2 overflow-y-auto">
                  {fields.map((o, i) => {
                    const locked = Boolean(o.id && inUse.has(o.id));
                    return (
                      <div key={o.key} className="grid grid-cols-[1fr_auto] items-start gap-1">
                        <FormField
                          control={control}
                          name={`options.${i}.value`}
                          render={({ field: f }) => (
                            <FormItem>
                              <FormControl>
                                <Input {...f} placeholder={`Lựa chọn ${i + 1}`} aria-label={`Lựa chọn ${i + 1}`} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="flex">
                          <RowAction label={`Đưa lựa chọn ${i + 1} lên trên`} reason={i === 0 ? 'Đã ở đầu' : null} onClick={() => move(i, i - 1)}>
                            <ArrowUp />
                          </RowAction>
                          <RowAction
                            label={`Đưa lựa chọn ${i + 1} xuống dưới`}
                            reason={i === fields.length - 1 ? 'Đã ở cuối' : null}
                            onClick={() => move(i, i + 1)}
                          >
                            <ArrowDown />
                          </RowAction>
                          <RowAction
                            label={`Xoá lựa chọn ${i + 1}`}
                            destructive
                            reason={locked ? 'Đang có sản phẩm dùng, không xoá được' : null}
                            onClick={() => remove(i)}
                          >
                            <Trash2 />
                          </RowAction>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {optionsError && <p className="text-sm text-destructive">{optionsError}</p>}
                <div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => append({ value: '' })}>
                    <Plus />
                    Thêm lựa chọn
                  </Button>
                </div>
                <FormField
                  control={control}
                  name="allowCustom"
                  render={({ field: f }) => (
                    <FormItem className="flex min-h-6 flex-row items-center gap-2">
                      <FormControl>
                        <Checkbox checked={f.value} onCheckedChange={(v) => f.onChange(v === true)} />
                      </FormControl>
                      <FormLabel className="font-normal">
                        Cho phép thêm giá trị mới khi điền sản phẩm (lưu vào danh sách lựa chọn)
                      </FormLabel>
                    </FormItem>
                  )}
                />
              </div>
            )}

            {attachTo && (
              <label className="flex min-h-6 items-center gap-2 text-sm">
                <Checkbox checked={required} onCheckedChange={(v) => setRequired(v === true)} disabled={busy} />
                Bắt buộc: thiếu thì sản phẩm còn "Chờ hoàn thiện" (vẫn lưu được)
              </label>
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
