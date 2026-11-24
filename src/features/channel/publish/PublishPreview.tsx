import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ImageOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Money } from '@/components/common/Money';
import { MoneyInput } from '@/components/common/MoneyInput';
import { SkuCode } from '@/components/common/SkuCode';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { usePriceQuote, usePushListings } from '@/api/shops.api';
import { usePushPreviews } from '@/api/readiness.api';
import { ROUTES } from '@/router/routes';
import { cn } from '@/lib/utils';
import { formatMoneyInput, parseMoney } from '@/utils/price';
import type { ProductDetail } from '@/types/catalog';
import type { PushPreviewRow } from '@/types/blocker';
import type { PriceQuoteRow, ProductListingRow, PushResult, Shop } from '@/types/shop';
import { LISTING_STATUS_LABELS, platformLabel } from '../shopSchemas';
import { pushResultBlocks, splitPushResults } from '../listingPush';
import { blockerFix, canUseFix } from '../blockerFix';
import { feePct, isOnPlatform, priceNote, priceRange, priceView, rowBlocker, rowReasons, stockToPushText, withPreview } from './publishRows';
import { shopDisplayName } from '../shopList';

const keyOf = (shopId: string, variantId: string) => `${shopId}:${variantId}`;
const pct = (x: number) => `${(x * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;

interface ShopOutcome {
  shop: Shop;
  queued: number;
  blocked: PushResult[];
  error: string | null;
}

interface PublishPreviewProps {
  product: ProductDetail;
  companyId: string;
  /** Gian hàng đã chọn */
  shops: Shop[];
  /** Dòng listing của sản phẩm ở các gian hàng đã chọn */
  rows: ProductListingRow[];
  /** Sàn đã đủ thông tin và đã lưu */
  readyPlatforms: ReadonlySet<string>;
  /** Quyền cho nút tới chỗ sửa của mục chặn */
  can: { product: boolean; finance: boolean };
  onFixPlatform: (platform: string) => void;
}

/**
 * Bước "Xem trước và đăng" (Documents/25 §6.3, Documents/29 bước 4): bảng SKU × gian hàng với giá niêm yết, phí và thuế,
 * thực nhận; sửa giá thì tính thử ngay (Documents/21 §18.9 R1). Đăng gọi `listings/push` cho từng gian hàng.
 */
export function PublishPreview({ product, companyId, shops, rows, readyPlatforms, can, onFixPlatform }: PublishPreviewProps) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  // Giá gõ đã ngừng gõ, gửi kèm `push-preview` theo gian hàng
  const [sentPrices, setSentPrices] = useState<Record<string, Record<string, number>>>({});
  const [quotes, setQuotes] = useState<Record<string, PriceQuoteRow>>({});
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ShopOutcome[] | null>(null);
  const [busy, setBusy] = useState(false);
  const quote = usePriceQuote();
  const push = usePushListings();
  const navigate = useNavigate();
  const standardOf = new Map(product.variants.map((v) => [v.id, v.standardPrice]));
  const platformOf = new Map(shops.map((s) => [s.id, s.platform]));

  // Giá đã gõ hợp lệ và khác giá BE tính sẵn: gửi tính thử sau khi ngừng gõ
  const typed = useMemo(() => {
    const out: { shopId: string; variantId: string; listPrice: number }[] = [];
    for (const r of rows) {
      const text = edits[keyOf(r.shopId, r.variantId)];
      if (text === undefined) continue;
      const parsed = parseMoney(text);
      if (parsed.ok && parsed.value && parsed.value !== r.price) out.push({ shopId: r.shopId, variantId: r.variantId, listPrice: parsed.value });
    }
    return out;
  }, [edits, rows]);
  const lastSent = useRef('');
  useEffect(() => {
    const body = JSON.stringify(typed);
    if (body === lastSent.current) return;
    const t = setTimeout(() => {
      lastSent.current = body;
      const byShop: Record<string, Record<string, number>> = {};
      for (const x of typed) (byShop[x.shopId] ??= {})[x.variantId] = x.listPrice;
      setSentPrices(byShop);
      if (!typed.length) {
        setQuotes({});
        return;
      }
      quote.mutate(
        { productId: product.id, items: typed },
        {
          onSuccess: (items) => {
            setQuoteError(null);
            setQuotes(Object.fromEntries(items.map((q) => [keyOf(q.shopId, q.variantId), q])));
          },
          onError: (e) => {
            const status = getProblem(e)?.status;
            setQuoteError(status === 404 || status === 501 ? 'Máy chủ chưa tính thử được giá gõ tay; số dưới đây theo giá hiện tại.' : problemMessage(e));
          },
        },
      );
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ gửi khi danh sách giá gõ đổi
  }, [typed, product.id]);

  // Kiểm trước khi đăng (FE#458, Documents/21 §18.11): mục chặn của từng dòng lấy từ `push-preview`, cùng hàm với readiness
  // và lệnh đăng của BE. SKU đã ở trên sàn không cần kiểm
  const previews = usePushPreviews(
    shops.map((s) => ({
      shopId: s.id,
      variantIds: rows.filter((r) => r.shopId === s.id && !isOnPlatform(r)).map((r) => r.variantId),
      ...(sentPrices[s.id] ? { listPrices: sentPrices[s.id] } : {}),
    })),
  );
  const previewOf = new Map<string, PushPreviewRow>();
  shops.forEach((s, i) => {
    for (const p of previews[i]?.data ?? []) previewOf.set(keyOf(s.id, p.variantId), p);
  });
  const previewFailed = previews.find((q) => q.isError && !q.data);
  const previewLoading = previews.some((q) => q.isLoading);

  const views = rows.map((r) => {
    const key = keyOf(r.shopId, r.variantId);
    const text = edits[key];
    const parsed = text === undefined ? null : parseMoney(text);
    const invalid = parsed && (!parsed.ok || !parsed.value) ? (parsed.ok ? 'Nhập giá niêm yết' : parsed.error) : null;
    const preview = previewOf.get(key);
    const view = withPreview(priceView(r, quotes[key]), preview);
    const platformReady = readyPlatforms.has(platformOf.get(r.shopId) ?? '');
    const onPlatform = isOnPlatform(r);
    // Chưa có kết quả kiểm: đang kiểm thì chờ; kiểm lỗi (BE cũ, mạng) thì lý do tính tạm như trước
    const checking = !onPlatform && !invalid && !preview && !previewFailed;
    const { reasons, blockers } = onPlatform || invalid || checking ? { reasons: [], blockers: [] } : rowReasons(preview, rowBlocker(view, platformReady));
    const blocker = onPlatform ? null : (invalid ?? (reasons.length ? reasons.join('; ') : null));
    const manual = Boolean(parsed?.ok && parsed.value && parsed.value !== r.price);
    return { r, key, text, view, preview, invalid, onPlatform, checking, reasons: invalid ? [invalid] : reasons, blockers, blocker, manual, platformReady };
  });
  const toPublish = views.filter((v) => !v.onPlatform && !v.blocker && !v.checking);
  const showMargin = views.some((v) => v.view.marginPct !== null);
  // Gian hàng chưa có cấu hình phí (tính thử trả fee_not_configured, KB2 2.12): báo rõ, kèm đường tới cấu hình phí
  const noFeeShops = shops.filter((s) => views.some((v) => v.r.shopId === s.id && !v.onPlatform && v.view.blockedCode === 'fee_not_configured'));
  const anyManual = views.some((v) => v.manual);
  const shopsToPublish = shops.filter((s) => toPublish.some((v) => v.r.shopId === s.id));

  // Lỗi gom theo sàn
  const problemsByPlatform = new Map<string, Map<string, number>>();
  for (const v of views) {
    if (!v.reasons.length) continue;
    const p = platformOf.get(v.r.shopId) ?? '';
    const m = problemsByPlatform.get(p) ?? new Map<string, number>();
    for (const reason of v.reasons) m.set(reason, (m.get(reason) ?? 0) + 1);
    problemsByPlatform.set(p, m);
  }

  const publish = async () => {
    if (busy || !toPublish.length) return;
    setBusy(true);
    setOutcome(null);
    const results: ShopOutcome[] = [];
    try {
      for (const shop of shopsToPublish) {
        const mine = toPublish.filter((v) => v.r.shopId === shop.id);
        const listPrices = Object.fromEntries(
          mine.filter((v) => v.manual).map((v) => [v.r.variantId, (parseMoney(v.text!) as { ok: true; value: number }).value]),
        );
        try {
          const res = await push.mutateAsync({ shopId: shop.id, variantIds: mine.map((v) => v.r.variantId), listPrices });
          const { queued, blocked } = splitPushResults(res);
          results.push({ shop, queued, blocked, error: null });
        } catch (e) {
          results.push({ shop, queued: 0, blocked: [], error: problemMessage(e) });
        }
      }
      setOutcome(results);
      setEdits({});
      const total = results.reduce((n, r) => n + r.queued, 0);
      const clean = results.every((r) => !r.error && !r.blocked.length);
      if (total && clean) {
        // Đăng trọn: về tab sàn của sản phẩm, nơi có trạng thái từng SKU (FE#462). Còn SKU bị chặn thì ở lại xem lý do
        toast.success(`Đã gửi ${total} SKU lên sàn. Trạng thái từng SKU hiện ở tab sàn và tự cập nhật.`);
        navigate(`${ROUTES.company.catalogProduct(companyId, product.id)}?tab=${results[0]!.shop.platform}`);
      } else if (total) toast.success(`Đã gửi ${total} SKU lên sàn. Một số SKU bị chặn, xem lý do bên dưới.`);
      else toast.error('Chưa SKU nào được đăng, xem lý do từng gian hàng.');
    } finally {
      setBusy(false);
    }
  };

  const platforms = [...new Set(shops.map((s) => s.platform))];
  // Không SKU nào đăng được: sàn đầu tiên còn thiếu thông tin (sửa ở bước 2), không thì lý do đầu tiên
  const fixPlatform = toPublish.length ? null : ([...problemsByPlatform.keys()].find((p) => !readyPlatforms.has(p)) ?? null);
  const firstBlocker = views.find((v) => v.reasons.length)?.reasons[0] ?? null;

  return (
    <div className="grid gap-5">
      {/* Thẻ xem trước: trên sàn là một sản phẩm nhiều phân loại (Documents/21 §18.8.4) */}
      <div className="grid gap-3 md:grid-cols-2">
        {platforms.map((p) => {
          const pv = views.filter((v) => platformOf.get(v.r.shopId) === p);
          const range = priceRange(pv.map((v) => v.view.listPrice));
          const variants = [...new Map(pv.map((v) => [v.r.variantId, v.r.attributesLabel])).values()].filter(Boolean);
          const cover = product.images.slice().sort((a, b) => a.position - b.position)[0];
          return (
            <article key={p} aria-label={`Xem trước trên ${platformLabel(p)}`} className="flex gap-3 rounded-xl border p-3">
              {cover ? (
                <img src={cover.url} alt="" width={80} height={80} className="size-20 flex-none rounded-md object-cover" />
              ) : (
                <span className="flex size-20 flex-none items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <ImageOff className="size-6" aria-label="Chưa có ảnh" />
                </span>
              )}
              <div className="min-w-0 text-sm">
                <p className="text-xs text-muted-foreground">Trên {platformLabel(p)}</p>
                <p className="line-clamp-2 font-medium">{product.name}</p>
                <p className="tabular-nums">
                  {range ? (range.min === range.max ? <Money value={range.min} /> : <><Money value={range.min} /> – <Money value={range.max} /></>) : 'Chưa có giá'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Một sản phẩm · {variants.length || 1} phân loại{variants.length ? `: ${variants.slice(0, 6).join(', ')}${variants.length > 6 ? '…' : ''}` : ''}
                </p>
              </div>
            </article>
          );
        })}
      </div>

      {quoteError && <AlertMessage severity="warning">{quoteError}</AlertMessage>}
      {previewFailed && (
        <AlertMessage severity="warning">
          Chưa kiểm được trước khi đăng ({problemMessage(previewFailed.error)}). Lý do dưới đây tính tạm theo thông tin sàn và giá;
          lệnh đăng vẫn kiểm lại.{' '}
          <button type="button" className="font-medium underline" onClick={() => previews.forEach((q) => q.isError && void q.refetch())}>
            Thử lại
          </button>
        </AlertMessage>
      )}
      {anyManual && (
        <AlertMessage severity="info">
          Giá bạn gõ thành <b>giá đặt tay</b>: áp ngay khi đăng, không tự đổi theo giá muốn thực nhận hay phí nữa cho tới khi bỏ giá đặt tay ở trang gian hàng.
        </AlertMessage>
      )}

      {noFeeShops.length > 0 && (
        <AlertMessage severity="warning" alert>
          {noFeeShops.map((s) => shopDisplayName(s)).join(', ')} chưa có cấu hình phí sàn: chưa tính được phí, thực nhận nên chưa đăng
          được.{' '}
          <Link to={ROUTES.company.financeConfigs(companyId)} className="font-medium text-primary underline-offset-4 hover:underline">
            Mở Cấu hình phí sàn và thuế
          </Link>
        </AlertMessage>
      )}

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Gian hàng</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="w-40">Giá niêm yết</TableHead>
              <TableHead className="text-right">Phí và thuế</TableHead>
              <TableHead className="text-right">Thực nhận</TableHead>
              {showMargin && <TableHead className="text-right">Biên lãi</TableHead>}
              <TableHead className="text-right">Tồn sẽ đẩy</TableHead>
              <TableHead>Trạng thái</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {views.map((v, k) => {
              const shop = shops.find((s) => s.id === v.r.shopId);
              const firstOfShop = k === 0 || views[k - 1]!.r.shopId !== v.r.shopId;
              const fee = v.preview ? v.preview.feePct : feePct(v.view);
              return (
                <TableRow key={v.key} className={cn(v.onPlatform && 'text-muted-foreground')}>
                  <TableCell className="align-top">
                    {firstOfShop && shop ? (
                      <span>
                        <span className="text-xs text-muted-foreground">{platformLabel(shop.platform, shop.platformName)}</span>
                        <br />
                        {shopDisplayName(shop)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top">
                    <SkuCode code={v.r.sku} />
                    {v.r.attributesLabel && <div className="text-xs text-muted-foreground">{v.r.attributesLabel}</div>}
                  </TableCell>
                  <TableCell className="align-top">
                    {v.onPlatform ? (
                      v.view.listPrice !== null ? <Money value={v.view.listPrice} /> : '—'
                    ) : (
                      <>
                        <MoneyInput
                          aria-label={`Giá niêm yết ${v.r.sku} ở ${shop ? shopDisplayName(shop) : ''}`}
                          value={v.text ?? formatMoneyInput(v.r.price)}
                          onChange={(text) => setEdits((e) => ({ ...e, [v.key]: text }))}
                          aria-invalid={Boolean(v.invalid) || undefined}
                          className="h-8"
                        />
                        {v.invalid && <p className="mt-1 text-xs text-destructive-text">{v.invalid}</p>}
                        {v.manual && !v.invalid && <p className="mt-1 text-xs text-muted-foreground">Giá đặt tay</p>}
                        {!v.manual && !v.invalid && priceNote(v.r, standardOf.get(v.r.variantId)) && (
                          <p className="mt-1 text-xs text-muted-foreground">{priceNote(v.r, standardOf.get(v.r.variantId))}</p>
                        )}
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-right align-top tabular-nums">
                    {fee !== null ? pct(fee) : v.view.blockedCode === 'fee_not_configured' ? (
                      <span className="text-xs text-warning-text">Chưa cấu hình phí</span>
                    ) : (
                      '—'
                    )}
                    {v.view.feeWarning && <div className="text-xs text-warning-text">Phí trên 50%</div>}
                  </TableCell>
                  <TableCell className="text-right align-top">{v.view.netReceived !== null ? <Money value={v.view.netReceived} /> : '—'}</TableCell>
                  {showMargin && (
                    <TableCell className="text-right align-top tabular-nums">{v.view.marginPct !== null ? pct(v.view.marginPct) : '—'}</TableCell>
                  )}
                  <TableCell className="text-right align-top tabular-nums">{stockToPushText(v.preview ?? v.r)}</TableCell>
                  <TableCell className="align-top">
                    {v.onPlatform && v.r.listing ? (
                      <Badge variant="outline">{LISTING_STATUS_LABELS[v.r.listing.status]}</Badge>
                    ) : v.checking ? (
                      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Đang kiểm…
                      </span>
                    ) : v.blockers.length ? (
                      <ul className="grid gap-0.5 text-sm" data-testid="preview-blockers">
                        {v.blockers.map((b, i) => {
                          const found = blockerFix(b.target, {
                            companyId,
                            productId: product.id,
                            platform: platformOf.get(v.r.shopId) ?? null,
                            shopId: v.r.shopId,
                            variantId: b.variantIds.includes(v.r.variantId) ? v.r.variantId : (b.variantIds[0] ?? v.r.variantId),
                          });
                          const fix = found && canUseFix(found, can) ? found : null;
                          return (
                            <li key={`${b.code}-${i}`} className="text-destructive-text">
                              Chưa đăng: {b.label}
                              {fix && (
                                <>
                                  {' '}
                                  <Link to={fix.to} className="font-medium text-primary-text underline" data-testid="preview-fix">
                                    {fix.label}
                                  </Link>
                                </>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : v.blocker ? (
                      <span className="text-sm text-destructive-text">Chưa đăng: {v.blocker}</span>
                    ) : (
                      <span className="text-sm text-success-text">Sẽ đăng</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {!views.length && (
              <TableRow>
                <TableCell colSpan={showMargin ? 8 : 7} className="text-center text-muted-foreground">
                  Chưa chọn gian hàng nào.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {problemsByPlatform.size > 0 && (
        <section aria-label="Lỗi theo sàn" className="grid gap-1.5 rounded-xl border border-warning-border p-3 text-sm" role="alert">
          <h3 className="font-semibold">Chưa đăng được</h3>
          {[...problemsByPlatform].map(([p, m]) => (
            <p key={p}>
              <b>{platformLabel(p)}:</b>{' '}
              {[...m].map(([reason, n]) => `${n} SKU ${reason.toLocaleLowerCase('vi')}`).join(' · ')}
              {!readyPlatforms.has(p) && (
                <Button type="button" variant="link" size="sm" className="ml-2 h-auto p-0" onClick={() => onFixPlatform(p)}>
                  Bổ sung thông tin {platformLabel(p)}
                </Button>
              )}
            </p>
          ))}
          {toPublish.length > 0 && <p className="text-muted-foreground">Các SKU còn lại vẫn đăng được.</p>}
        </section>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {!toPublish.length && !busy && fixPlatform ? (
          // Không SKU nào đăng được vì thiếu thông tin sàn: nút chính dẫn về đúng chỗ sửa (FE#458)
          <Button type="button" onClick={() => onFixPlatform(fixPlatform)}>
            Chưa đăng được: bổ sung thông tin {platformLabel(fixPlatform)}
          </Button>
        ) : (
          <Button type="button" onClick={() => void publish()} disabled={busy || !toPublish.length}>
            {(busy || (previewLoading && !toPublish.length)) && <Loader2 className="animate-spin" />}
            {busy
              ? 'Đang đăng…'
              : previewLoading && !toPublish.length
                ? 'Đang kiểm trước khi đăng…'
                : toPublish.length
                ? `Đăng ${toPublish.length} SKU lên ${shopsToPublish.length} gian hàng`
                : firstBlocker
                  ? `Chưa đăng được: ${firstBlocker.toLocaleLowerCase('vi')}`
                  : 'Không có SKU nào đăng được'}
          </Button>
        )}
      </div>

      {outcome && (
        <section className="grid gap-2" aria-label="Kết quả đăng">
          <h3 className="text-sm font-semibold">Kết quả</h3>
          {outcome.map((o) => (
            <div key={o.shop.id} className="rounded-lg border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <b>{shopDisplayName(o.shop)}</b>
                {o.error ? (
                  <span className="text-destructive-text">{o.error}</span>
                ) : (
                  <span className={o.queued ? 'text-success-text' : 'text-muted-foreground'}>
                    {o.queued ? `Đã gửi ${o.queued} SKU, sàn đang xử lý` : 'Không SKU nào được gửi'}
                    {o.blocked.length ? `, ${o.blocked.length} SKU bị chặn` : ''}
                  </span>
                )}
                {o.queued > 0 && (
                  <Link className="ml-auto text-primary-text underline" to={ROUTES.company.shop(companyId, o.shop.id)}>
                    Xem ở trang gian hàng
                  </Link>
                )}
              </div>
              {o.blocked.length > 0 && (
                <ul className="mt-1 grid gap-0.5">
                  {o.blocked.map((r) => (
                    <li key={r.variantId} className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{rows.find((x) => x.variantId === r.variantId)?.sku ?? r.variantId}</span>
                      <span>{pushResultBlocks(r, platformLabel(o.shop.platform, o.shop.platformName)).map((b) => b.label).join('; ') || r.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
