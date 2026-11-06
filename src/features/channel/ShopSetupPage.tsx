import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { CheckCircle2, CircleDashed, ClipboardList, Info, Loader2, Lock, XCircle } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { HelpTip } from '@/components/common/HelpTip';
import { LifecycleSteps } from '@/components/common/LifecycleSteps';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSpinner } from '@/components/common/PageSpinner';
import { StatusBadge, type StatusMeta } from '@/components/common/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
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
import { VariantPicker } from '@/features/inventory/VariantPicker';
import type {
  OpeningStockMode,
  SetupSuggestion,
  Shop,
  ShopSetupResult,
  ShopSetupStep,
  ShopSetupStepKey,
  ShopSetupStepStatus,
} from '@/types/shop';
import { formatDateTime } from '@/utils/format';
import { cn } from '@/lib/utils';
import { platformLabel } from './shopSchemas';
import {
  SETUP_POLL_MAX_MS,
  SETUP_POLL_MS,
  decisionErrors,
  initialChoices,
  setupRunning,
  toDecisions,
  type RowChoice,
} from './setupDecisions';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';

/** Các bước theo v-thiet-lap của Test_UI; bước cuối hiện tiến độ việc nền sau khi gửi (§18.7.7) */
type SetupStep = 'match' | 'opening' | 'cutoff' | 'run';
const PATH: readonly SetupStep[] = ['match', 'opening', 'cutoff', 'run'];
const STEP_META: Record<SetupStep, StatusMeta> = {
  match: { label: 'Ghép listing có sẵn', variant: 'outline' },
  opening: { label: 'Tồn đầu kỳ', variant: 'outline' },
  cutoff: { label: 'Mốc kéo đơn', variant: 'outline' },
  run: { label: 'Bắt đầu chạy', variant: 'outline' },
};
/** Ba bước người dùng điền; bước "Bắt đầu chạy" sáng khi đang gửi và sau khi gửi xong */
const FORM_STEPS = 3;

const STEP_HELP: Record<SetupStep, string> = {
  match:
    'Commerio đọc mọi SKU người bán trên sàn và gợi ý biến thể: trùng SKU, hoặc tên gần giống. Nhận gợi ý, chọn biến thể khác, hoặc bỏ qua. Listing ghép xong là đang bán; SKU bỏ qua vẫn bán trên sàn, chỉ không trừ tồn ở Commerio, ghép sau ở trang Listing và giá.',
  opening:
    'Số tồn trên sàn lúc nối có thể khác khả dụng ở Commerio. Chọn đẩy số Commerio lên sàn, hoặc kiểm kê lại trước rồi mới đẩy.',
  cutoff:
    'Mốc kéo đơn là thời điểm Commerio bắt đầu lấy đơn của gian hàng. Đơn đặt trước mốc đã xử lý trên sàn nên không kéo về, tránh giữ tồn sai. Commerio tự đặt mốc này khi bạn hoàn tất; chọn kiểm kê đầu kỳ thì mốc dời tới lúc phiếu kiểm kê ghi sổ.',
  run: 'Commerio chạy nền các việc còn lại: kéo đơn đang mở và đẩy tồn lên sàn. Trang tự cập nhật; đóng trang thì việc vẫn chạy.',
};

const SETUP_STEP_LABEL: Record<ShopSetupStepKey, string> = {
  match: 'Ghép listing',
  opening_stock: 'Kiểm kê đầu kỳ',
  open_orders: 'Kéo đơn đang mở',
  push_stock: 'Đẩy tồn lên sàn',
};
const SETUP_STATUS: Record<ShopSetupStepStatus, StatusMeta> = {
  pending: { label: 'Chờ làm', variant: 'outline' },
  running: { label: 'Đang chạy', variant: 'info' },
  done: { label: 'Xong', variant: 'success' },
  failed: { label: 'Lỗi', variant: 'destructive' },
  blocked: { label: 'Đang chờ', variant: 'warning' },
};

const setupSchema = z.object({
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

/** Thiết lập lần đầu gian hàng mới (sơ đồ C1, Documents/21 §18.6.2, §18.7.5–7) */
export function ShopSetupPage() {
  const { shopId = '' } = useParams();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  // Gửi xong thì ở lại bước "Bắt đầu chạy" để xem tiến độ, không chuyển trang
  const [result, setResult] = useState<ShopSetupResult | null>(null);
  const pollFrom = useRef(0);
  const shop = useShop(shopId, (data) =>
    result && setupRunning(data) && Date.now() - pollFrom.current < SETUP_POLL_MAX_MS ? SETUP_POLL_MS : false,
  );
  useBreadcrumb(shop.data?.shopName);
  const connecting = shop.data?.status === 'connecting';
  const preview = useShopSetup(shopId, connecting && !result);
  const finish = useFinishShopSetup();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, RowChoice | null>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  // Rẽ nhánh theo năng lực sàn (§18.6.3), không theo mã sàn
  const needDays = shop.data?.capabilities.returnWindow === 'days';
  const firstShop = preview.data?.firstShopOfCompany === true;

  const form = useForm<SetupForm>({
    resolver: zodResolver(setupSchema),
    defaultValues: { openingStock: 'push', returnWindowDays: '' },
  });
  const { reset, watch, setValue } = form;
  const openingStock = watch('openingStock');

  // Gian hàng đầu tiên của công ty chỉ được kiểm kê đầu kỳ
  useEffect(() => {
    if (preview.data) {
      setChoices(initialChoices(preview.data.suggestions));
      if (preview.data.firstShopOfCompany) reset({ ...form.getValues(), openingStock: 'stocktake' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview.data, reset]);

  if (shop.isLoading) return <PageSpinner />;
  if (shop.data && !connecting && !result) return <Navigate to={ROUTES.company.shop(companyId, shopId)} replace />;
  if (shop.isError || !shop.data) {
    return <AlertMessage severity="error">{problemMessage(shop.error)}</AlertMessage>;
  }

  const suggestions = preview.data?.suggestions ?? [];
  const chosen = suggestions.filter((s) => choices[s.externalSkuId]);
  // Lệch = dòng đã có biến thể mà số trên sàn khác khả dụng sẽ đẩy (§18.7.5)
  const drifted = chosen.filter((s) => s.platformStock !== choices[s.externalSkuId]!.available);
  const current: SetupStep = finish.isPending || result ? 'run' : PATH[step];

  const choose = (id: string, choice: RowChoice | null) => {
    setChoices((c) => ({ ...c, [id]: choice }));
    setRowErrors(({ [id]: _drop, ...rest }) => rest);
  };

  const onSubmit = async (values: SetupForm) => {
    setError(null);
    setRowErrors({});
    const badDays = needDays ? daysError(values.returnWindowDays) : null;
    if (badDays) {
      form.setError('returnWindowDays', { message: badDays });
      return;
    }
    try {
      const done = await finish.mutateAsync({
        id: shopId,
        decisions: toDecisions(suggestions, choices),
        openingStock: values.openingStock,
        // Mốc kéo đơn do BE đặt, không gửi (§18.6.2)
        ...(needDays ? { returnWindowDays: Number(values.returnWindowDays) } : {}),
      });
      pollFrom.current = Date.now();
      setResult(done);
      toast.success(
        [
          `${done.shop.shopName} đã sẵn sàng bán`,
          done.matched ? `ghép ${done.matched} listing` : null,
          done.stocktakeNumber ? `lập phiếu kiểm kê ${done.stocktakeNumber}` : null,
        ]
          .filter(Boolean)
          .join(', '),
      );
    } catch (e) {
      const fieldErrors = getProblem(e)?.errors;
      const byRow = decisionErrors(suggestions, fieldErrors);
      if (Object.keys(byRow).length) {
        setStep(0);
        setRowErrors(byRow);
        setError('Có SKU ghép chưa hợp lệ, xem từng dòng bên dưới.');
        return;
      }
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

      {result ? (
        <SetupProgress shop={shop.data} companyId={companyId} timedOut={Date.now() - pollFrom.current >= SETUP_POLL_MAX_MS} />
      ) : (
        <Form {...form}>
          <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
            <Card>
              {step === 0 && (
                <>
                  <StepHeader title="Ghép listing có sẵn" help={STEP_HELP.match}>
                    {preview.data && (
                      <span className="ms-auto text-sm font-normal text-muted-foreground">
                        Đã ghép <b className="font-mono text-foreground">{chosen.length}</b> / {suggestions.length}
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
                      <p className="text-sm text-muted-foreground">Gian hàng chưa có SKU nào trên sàn.</p>
                    )}
                    {suggestions.map((s) => (
                      <SuggestionRow
                        key={s.externalSkuId}
                        suggestion={s}
                        choice={choices[s.externalSkuId] ?? null}
                        error={rowErrors[s.externalSkuId]}
                        taken={
                          new Set(
                            Object.entries(choices)
                              .filter(([id, c]) => id !== s.externalSkuId && c)
                              .map(([, c]) => c!.variantId),
                          )
                        }
                        onChoose={(c) => choose(s.externalSkuId, c)}
                      />
                    ))}
                    {Boolean(preview.data?.unmatchedRemote) && (
                      <p className="text-sm text-muted-foreground">
                        {preview.data!.unmatchedRemote} SKU trên sàn không tìm được biến thể nào; chọn tay ở dòng đó hoặc ghép sau ở
                        trang Listing và giá.
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
                              <th className="px-3 py-2 text-end font-normal">Sau khi đẩy</th>
                            </tr>
                          </thead>
                          <tbody>
                            {drifted.map((s) => {
                              const c = choices[s.externalSkuId]!;
                              return (
                                <tr key={s.externalSkuId} className="border-t" data-drift={c.sku}>
                                  <td className="px-3 py-2 font-mono">{c.sku}</td>
                                  <td className="px-3 py-2 text-end tabular-nums">{s.platformStock}</td>
                                  <td className="px-3 py-2 text-end tabular-nums">{c.available}</td>
                                  <td className="px-3 py-2 text-end font-medium tabular-nums" data-testid="after-push">
                                    {c.available}
                                  </td>
                                </tr>
                              );
                            })}
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
                <Button
                  type="button"
                  variant="outline"
                  disabled={step === 0 || finish.isPending}
                  onClick={() => setStep((s) => s - 1)}
                >
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
      )}
    </div>
  );
}

/** Một SKU sàn ở bước 1: gợi ý kèm cách khớp, nhận, chọn khác hoặc bỏ qua (§18.7.5) */
function SuggestionRow({
  suggestion: s,
  choice,
  error,
  taken,
  onChoose,
}: {
  suggestion: SetupSuggestion;
  choice: RowChoice | null;
  error?: string;
  taken: Set<string>;
  onChoose: (choice: RowChoice | null) => void;
}) {
  const [picking, setPicking] = useState(false);
  const hasSuggestion = Boolean(s.variantId);
  const onSuggested = choice && !choice.picked;
  const pickerId = `variant-picker-${s.externalSkuId}`;
  return (
    <div
      className={cn('grid gap-2 rounded-md border p-3', error && 'border-destructive', !choice && 'bg-muted/40')}
      data-suggestion={s.externalSkuId}
      data-match={s.match}
      data-chosen={choice ? choice.variantId : ''}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate">{s.title}</span>
          <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <MatchBadge suggestion={s} />
            {choice ? (
              <span>
                Ghép <b className="font-mono text-foreground">{choice.sku}</b>
                {choice.picked && ' (bạn chọn)'} · khả dụng {choice.available}
              </span>
            ) : (
              <span>Bỏ qua: vẫn bán trên sàn, không trừ tồn ở Commerio</span>
            )}
          </span>
        </span>
        <div className="flex flex-wrap gap-2">
          {hasSuggestion && !onSuggested && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Nhận gợi ý cho ${s.title}`}
              onClick={() => {
                setPicking(false);
                onChoose({ variantId: s.variantId!, sku: s.sku ?? '', available: s.available ?? 0, picked: false });
              }}
            >
              Nhận gợi ý
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-expanded={picking}
            aria-controls={pickerId}
            aria-label={`Chọn biến thể khác cho ${s.title}`}
            onClick={() => setPicking((v) => !v)}
          >
            {hasSuggestion ? 'Chọn khác' : 'Chọn biến thể'}
          </Button>
          {choice && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Bỏ qua ${s.title}`}
              onClick={() => {
                setPicking(false);
                onChoose(null);
              }}
            >
              Bỏ qua
            </Button>
          )}
        </div>
      </div>
      {picking && (
        <VariantPicker
          id={pickerId}
          label="Ghép với biến thể"
          takenLabel="Đã ghép ở dòng khác"
          taken={taken}
          onPick={(level) => {
            setPicking(false);
            onChoose({ variantId: level.variantId, sku: level.sku, available: level.available, picked: true });
          }}
        />
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert" data-testid="decision-error">
          {error}
        </p>
      )}
    </div>
  );
}

function MatchBadge({ suggestion: s }: { suggestion: SetupSuggestion }) {
  if (s.match === 'sku') return <Badge variant="success">Trùng SKU</Badge>;
  if (s.match === 'name')
    return (
      <Badge variant="info" data-testid="match-score">
        Tên giống {Math.round((s.score ?? 0) * 100)}%
      </Badge>
    );
  return <Badge variant="outline">Không tìm được</Badge>;
}

/** Bước "Bắt đầu chạy": tiến độ việc nền đọc từ Shop.setup (§18.7.7) */
function SetupProgress({ shop, companyId, timedOut }: { shop: Shop; companyId: string; timedOut: boolean }) {
  const steps = shop.setup?.steps ?? [];
  const running = setupRunning(shop);
  const unmatched = shop.setup?.unmatchedCount ?? 0;
  const listings = ROUTES.company.shop(companyId, shop.id);
  return (
    <Card>
      <StepHeader title="Bắt đầu chạy" help={STEP_HELP.run}>
        <span className="ms-auto text-sm font-normal text-muted-foreground" aria-live="polite">
          {running ? 'Đang chạy...' : steps.length ? 'Đã dừng cập nhật' : 'Xong'}
        </span>
      </StepHeader>
      <CardContent className="grid gap-3">
        {!steps.length && <p className="text-sm text-muted-foreground">Mọi việc thiết lập đã xong.</p>}
        <ol className="grid gap-2" data-testid="setup-progress">
          {steps.map((st) => (
            <ProgressRow key={st.key} step={st} shop={shop} companyId={companyId} />
          ))}
        </ol>
        {timedOut && running && (
          <AlertMessage severity="warning">
            Việc nền chạy lâu hơn 30 phút nên trang ngừng tự cập nhật. Tải lại trang để xem tiến độ mới.
          </AlertMessage>
        )}
        {unmatched > 0 && (
          <p className="text-sm text-muted-foreground" data-testid="setup-unmatched">
            Còn <b className="text-foreground">{unmatched}</b> SKU trên sàn chưa ghép.{' '}
            <Link to={listings} className="text-primary underline-offset-4 hover:underline">
              Ghép ở Listing và giá
            </Link>
          </p>
        )}
      </CardContent>
      <CardFooter className="justify-end border-t pt-4">
        <Button asChild>
          <Link to={listings}>Mở gian hàng</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function ProgressRow({ step, shop, companyId }: { step: ShopSetupStep; shop: Shop; companyId: string }) {
  const Icon =
    step.status === 'done'
      ? CheckCircle2
      : step.status === 'running'
        ? Loader2
        : step.status === 'failed'
          ? XCircle
          : step.status === 'blocked'
            ? Lock
            : CircleDashed;
  const blockedBy =
    step.blockedBy && step.blockedBy in SETUP_STEP_LABEL
      ? `Chờ bước ${SETUP_STEP_LABEL[step.blockedBy as ShopSetupStepKey].toLowerCase()} xong`
      : step.blockedBy
        ? `Chờ xử lý: ${step.blockedBy}`
        : null;
  const doc = step.key === 'opening_stock' && step.status !== 'done' ? shop.openingStocktake : null;
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2.5" data-step={step.key} data-step-status={step.status}>
      <Icon
        className={cn(
          'size-4 shrink-0',
          step.status === 'running' && 'animate-spin text-primary',
          step.status === 'done' && 'text-success',
          step.status === 'failed' && 'text-destructive',
          (step.status === 'pending' || step.status === 'blocked') && 'text-muted-foreground',
        )}
        aria-hidden
      />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="font-medium">{SETUP_STEP_LABEL[step.key] ?? step.key}</span>
        {blockedBy && <span className="text-xs text-muted-foreground">{blockedBy}</span>}
        {doc && (
          <Link to={ROUTES.company.inventoryDoc(companyId, doc.documentId)} className="text-xs text-primary underline-offset-4 hover:underline">
            Mở phiếu kiểm kê {doc.number}
          </Link>
        )}
      </span>
      <StatusBadge status={step.status} statuses={SETUP_STATUS} />
    </li>
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
