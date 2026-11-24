import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Lock, Search } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { useRemoteProducts } from '@/api/setupDraft.api';
import { problemMessage } from '@/api/problemMessages';
import { getProblem } from '@/api/client';
import { returnDaysError } from '../shopSchemas';
import { cn } from '@/lib/utils';
import type { OpeningStockMode } from '@/types/shop';
import { finishSummary, stockRows, stockTotals } from './setupDraft';
import { SetupPager } from './SetupPager';
import type { SetupDraftState } from './useSetupDraft';

const PAGE_SIZE = 20;
const n = (v: number) => v.toLocaleString('vi-VN');

/**
 * Bước 5 Đồng bộ tồn lần đầu (design v2.html s5; Documents/21 §18.7.5 "Xem trước tồn"). Gian hàng đầu tiên của công ty
 * chỉ kiểm kê đầu kỳ: lựa chọn đẩy tồn bị khoá, nháp chưa có lựa chọn thì ghi `stocktake` ngay. Bảng xem trước gom theo
 * sản phẩm sàn; dòng tổng cả gian hàng lấy `stockTotals` BE trả (vắng thì không hiện).
 */
export function StockSyncStep({
  shopId,
  state,
  firstShop,
  needDays,
}: {
  shopId: string;
  state: SetupDraftState;
  firstShop: boolean;
  /** Sàn tính hạn trả theo số ngày (`capabilities.returnWindow = 'days'`): ô Hạn trả hàng thuộc dữ liệu bước này (§18.7.5) */
  needDays: boolean;
}) {
  const opening = state.draft?.openingStock ?? null;
  const wrote = useRef(false);
  const { save } = state;
  useEffect(() => {
    if (firstShop && opening !== 'stocktake' && state.view.data && !wrote.current) {
      wrote.current = true;
      void save({ openingStock: 'stocktake' });
    }
  }, [firstShop, opening, state.view.data, save]);

  const toLink = finishSummary(state.draft).skusToLink;
  const choices: { value: OpeningStockMode; label: string; hint: string }[] = [
    {
      value: 'push',
      label: 'Đồng bộ tồn Commerio lên sàn',
      hint: 'Tồn trên sàn bằng số có thể bán trong kho ngay khi xong thiết lập. Hợp khi kho vừa kiểm kho.',
    },
    {
      value: 'stocktake',
      label: 'Kiểm kho trước khi đồng bộ',
      hint: `Tạo phiếu kiểm kê đầu kỳ nháp cho cả ${n(toLink)} SKU sẽ liên kết; chỉ đồng bộ tồn sau khi phiếu ghi sổ, trong lúc chờ sàn giữ số đang có.`,
    },
  ];

  return (
    <div className="grid gap-4">
      <p className="text-sm">
        Tồn trên sàn lúc kết nối có thể khác số có thể bán ở Commerio. Chọn đồng bộ tồn Commerio lên sàn, hoặc kiểm kho trước rồi mới đồng
        bộ.
      </p>
      <RadioGroup
        value={opening ?? ''}
        onValueChange={async (v) => {
          const out = await save({ openingStock: v as OpeningStockMode });
          if (!out.ok && out.invalid) state.setWriteError(problemMessage(out.error));
        }}
        aria-label="Cách đồng bộ tồn lần đầu"
        className="grid max-w-2xl gap-3"
      >
        {choices.map((o) => {
          const locked = firstShop && o.value === 'push';
          return (
            <Label
              key={o.value}
              htmlFor={`opening-${o.value}`}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-3.5 font-normal transition-colors',
                opening === o.value && 'border-primary bg-accent',
                locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-primary',
              )}
            >
              <RadioGroupItem id={`opening-${o.value}`} value={o.value} disabled={locked} className="mt-0.5" />
              <span className="grid gap-0.5">
                <span className="font-medium">{o.label}</span>
                <span className="text-muted-foreground">{o.hint}</span>
                {locked && (
                  <span className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                    <Lock className="size-3.5" aria-hidden />
                    Gian hàng đầu tiên của công ty phải kiểm kê đầu kỳ.
                  </span>
                )}
              </span>
            </Label>
          );
        })}
      </RadioGroup>
      {needDays && <ReturnDaysField state={state} />}
      <StockPreview shopId={shopId} firstShop={firstShop} hold={opening === 'stocktake'} />
    </div>
  );
}

/**
 * Hạn trả hàng (ngày). Hợp đồng xếp `returnWindowDays` vào dữ liệu bước `stock_sync` (§18.7.5) nên ô nằm ở bước 5, không ở
 * bước 6 như design v2.html s6: để ở bước 6 thì ghi ô này xoá mốc `stock_sync` và Hoàn tất báo 409 `setup_draft_incomplete`.
 * Lưu khi rời ô, số hợp lệ mới ghi.
 */
function ReturnDaysField({ state }: { state: SetupDraftState }) {
  const saved = state.draft?.returnWindowDays;
  const [value, setValue] = useState(saved != null ? String(saved) : '');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (saved != null) setValue(String(saved));
  }, [saved]);
  const commit = async () => {
    const bad = returnDaysError(value);
    setError(bad);
    if (bad || Number(value) === saved) return;
    const out = await state.save({ returnWindowDays: Number(value) });
    if (!out.ok && out.invalid) setError(getProblem(out.error)?.errors?.returnWindowDays ?? problemMessage(out.error));
  };
  return (
    <div className="grid max-w-sm gap-1.5">
      <Label htmlFor="return-window-days">Hạn trả hàng (ngày)</Label>
      <Input
        id="return-window-days"
        type="number"
        inputMode="numeric"
        min={1}
        max={60}
        step={1}
        className="w-32"
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby="return-window-days-hint"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
      />
      <span id="return-window-days-hint" className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
        {error ??
          'Sàn không báo hạn trả hàng, nên Commerio lấy ngày giao thành công cộng số ngày này. Qua hạn trả hàng, đơn mới chuyển Hoàn thành.'}
      </span>
    </div>
  );
}

/** Bảng xem trước tồn: một dòng tổng mỗi sản phẩm sàn, mở ra thấy từng SKU */
function StockPreview({ shopId, firstShop, hold }: { shopId: string; firstShop: boolean; hold: boolean }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const list = useRemoteProducts(shopId, { status: 'all', search, page, pageSize: PAGE_SIZE });
  const totals = list.data?.stockTotals ?? null;
  const keep = firstShop || hold;

  return (
    <section className="grid gap-3" aria-labelledby="stock-preview-title">
      <h2 id="stock-preview-title" className="text-[15px] font-semibold">
        {keep ? 'Tồn trên sàn sẽ giữ tới khi kiểm kho xong' : 'Tồn sẽ đồng bộ lên sàn'}
      </h2>
      {totals && (
        <div className="flex flex-wrap items-center gap-2 text-sm" role="status">
          <Badge variant="warning" className="tabular-nums">
            {n(totals.drifted)} SKU lệch
          </Badge>
          <Badge variant="outline" className="tabular-nums">
            {n(totals.matched)} SKU khớp
          </Badge>
          <span className="text-xs text-muted-foreground">
            Tổng tồn trên sàn {n(totals.platformTotal)}, có thể bán ở Commerio {n(totals.availableTotal)}
          </span>
        </div>
      )}
      <label className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Tìm theo tên, SKU"
          aria-label="Tìm SKU"
          className="ps-8"
        />
      </label>
      {list.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : list.isError ? (
        <AlertMessage severity="error">{problemMessage(list.error)}</AlertMessage>
      ) : (
        <div className="rounded-md border text-sm" data-testid="setup-stock-preview">
          <div className="hidden grid-cols-[minmax(0,1fr)_7rem_9rem_12rem] gap-3 bg-table-head px-3 py-2 text-muted-foreground sm:grid">
            <span>Sản phẩm / biến thể</span>
            <span className="text-end">Tồn trên sàn</span>
            <span className="text-end">Có thể bán ở Commerio</span>
            <span>Sau khi thiết lập</span>
          </div>
          {list.data.items.map((p) => {
            const rows = stockRows(p.skus);
            if (!rows.length) return null;
            const t = stockTotals(rows);
            return (
              <details key={p.externalProductId} className="group border-t first:border-t-0">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5">
                  <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate font-medium">{p.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {rows.length} SKU · {t.drifted} lệch · tồn trên sàn {n(t.platformTotal)}
                    </span>
                  </span>
                  {keep ? (
                    <Badge variant="warning" className="tabular-nums">
                      <Lock />
                      Giữ {n(t.platformTotal)}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="tabular-nums">
                      Đẩy {n(t.availableTotal)}
                    </Badge>
                  )}
                </summary>
                {rows.map((r) => (
                  <div
                    key={r.externalSkuId}
                    className="grid grid-cols-2 gap-x-3 gap-y-1 border-t px-3 py-2 ps-9 sm:grid-cols-[minmax(0,1fr)_7rem_9rem_12rem]"
                    data-drift={r.drift}
                  >
                    <span className="col-span-2 sm:col-span-1">
                      {r.label} {r.sellerSku && <span className="font-mono text-xs text-muted-foreground">{r.sellerSku}</span>}
                    </span>
                    <span className="tabular-nums sm:text-end">
                      <span className="text-xs text-muted-foreground sm:hidden">Tồn trên sàn </span>
                      {n(r.platformStock)}
                    </span>
                    <span className="tabular-nums sm:text-end">
                      <span className="text-xs text-muted-foreground sm:hidden">Có thể bán ở Commerio </span>
                      {n(r.available)}
                    </span>
                    <span className="col-span-2 sm:col-span-1">
                      {!r.drift ? (
                        <span className="text-muted-foreground">Khớp</span>
                      ) : keep ? (
                        <Badge variant="warning" className="tabular-nums">
                          <Lock />
                          Giữ {n(r.platformStock)} tới khi kiểm kho xong
                        </Badge>
                      ) : (
                        <span className="tabular-nums">Đẩy {n(r.available)} lên sàn</span>
                      )}
                    </span>
                  </div>
                ))}
              </details>
            );
          })}
          {!list.data.items.some((p) => stockRows(p.skus).length) && (
            <p className="px-3 py-6 text-center text-muted-foreground">Trang này không có SKU nào sẽ liên kết.</p>
          )}
        </div>
      )}
      {list.data && (
        <SetupPager page={page} pageSize={PAGE_SIZE} total={list.data.total} unit="sản phẩm" onPage={setPage} />
      )}
    </section>
  );
}
