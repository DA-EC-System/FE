import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ClipboardList, Info } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { HelpTip } from '@/components/common/HelpTip';
import { LifecycleSteps } from '@/components/common/LifecycleSteps';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSpinner } from '@/components/common/PageSpinner';
import type { StatusMeta } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useFinishShopSetup, useShop, useShopSetup } from '@/api/shops.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/router/routes';
import type { OpeningStockMode } from '@/types/shop';
import { formatDateTime } from '@/utils/format';
import { cn } from '@/lib/utils';
import { platformLabel } from './shopSchemas';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';

/** Các bước theo v-thiet-lap của Test_UI; bước cuối là lúc gửi thiết lập lên BE */
type SetupStep = 'match' | 'opening' | 'cutoff' | 'run';
const PATH: readonly SetupStep[] = ['match', 'opening', 'cutoff', 'run'];
const STEP_META: Record<SetupStep, StatusMeta> = {
  match: { label: 'Ghép listing có sẵn', variant: 'outline' },
  opening: { label: 'Tồn đầu kỳ', variant: 'outline' },
  cutoff: { label: 'Mốc kéo đơn', variant: 'outline' },
  run: { label: 'Bắt đầu chạy', variant: 'outline' },
};
/** Ba bước người dùng điền; bước "Bắt đầu chạy" chỉ sáng khi đang gửi */
const FORM_STEPS = 3;

const STEP_HELP: Record<Exclude<SetupStep, 'run'>, string> = {
  match:
    'Sàn đã có các SKU dưới đây với SKU người bán trùng SKU ở Commerio. Ghép để không phải đăng lại; listing ghép xong là đang bán. Listing chưa ghép vẫn bán trên sàn, chỉ không trừ tồn ở Commerio, ghép sau ở trang ghép SKU.',
  opening:
    'Số tồn trên sàn lúc nối có thể khác khả dụng ở Commerio. Chọn đẩy số Commerio lên sàn, hoặc kiểm kê lại trước rồi mới đẩy.',
  cutoff:
    'Mốc kéo đơn là thời điểm Commerio bắt đầu lấy đơn của gian hàng. Đơn đặt trước mốc đã xử lý trên sàn nên không kéo về, tránh giữ tồn sai. Commerio tự đặt mốc này khi bạn hoàn tất; chọn kiểm kê đầu kỳ thì mốc dời tới lúc phiếu kiểm kê ghi sổ.',
};

const setupSchema = z.object({
  externalSkuIds: z.array(z.string()),
  openingStock: z.enum(['push', 'stocktake']),
  /** Chỉ kiểm khi sàn tính hạn trả theo số ngày (xem daysError) */
  returnWindowDays: z.string(),
});
type SetupForm = z.infer<typeof setupSchema>;

/** Số ngày đổi trả: số nguyên 1–60 (§18.6.2) */
function daysError(value: string): string | null {
  if (!value.trim()) return 'Nhập số ngày đổi trả';
  const n = Number(value);
  return /^\d+$/.test(value.trim()) && n >= 1 && n <= 60 ? null : 'Số ngày đổi trả là số nguyên từ 1 đến 60';
}

const OPENING: { value: OpeningStockMode; label: string; hint: string }[] = [
  {
    value: 'push',
    label: 'Lấy số Commerio đẩy lên sàn',
    hint: 'Tồn trên sàn bằng khả dụng trong kho ngay khi xong thiết lập. Hợp khi kho vừa kiểm kê.',
  },
  {
    value: 'stocktake',
    label: 'Kiểm kê lại trước',
    hint: 'Lập phiếu kiểm kê nháp cho các SKU lệch; chỉ đẩy tồn sau khi phiếu ghi sổ, trong lúc chờ sàn giữ số đang có.',
  },
];

/** Thiết lập lần đầu gian hàng mới (sơ đồ C1, Documents/21 §18.6.2): ghép listing có sẵn, tồn đầu kỳ, mốc kéo đơn */
export function ShopSetupPage() {
  const { shopId = '' } = useParams();
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const shop = useShop(shopId);
  useBreadcrumb(shop.data?.shopName);
  const connecting = shop.data?.status === 'connecting';
  const preview = useShopSetup(shopId, connecting);
  const finish = useFinishShopSetup();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Rẽ nhánh theo năng lực sàn (§18.6.3), không theo mã sàn
  const needDays = shop.data?.capabilities.returnWindow === 'days';
  const firstShop = preview.data?.firstShopOfCompany === true;

  const form = useForm<SetupForm>({
    resolver: zodResolver(setupSchema),
    defaultValues: { externalSkuIds: [], openingStock: 'push', returnWindowDays: '' },
  });
  const { reset, watch, setValue } = form;
  const picked = watch('externalSkuIds');
  const openingStock = watch('openingStock');

  // Mặc định nhận mọi gợi ý; gian hàng đầu tiên của công ty chỉ được kiểm kê đầu kỳ
  useEffect(() => {
    if (preview.data) {
      reset({
        ...form.getValues(),
        externalSkuIds: preview.data.suggestions.map((s) => s.externalSkuId),
        ...(preview.data.firstShopOfCompany ? { openingStock: 'stocktake' as const } : {}),
      });
    }
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
  const current: SetupStep = finish.isPending ? 'run' : PATH[step];

  const toggle = (id: string, on: boolean) =>
    setValue('externalSkuIds', on ? [...picked, id] : picked.filter((x) => x !== id));

  const onSubmit = async (values: SetupForm) => {
    setError(null);
    const badDays = needDays ? daysError(values.returnWindowDays) : null;
    if (badDays) {
      form.setError('returnWindowDays', { message: badDays });
      return;
    }
    try {
      const result = await finish.mutateAsync({
        id: shopId,
        externalSkuIds: values.externalSkuIds,
        openingStock: values.openingStock,
        // Mốc kéo đơn do BE đặt, không gửi (§18.6.2)
        ...(needDays ? { returnWindowDays: Number(values.returnWindowDays) } : {}),
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
      const fieldErrors = getProblem(e)?.errors;
      if (fieldErrors?.returnWindowDays) {
        setStep(2);
        form.setError('returnWindowDays', { message: fieldErrors.returnWindowDays });
      }
      if (fieldErrors?.openingStock) {
        setStep(1);
        form.setError('openingStock', { message: fieldErrors.openingStock });
      }
      if (!fieldErrors?.returnWindowDays && !fieldErrors?.openingStock) setError(problemMessage(e));
    }
  };

  const next = () => setStep((s) => s + 1);

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <PageHeader
        title={`Thiết lập ${shop.data.shopName}`}
        subtitle={`${platformLabel(shop.data.platform, shop.data.platformName)} · làm một lần sau khi nối, xong mới kéo đơn và đẩy tồn`}
        help="Gian hàng chưa bán được cho đến khi xong ba bước. Bỏ dở thì quay lại bằng nút Thiết lập ở danh sách gian hàng."
      />
      <Card>
        <CardContent>
          <LifecycleSteps path={PATH} current={current} statuses={STEP_META} />
        </CardContent>
      </Card>
      {error && <AlertMessage severity="error">{error}</AlertMessage>}
      {preview.isError && <AlertMessage severity="error">{problemMessage(preview.error)}</AlertMessage>}

      <Form {...form}>
        <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
          <Card>
            {step === 0 && (
              <>
                <StepHeader title="Ghép listing có sẵn" help={STEP_HELP.match}>
                  {preview.data && (
                    <span className="ms-auto text-sm font-normal text-muted-foreground">
                      Đã chọn <b className="font-mono text-foreground">{chosen.length}</b> / {suggestions.length}
                    </span>
                  )}
                </StepHeader>
                <CardContent className="grid gap-2" data-testid="setup-suggestions" aria-busy={preview.isLoading}>
                  {preview.isLoading && (
                    <>
                      <span className="sr-only">Đang đọc SKU trên sàn...</span>
                      {[0, 1, 2].map((k) => (
                        <Skeleton key={k} className="h-14 w-full" />
                      ))}
                    </>
                  )}
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
                <StepHeader title="Tồn đầu kỳ cho các SKU đã ghép" help={STEP_HELP.opening} />
                <CardContent className="grid gap-4">
                  <p className="text-sm text-muted-foreground">
                    {drifted.length
                      ? `${drifted.length} SKU có số trên sàn khác khả dụng ở Commerio.`
                      : 'Số trên sàn khớp khả dụng ở Commerio.'}
                  </p>
                  {drifted.length > 0 && (
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full text-sm" data-testid="setup-drift">
                        <thead className="bg-table-head text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 text-start font-normal">SKU</th>
                            <th className="px-3 py-2 text-end font-normal">Trên sàn</th>
                            <th className="px-3 py-2 text-end font-normal">Khả dụng Commerio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {drifted.map((s) => (
                            <tr key={s.externalSkuId} className="border-t">
                              <td className="px-3 py-2 font-mono">{s.sku}</td>
                              <td className="px-3 py-2 text-end tabular-nums">{s.platformStock}</td>
                              <td className="px-3 py-2 text-end tabular-nums">{s.available}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {firstShop && (
                    <AlertMessage severity="info">
                      Đây là gian hàng đầu tiên của công ty nên phải kiểm kê đầu kỳ: kho đếm lại rồi mới đẩy tồn lên sàn.
                    </AlertMessage>
                  )}
                  <FormField
                    control={form.control}
                    name="openingStock"
                    render={() => (
                      <FormItem>
                        <RadioGroup
                          value={openingStock}
                          onValueChange={(v) => setValue('openingStock', v as OpeningStockMode, { shouldValidate: true })}
                          aria-label="Cách xử lý tồn đầu kỳ"
                          className="grid gap-3 sm:grid-cols-2"
                        >
                          {OPENING.map((o) => {
                            const locked = firstShop && o.value === 'push';
                            return (
                              <Label
                                key={o.value}
                                htmlFor={`opening-${o.value}`}
                                className={cn(
                                  'flex items-start gap-3 rounded-lg border p-3.5 font-normal transition-colors',
                                  openingStock === o.value && 'border-primary bg-accent',
                                  locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-primary',
                                )}
                              >
                                <RadioGroupItem id={`opening-${o.value}`} value={o.value} disabled={locked} className="mt-0.5" />
                                <span className="grid gap-0.5">
                                  <span className="font-medium">{o.label}</span>
                                  <span className="text-muted-foreground">{o.hint}</span>
                                </span>
                              </Label>
                            );
                          })}
                        </RadioGroup>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {openingStock === 'stocktake' && (
                    <p className="flex items-start gap-2 text-sm text-muted-foreground">
                      <ClipboardList className="mt-0.5 size-4 shrink-0" aria-hidden />
                      Sẽ lập phiếu kiểm kê nháp cho các SKU lệch, giao cho kho. Trong lúc chờ ghi sổ, Commerio chưa đẩy tồn.
                    </p>
                  )}
                </CardContent>
              </>
            )}

            {step === 2 && (
              <>
                <StepHeader title="Kéo đơn từ lúc nào" help={STEP_HELP.cutoff} />
                <CardContent className="grid gap-4">
                  <div className="grid gap-1 rounded-lg bg-muted px-4 py-3" data-testid="proposed-cutoff">
                    <span className="text-xs text-muted-foreground">Mốc kéo đơn Commerio sẽ đặt</span>
                    {preview.isLoading ? (
                      <Skeleton className="h-5 w-40" />
                    ) : (
                      <b className="font-mono">
                        {preview.data ? formatDateTime(preview.data.proposedCutoffAt) : 'Chưa đọc được'}
                      </b>
                    )}
                  </div>
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {openingStock === 'stocktake'
                      ? 'Chọn kiểm kê đầu kỳ thì mốc kéo đơn dời tới lúc phiếu kiểm kê ghi sổ.'
                      : 'Đơn đặt trước mốc này không kéo về Commerio. Đơn kéo về sau mốc sẽ giữ hàng theo tồn hiện có.'}
                  </p>
                  {needDays && (
                    <FormField
                      control={form.control}
                      name="returnWindowDays"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel hint="Sàn không báo hạn trả hàng nên Commerio tính hạn bằng ngày giao cộng số ngày này. Hết hạn trả thì đơn mới được hoàn tất.">
                            Số ngày đổi trả
                          </FormLabel>
                          <FormControl>
                            <Input type="number" inputMode="numeric" min={1} max={60} step={1} className="w-32" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </CardContent>
              </>
            )}

            <CardFooter className="justify-between border-t pt-4">
              <Button type="button" variant="outline" disabled={step === 0 || finish.isPending} onClick={() => setStep((s) => s - 1)}>
                Quay lại
              </Button>
              {/* `key` khác nhau để React không dùng lại nút: nút "Tiếp" đổi thành submit ngay trong lúc bấm
                  thì trình duyệt gửi form luôn, bỏ qua bước cuối */}
              {step < FORM_STEPS - 1 ? (
                <Button key="next" type="button" disabled={preview.isLoading} onClick={next}>
                  Tiếp
                </Button>
              ) : (
                <Button key="submit" type="submit" disabled={finish.isPending || preview.isLoading}>
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

/** Đầu ô của một bước: tiêu đề kèm HelpTip thay cho đoạn mô tả luôn hiện (FE#131) */
function StepHeader({ title, help, children }: { title: string; help: string; children?: ReactNode }) {
  return (
    <CardHeader className="border-b">
      <CardTitle className="flex items-center gap-1.5">
        {title}
        <HelpTip content={help} topic={title} />
        {children}
      </CardTitle>
    </CardHeader>
  );
}
