import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { FormTextField } from '@/components/common/FormTextField';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { useProductSettings, useUpdateProductSettings } from '@/api/catalog.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { useCan } from '@/hooks/usePermission';
import { PERMISSIONS } from '@/utils/permissions';
import { renderSku, skuPatternError } from '@/utils/sku';
import type { ProductSettings, SuggestConfig } from '@/types/catalog';
import { SuggestFields } from './SuggestFields';
import { fromSuggestForm, suggestFieldErrors, suggestFormSchema, toSuggestForm } from './suggest';

const schema = z.object({
  skuPattern: z.string().superRefine((value, ctx) => {
    const error = skuPatternError(value);
    if (error) ctx.addIssue({ code: 'custom', message: error });
  }),
  suggest: suggestFormSchema,
});
type SettingsForm = z.infer<typeof schema>;

const toForm = (s: ProductSettings): SettingsForm => ({ skuPattern: s.skuPattern, suggest: toSuggestForm(s.suggest) });

// Ở công ty, ô trống là không gợi ý; riêng làm tròn giá trống là bước 1 đồng (Documents/21 §5.2)
const companyPlaceholder = (key: keyof SuggestConfig) => (key === 'priceRounding' ? '1 đ' : 'Không gợi ý');

/**
 * Cài đặt sản phẩm của công ty (FE#350, `GET/PUT /catalog/settings`): mẫu SKU dùng cho mọi SKU sinh sau này và năm
 * giá trị gợi ý mặc định, nhóm hàng ghi đè được. Xem cần `catalog.product.view`, sửa cần `catalog.group.manage`.
 */
export function ProductSettingsPage() {
  const settingsQuery = useProductSettings();
  const settings = settingsQuery.data;

  return (
    <>
      <PageHeader
        title="Cài đặt sản phẩm"
        subtitle="Mẫu mã SKU và gợi ý giá, gợi ý nhập lại mặc định của công ty."
        help="Mẫu SKU áp dụng cho SKU sinh sau khi lưu; SKU đã có giữ nguyên. Gợi ý ở đây dùng cho mọi nhóm hàng chưa đặt gợi ý riêng."
      />
      {settingsQuery.isError && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(settingsQuery.error)}
        </AlertMessage>
      )}
      {settingsQuery.isPending && <Skeleton className="h-96 w-full max-w-2xl" />}
      {settings && <SettingsFormView settings={settings} onConflict={() => void settingsQuery.refetch()} />}
    </>
  );
}

function SettingsFormView({ settings, onConflict }: { settings: ProductSettings; onConflict: () => void }) {
  const canEdit = useCan()(PERMISSIONS.catalogSetup);
  const update = useUpdateProductSettings();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<SettingsForm>({ resolver: zodResolver(schema), defaultValues: toForm(settings) });
  const { control, reset, setError: setFieldError } = form;

  // Bản mới (lưu ở nơi khác, tải lại sau lệch version): nạp vào ô chưa sửa, giữ ô đang sửa
  useEffect(() => {
    reset(toForm(settings), { keepDirtyValues: true });
  }, [settings, reset]);

  const pattern = (useWatch({ control, name: 'skuPattern' }) ?? '').trim();
  const preview = pattern && !skuPatternError(pattern)
    ? [renderSku(pattern, settings.skuNextSeq, ['DEN', 'XL']), renderSku(pattern, settings.skuNextSeq + 1, [])]
    : null;

  const onSubmit = form.handleSubmit((v) => {
    setError(null);
    update.mutate(
      { skuPattern: v.skuPattern.trim(), suggest: fromSuggestForm(v.suggest), version: settings.version },
      {
        onSuccess: (saved) => {
          reset(toForm(saved));
          toast.success('Đã lưu cài đặt sản phẩm');
        },
        onError: (e) => {
          const problem = getProblem(e);
          if (problem?.code === 'version_conflict') {
            onConflict();
            setError('Cài đặt vừa được người khác sửa. Đã tải bản mới, phần bạn đang sửa vẫn giữ; xem lại rồi lưu lần nữa.');
            return;
          }
          const fields = problem?.errors ?? {};
          const suggestErrors = suggestFieldErrors(fields);
          suggestErrors.forEach(([key, message]) => setFieldError(`suggest.${key}`, { message }));
          if (fields.skuPattern) setFieldError('skuPattern', { message: fields.skuPattern });
          if (!fields.skuPattern && !suggestErrors.length) setError(getErrorMessage(e));
        },
      },
    );
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="grid max-w-2xl gap-4" data-testid="product-settings-form">
        {error && (
          <AlertMessage severity="warning" onClose={() => setError(null)}>
            {error}
          </AlertMessage>
        )}
        {!canEdit && (
          <AlertMessage severity="info">Bạn chỉ xem được. Cần quyền quản lý nhóm hàng để sửa.</AlertMessage>
        )}
        <Card className="gap-0 py-0">
          <div className="border-b px-4 py-3 text-sm font-semibold">Mẫu mã SKU</div>
          <div className="grid gap-3 px-4 py-4">
            <FormTextField
              control={control}
              name="skuPattern"
              label="Mẫu SKU"
              disabled={!canEdit}
              hint="{SEQ:n} là số thứ tự, đệm 0 cho đủ n chữ số (bắt buộc đúng một lần); {VAL} là mã các giá trị phân loại nối bằng dấu gạch; chữ cố định gồm A-Z, 0-9, - và _."
              description="Chỉ áp dụng cho SKU sinh sau khi lưu; SKU đã có giữ nguyên."
            />
            <div className="rounded-md bg-muted p-3" data-testid="sku-preview">
              <p className="mb-1 text-xs text-muted-foreground">
                Xem trước (số kế tiếp {settings.skuNextSeq}; có phân loại Đen, XL · không phân loại)
              </p>
              <p className="font-mono text-sm">{preview ? preview.join('   ·   ') : '—'}</p>
            </div>
          </div>
        </Card>
        <Card className="gap-0 py-0">
          <div className="border-b px-4 py-3 text-sm font-semibold">Gợi ý mặc định</div>
          <div className="grid gap-3 px-4 py-4">
            <p className="text-sm text-muted-foreground">
              Dùng cho nhóm hàng chưa đặt gợi ý riêng. Để trống thì không gợi ý.
            </p>
            <SuggestFields control={control} name="suggest" placeholder={companyPlaceholder} disabled={!canEdit} />
          </div>
        </Card>
        {canEdit && (
          <div className="flex gap-2">
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Đang lưu…' : 'Lưu'}
            </Button>
            <Button type="button" variant="outline" disabled={update.isPending} onClick={() => reset(toForm(settings))}>
              Hoàn tác
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
