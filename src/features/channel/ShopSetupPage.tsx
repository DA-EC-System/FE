import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import dayjs from 'dayjs';
import { z } from 'zod';
import { toast } from 'sonner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSpinner } from '@/components/common/PageSpinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useFinishShopSetup, useShop, useShopSetup } from '@/api/shops.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/router/routes';
import type { OpeningStockMode } from '@/types/shop';
import { platformLabel } from './shopSchemas';

const STEPS = ['Ghép listing có sẵn', 'Tồn đầu kỳ', 'Mốc kéo đơn'] as const;

const today = () => dayjs().format('YYYY-MM-DD');

const setupSchema = z.object({
  externalSkuIds: z.array(z.string()),
  openingStock: z.enum(['push', 'stocktake']),
  orderCutoffAt: z
    .string()
    .min(1, 'Chọn mốc kéo đơn')
    .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && dayjs(v).isValid(), 'Ngày không hợp lệ')
    .refine((v) => v <= today(), 'Mốc kéo đơn không được ở tương lai'),
});
type SetupForm = z.infer<typeof setupSchema>;

const OPENING: { value: OpeningStockMode; label: string; hint: string }[] = [
  {
    value: 'push',
    label: 'Lấy số Commerio đẩy lên sàn',
    hint: 'Số trên sàn đổi theo khả dụng ở Commerio ngay khi xong thiết lập.',
  },
  {
    value: 'stocktake',
    label: 'Kiểm kê lại trước',
    hint: 'Lập phiếu kiểm kê nháp cho các SKU lệch; tồn của các SKU này chờ đẩy đến khi phiếu ghi sổ.',
  },
];

/** Thiết lập lần đầu gian hàng mới (sơ đồ C1): ghép listing có sẵn, kiểm kê đầu kỳ, mốc kéo đơn */
export function ShopSetupPage() {
  const { shopId = '' } = useParams();
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const shop = useShop(shopId);
  const connecting = shop.data?.status === 'connecting';
  const preview = useShopSetup(shopId, connecting);
  const finish = useFinishShopSetup();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<SetupForm>({
    resolver: zodResolver(setupSchema),
    defaultValues: { externalSkuIds: [], openingStock: 'push', orderCutoffAt: today() },
  });
  const { reset, watch, setValue } = form;
  const picked = watch('externalSkuIds');
  const openingStock = watch('openingStock');

  // Mặc định nhận mọi gợi ý; người dùng bỏ chọn cái không đúng
  useEffect(() => {
    if (preview.data) reset({ ...form.getValues(), externalSkuIds: preview.data.suggestions.map((s) => s.externalSkuId) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview.data, reset]);

  if (shop.isLoading) return <PageSpinner />;
  if (shop.data && !connecting) return <Navigate to={ROUTES.company.shop(companyId, shopId)} replace />;
  if (shop.isError || !shop.data) {
    return <AlertMessage severity="error">{problemMessage(shop.error)}</AlertMessage>;
  }

  const suggestions = preview.data?.suggestions ?? [];
  const chosen = suggestions.filter((s) => picked.includes(s.externalSkuId));
  const drifted = chosen.filter((s) => s.platformStock !== s.available);

  const toggle = (id: string, on: boolean) =>
    setValue('externalSkuIds', on ? [...picked, id] : picked.filter((x) => x !== id));

  const onSubmit = async (values: SetupForm) => {
    setError(null);
    try {
      const result = await finish.mutateAsync({
        id: shopId,
        ...values,
        orderCutoffAt: dayjs(values.orderCutoffAt).startOf('day').toISOString(),
      });
      toast.success(
        [
          `${result.shop.shopName} đã sẵn sàng bán`,
          result.matched ? `ghép ${result.matched} listing` : null,
          result.stocktakeNumber ? `lập phiếu kiểm kê ${result.stocktakeNumber}` : null,
        ]
          .filter(Boolean)
          .join(', '),
      );
      navigate(ROUTES.company.shop(companyId, shopId), { replace: true });
    } catch (e) {
      const fieldErrors = getProblem(e)?.errors as Record<string, string> | undefined;
      if (fieldErrors?.orderCutoffAt) {
        setStep(2);
        form.setError('orderCutoffAt', { message: fieldErrors.orderCutoffAt });
      }
      setError(problemMessage(e));
    }
  };

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <PageHeader
        title={`Thiết lập ${shop.data.shopName}`}
        subtitle={`${platformLabel(shop.data.platform, shop.data.platformName)} · gian hàng chưa bán được cho đến khi xong ba bước`}
      />
      <ol className="flex flex-wrap gap-2" aria-label="Các bước thiết lập">
        {STEPS.map((label, i) => (
          <li key={label}>
            <Badge variant={i === step ? 'default' : i < step ? 'success' : 'outline'} aria-current={i === step ? 'step' : undefined}>
              {i + 1}. {label}
            </Badge>
          </li>
        ))}
      </ol>
      {error && <AlertMessage severity="error">{error}</AlertMessage>}
      {preview.isError && <AlertMessage severity="error">{problemMessage(preview.error)}</AlertMessage>}

      <Form {...form}>
        <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
          <Card>
            {step === 0 && (
              <>
                <CardHeader>
                  <CardTitle>Ghép listing có sẵn</CardTitle>
                  <CardDescription>
                    Sàn đã có các SKU dưới đây với SKU người bán trùng SKU ở Commerio. Ghép để không phải đăng lại; listing
                    ghép xong là đang bán.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2" data-testid="setup-suggestions">
                  {preview.isLoading && <p className="text-sm text-muted-foreground">Đang đọc SKU trên sàn...</p>}
                  {preview.data && !suggestions.length && (
                    <p className="text-sm text-muted-foreground">Không có SKU nào trên sàn trùng SKU ở Commerio.</p>
                  )}
                  {suggestions.map((s) => (
                    <label
                      key={s.externalSkuId}
                      className="flex items-center gap-3 rounded-md border p-3"
                      data-suggestion={s.sku}
                    >
                      <Checkbox
                        checked={picked.includes(s.externalSkuId)}
                        onCheckedChange={(v) => toggle(s.externalSkuId, v === true)}
                        aria-label={`Ghép ${s.sku}`}
                      />
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate">{s.title}</span>
                        <span className="font-mono text-xs text-muted-foreground">{s.sku}</span>
                      </span>
                    </label>
                  ))}
                  {Boolean(preview.data?.unmatchedRemote) && (
                    <p className="text-sm text-muted-foreground">
                      Còn {preview.data!.unmatchedRemote} SKU trên sàn không trùng SKU nào; ghép tay sau ở trang ghép SKU.
                    </p>
                  )}
                </CardContent>
              </>
            )}

            {step === 1 && (
              <>
                <CardHeader>
                  <CardTitle>Tồn đầu kỳ</CardTitle>
                  <CardDescription>
                    {drifted.length
                      ? `${drifted.length} SKU có số trên sàn khác khả dụng ở Commerio.`
                      : 'Số trên sàn khớp khả dụng ở Commerio.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {drifted.length > 0 && (
                    <table className="w-full text-sm" data-testid="setup-drift">
                      <thead className="text-muted-foreground">
                        <tr>
                          <th className="text-start font-normal">SKU</th>
                          <th className="text-end font-normal">Trên sàn</th>
                          <th className="text-end font-normal">Khả dụng Commerio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {drifted.map((s) => (
                          <tr key={s.externalSkuId}>
                            <td className="font-mono">{s.sku}</td>
                            <td className="text-end">{s.platformStock}</td>
                            <td className="text-end">{s.available}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <RadioGroup
                    value={openingStock}
                    onValueChange={(v) => setValue('openingStock', v as OpeningStockMode)}
                    aria-label="Cách xử lý tồn đầu kỳ"
                  >
                    {OPENING.map((o) => (
                      <div key={o.value} className="flex items-start gap-3">
                        <RadioGroupItem id={`opening-${o.value}`} value={o.value} className="mt-1" />
                        <Label htmlFor={`opening-${o.value}`} className="grid gap-0.5 font-normal">
                          <span className="font-medium">{o.label}</span>
                          <span className="text-muted-foreground">{o.hint}</span>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </CardContent>
              </>
            )}

            {step === 2 && (
              <>
                <CardHeader>
                  <CardTitle>Mốc kéo đơn</CardTitle>
                  <CardDescription>
                    Commerio chỉ kéo đơn tạo từ ngày này. Đơn cũ hơn đã xử lý trên sàn, kéo về sẽ giữ tồn sai.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="orderCutoffAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Kéo đơn từ ngày</FormLabel>
                        <FormControl>
                          <Input type="date" className="w-44" max={today()} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </>
            )}

            <CardFooter className="justify-between">
              <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
                Quay lại
              </Button>
              {step < STEPS.length - 1 ? (
                <Button type="button" disabled={preview.isLoading} onClick={() => setStep((s) => s + 1)}>
                  Tiếp
                </Button>
              ) : (
                <Button type="submit" disabled={finish.isPending}>
                  {finish.isPending ? 'Đang hoàn tất...' : 'Hoàn tất thiết lập'}
                </Button>
              )}
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}
