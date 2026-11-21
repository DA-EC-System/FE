import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
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
import { useCreateGroup, useGroups, useProductSettings, useUpdateGroup } from '@/api/catalog.api';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { conflictCurrent } from '@/features/identity/shared';
import { isPlatform, type ProductGroup, type SuggestConfig } from '@/types/catalog';
import { groupSchema, type GroupForm } from './shared';
import { SuggestFields } from './SuggestFields';
import { EMPTY_SUGGEST_FORM, fromSuggestForm, suggestFieldErrors, suggestText, toSuggestForm } from './suggest';

interface GroupFormDialogProps {
  open: boolean;
  /** null: tạo mới */
  group: ProductGroup | null;
  onClose: () => void;
  /** `created`: danh mục vừa tạo (chỉ khi thêm mới) */
  onDone: (message: string, created?: ProductGroup) => void;
}

/**
 * Thêm, sửa danh mục sản phẩm (Documents/21 §5.2, FE#350; chữ theo Documents/29 mục 2). Mã SKU sinh theo mẫu của công ty, không theo nhóm. Năm ô gợi ý
 * ghi đè gợi ý của công ty; ô trống là theo công ty, chữ mờ hiện giá trị của công ty
 */
export function GroupFormDialog({ open, group, onClose, onDone }: GroupFormDialogProps) {
  const createMut = useCreateGroup();
  const updateMut = useUpdateGroup();
  const company = useProductSettings().data?.suggest;
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  // Chép mẫu thông số và trục chuẩn từ nhóm khác (Documents/21 §5.2): một lần, không thành cha con
  const [copyFrom, setCopyFrom] = useState('');
  // Nhóm chuẩn nền tảng: tên, mẫu do nền tảng đặt; công ty chỉ đặt gợi ý giá, nhập lại của mình
  const platform = Boolean(group && isPlatform(group));
  const sources = (useGroups().data ?? []).filter((g) => g.id !== group?.id && (g.specFieldCount ?? 0) + (g.axes?.length ?? 0) > 0);
  const replacing = Boolean(copyFrom && group && (group.specFieldCount ?? 0) + (group.axes?.length ?? 0) > 0);

  const form = useForm<GroupForm>({
    resolver: zodResolver(groupSchema),
    defaultValues: { name: '', suggest: EMPTY_SUGGEST_FORM },
  });
  const { control, reset, setError: setFieldError } = form;

  useEffect(() => {
    if (open) {
      reset({ name: group?.name ?? '', suggest: toSuggestForm(group?.suggest) });
      setVersion(group?.version ?? 0);
      setCopyFrom('');
      setError(null);
    }
  }, [open, group, reset]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const body = {
        name: values.name,
        suggest: fromSuggestForm(values.suggest),
        ...(copyFrom && { copyTemplateFromGroupId: copyFrom }),
      };
      if (group && platform) {
        await updateMut.mutateAsync({ id: group.id, version, suggest: body.suggest });
        onDone(`Đã lưu gợi ý của danh mục ${group.name}`);
      } else if (group) {
        await updateMut.mutateAsync({ id: group.id, version, ...body });
        onDone(`Đã cập nhật danh mục ${values.name}`);
      } else {
        const created = await createMut.mutateAsync(body);
        onDone(`Đã tạo danh mục ${values.name}`, created);
      }
    } catch (e) {
      const problem = getProblem(e);
      const latest = conflictCurrent<ProductGroup>(e);
      if (problem?.code === 'version_conflict' && latest) {
        reset({ name: latest.name, suggest: toSuggestForm(latest.suggest) });
        setVersion(latest.version);
        setError('Danh mục vừa được người khác sửa. Form đã hiện bản mới nhất, chưa có gì thay đổi.');
        return;
      }
      const fields = problem?.errors ?? {};
      if (problem?.code === 'name_taken') {
        setFieldError('name', { message: fields.name ?? 'Đã có danh mục cùng tên' });
        return;
      }
      const suggestErrors = suggestFieldErrors(fields);
      suggestErrors.forEach(([key, message]) => setFieldError(`suggest.${key}`, { message }));
      if (fields.name) setFieldError('name', { message: fields.name });
      else if (fields.copyTemplateFromGroupId) setError(fields.copyTemplateFromGroupId);
      else if (!suggestErrors.length) setError(problemMessage(e));
    }
  });

  const busy = createMut.isPending || updateMut.isPending;
  const inherited = (key: keyof SuggestConfig) => {
    const value = company?.[key] ?? null;
    if (value === null) return key === 'priceRounding' ? 'Theo công ty: 1 đ' : 'Theo công ty: không gợi ý';
    return `Theo công ty: ${suggestText(key, value)}`;
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{platform ? `Gợi ý của danh mục ${group?.name}` : group ? 'Sửa danh mục' : 'Thêm danh mục'}</DialogTitle>
          <DialogDescription>
            {platform
              ? 'Danh mục mặc định của hệ thống: tên và thuộc tính sản phẩm dùng chung mọi công ty. Gợi ý giá, ngưỡng tồn dưới đây chỉ áp cho công ty bạn.'
              : 'Danh mục dùng để lọc sản phẩm trong app và quyết định thuộc tính sản phẩm cần điền; không ghép sang category của sàn.'}
          </DialogDescription>
        </DialogHeader>

        {error && <AlertMessage severity="warning">{error}</AlertMessage>}

        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            <FormTextField control={control} name="name" label="Tên danh mục" autoFocus={!platform} disabled={platform} />
            {!platform && sources.length > 0 && (
              <div className="grid gap-2">
                <Label htmlFor="copy-template">Dựa trên danh mục</Label>
                <Select value={copyFrom || 'none'} onValueChange={(v) => setCopyFrom(v === 'none' ? '' : v)} disabled={busy}>
                  <SelectTrigger id="copy-template" className="w-full sm:w-80">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Không dựa trên danh mục nào</SelectItem>
                    {sources.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name} · {g.specFieldCount ?? 0} thuộc tính
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className={replacing ? 'text-sm text-warning-text' : 'text-sm text-muted-foreground'}>
                  {replacing
                    ? `Thuộc tính sản phẩm và biến thể theo đang có của ${group?.name} sẽ bị thay bằng bản chép. Sản phẩm đã có không đổi.`
                    : 'Chép thuộc tính sản phẩm (kể cả cờ bắt buộc, thứ tự) và biến thể theo một lần; sửa danh mục nguồn sau đó không ảnh hưởng danh mục này.'}
                </p>
              </div>
            )}
            <fieldset className="grid gap-3">
              <legend className="mb-1 text-sm font-medium">Gợi ý giá và ngưỡng tồn</legend>
              <p className="text-sm text-muted-foreground">Để trống ô nào thì ô đó theo Cài đặt sản phẩm của công ty.</p>
              <SuggestFields control={control} name="suggest" placeholder={inherited} disabled={busy} />
            </fieldset>
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
