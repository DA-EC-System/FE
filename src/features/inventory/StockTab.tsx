import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { ClipboardPlus, History, Pencil, TriangleAlert } from 'lucide-react';
import { SkuCode } from '@/components/common/SkuCode';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { RowAction } from '@/components/common/RowAction';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useStock } from '@/api/inventory.api';
import { useCategories } from '@/api/catalog.api';
import { getErrorMessage } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useCan, useModuleEnabled } from '@/hooks/usePermission';
import { useDebounce } from '@/hooks/useDebounce';
import { PERMISSIONS } from '@/utils/permissions';
import { formatCurrency } from '@/utils/format';
import { cn } from '@/lib/utils';
import type { StockLevel } from '@/types/inventory';
import { AddToRequestDialog } from '@/features/purchasing/AddToRequestDialog';
import { ROUTES } from '@/router/routes';
import { ReorderDialog } from './ReorderDialog';
import { StockDetailDrawer } from './StockDetailDrawer';
import { formatQty } from './shared';
import { StockChips } from './StockChips';

/** Nhóm lọc ở thanh tab của bảng tồn (`.tabs` của Test_UI), mỗi nhóm có số đếm */
type StockView = 'all' | 'belowMin' | 'quarantine';

/** Thời gian dòng vừa đổi nháy xanh (`tr.flash`, styles/index.css) */
const FLASH_MS = 1200;

/** Tồn theo biến thể (sơ đồ B2): bảy con số, nhãn suy ra; đặt ngưỡng ngay trên dòng */
export function StockTab() {
  const can = useCan();
  const canReorder = can(PERMISSIONS.reorderManage);
  const canCost = can(PERMISSIONS.costView);
  // Thêm vào đề nghị nhập chỉ khi bật Mua hàng và có quyền lập đề nghị
  const purchasingOn = useModuleEnabled('purchasing');
  const canRequest = purchasingOn && can(PERMISSIONS.purchaseRequestManage);
  const navigate = useNavigate();
  const { companyContext } = useAuth();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim());
  const [categoryId, setCategoryId] = useState('');
  const [view, setView] = useState<StockView>('all');
  const belowMin = view === 'belowMin';
  const quarantine = view === 'quarantine';
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [editing, setEditing] = useState<StockLevel | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<StockLevel | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  useEffect(() => {
    if (!flashId) return;
    const t = setTimeout(() => setFlashId(null), FLASH_MS);
    return () => clearTimeout(t);
  }, [flashId]);

  const stockQuery = useStock({
    page,
    pageSize,
    search: debouncedSearch || undefined,
    categoryId: categoryId || undefined,
    belowMin: belowMin || undefined,
    quarantine: quarantine || undefined,
  });
  const categoriesQuery = useCategories();
  const categories = categoriesQuery.data ?? [];
  const summary = stockQuery.data?.summary;
  const filtered = Boolean(debouncedSearch || categoryId || view !== 'all');
  const views: { value: StockView; label: string; count?: number }[] = [
    { value: 'all', label: 'Tất cả', count: summary?.variantCount },
    { value: 'belowMin', label: 'Nên nhập lại', count: summary?.belowMinCount },
    { value: 'quarantine', label: 'Có hàng chờ xử lý', count: summary?.quarantineCount },
  ];

  const withReset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const columns = useMemo<ColumnDef<StockLevel>[]>(
    () => [
      {
        id: 'variant',
        header: 'Biến thể',
        meta: {
          className: 'min-w-60',
          help: 'Nhãn dưới tên biến thể. Đang về: số còn chờ của đề nghị nhập. Chờ xử lý: hàng lỗi, hoàn, trả chưa kiểm, chưa bán được. Thiếu: số các kiện cần mà khả dụng chưa đủ.',
        },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="min-w-0">
              <span data-guide="inventory-sku">
                <SkuCode code={r.sku} hint="Xem thẻ kho" onClick={() => setViewing(r.variantId)} />
              </span>
              <p className="truncate text-xs text-muted-foreground">
                {r.productName}
                {r.attributesLabel && ` · ${r.attributesLabel}`}
              </p>
              <StockChips level={r} />
            </div>
          );
        },
      },
      {
        id: 'category',
        header: 'Danh mục',
        meta: { className: 'w-32' },
        cell: ({ row }) => row.original.category.name,
      },
      {
        id: 'onHand',
        header: 'Tồn thực',
        meta: { className: 'w-24 text-right', help: 'Số hàng đang nằm trong kho, kể cả phần đang giữ và tạm khoá.' },
        cell: ({ row }) => (
          <span className={cn(row.original.negative && 'font-semibold text-destructive')}>{formatQty(row.original.onHand)}</span>
        ),
      },
      {
        id: 'reserved',
        header: 'Đang giữ',
        meta: { className: 'w-24 text-right', help: 'Đã giữ cho kiện chưa bàn giao, không bán cho đơn khác.' },
        cell: ({ row }) => formatQty(row.original.reserved),
      },
      {
        id: 'locked',
        header: 'Tạm khoá',
        meta: { className: 'w-24 text-right', help: 'Bị khoá bởi phiếu giảm tồn đang chờ duyệt.' },
        cell: ({ row }) => (row.original.locked ? formatQty(row.original.locked) : '—'),
      },
      {
        id: 'available',
        header: 'Khả dụng',
        meta: {
          className: 'w-28 text-right',
          guide: 'inventory-available',
          help: 'Bán được ngay: tồn thực trừ đang giữ và tạm khoá. Số này được đẩy lên các sàn.',
        },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              {r.belowMin && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TriangleAlert
                      className="size-4 text-destructive"
                      aria-label="Nên nhập lại"
                      data-testid="below-min"
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    Khả dụng + đang về − đang thiếu ≤ ngưỡng {formatQty(r.minQty ?? 0)}: nên nhập lại
                  </TooltipContent>
                </Tooltip>
              )}
              <span className={cn('font-semibold', r.belowMin && 'text-destructive')}>{formatQty(r.available)}</span>
            </div>
          );
        },
      },
      {
        id: 'minQty',
        header: 'Ngưỡng',
        meta: { className: 'w-28 text-right' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              <span className={cn(r.minQty === null && 'text-muted-foreground')} data-testid="min-qty">
                {r.minQty === null ? '—' : formatQty(r.minQty)}
              </span>
              {canReorder && (
                <RowAction label="Đặt ngưỡng" onClick={() => setEditing(r)}>
                  <Pencil />
                </RowAction>
              )}
            </div>
          );
        },
      },
      // Giá vốn chỉ người có quyền thấy; không có quyền thì không có cột (AC-K3)
      ...(canCost
        ? ([
            {
              id: 'avgCost',
              header: 'Giá vốn BQ',
              meta: { className: 'w-32 text-right whitespace-nowrap' },
              cell: ({ row }) => (row.original.avgCost === null ? '—' : formatCurrency(row.original.avgCost)),
            },
            {
              id: 'stockValue',
              header: 'Giá trị tồn',
              meta: { className: 'w-36 text-right whitespace-nowrap' },
              cell: ({ row }) => (row.original.stockValue === null ? '—' : formatCurrency(row.original.stockValue)),
            },
          ] satisfies ColumnDef<StockLevel>[])
        : []),
      {
        id: 'actions',
        header: '',
        meta: { className: 'w-20 text-right' },
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            {canRequest && row.original.belowMin && (
              <RowAction label="Thêm vào đề nghị nhập" onClick={() => setRequesting(row.original)}>
                <ClipboardPlus />
              </RowAction>
            )}
            <RowAction label="Lịch sử biến động" onClick={() => setViewing(row.original.variantId)}>
              <History />
            </RowAction>
          </div>
        ),
      },
    ],
    [canReorder, canCost, canRequest],
  );

  return (
    <div>
      {summary?.negativeCount ? (
        <AlertMessage severity="warning" className="mb-4">
          {formatQty(summary.negativeCount)} biến thể đang tồn âm: số ghi sổ nhỏ hơn 0, cần kiểm kê lại.
        </AlertMessage>
      ) : null}

      {stockQuery.isError && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(stockQuery.error)}
        </AlertMessage>
      )}

      <Card className="gap-0 py-0">
        <Tabs value={view} onValueChange={(v) => withReset(setView)(v as StockView)} data-guide="inventory-views">
          <div className="flex items-center gap-4 overflow-x-auto border-b px-4">
            <TabsList aria-label="Nhóm tồn" className="border-b-0">
              {views.map((v) => (
                <TabsTrigger key={v.value} value={v.value}>
                  {v.label}
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {v.count === undefined ? '' : formatQty(v.count)}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
            {canCost && summary?.totalValue != null && (
              <span
                className="ms-auto shrink-0 text-sm whitespace-nowrap text-muted-foreground"
                data-testid="stock-total-value"
              >
                Giá trị tồn{' '}
                <span className="font-medium text-foreground tabular-nums">{formatCurrency(summary.totalValue)}</span>
              </span>
            )}
          </div>
        </Tabs>
        <FilterBar>
          <SearchInput
            value={search}
            onChange={withReset(setSearch)}
            placeholder="Tìm theo tên sản phẩm hoặc SKU"
          />
          <FilterSelect loading={categoriesQuery.isLoading}
            label="Danh mục"
            value={categoryId}
            onChange={withReset(setCategoryId)}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
          />
          {!canCost && (
            <Badge variant="outline" className="md:ms-auto md:mb-2">
              Giá vốn chỉ hiện với người có quyền
            </Badge>
          )}
        </FilterBar>
        <DataTable
          columns={columns}
          data={stockQuery.data?.items ?? []}
          getRowId={(r) => r.variantId}
          loading={stockQuery.isLoading}
          fetching={stockQuery.isFetching}
          empty={filtered ? 'Không tìm thấy biến thể phù hợp' : 'Chưa có biến thể đang bán'}
          rowClassName={(r) => (r.variantId === flashId ? 'flash' : undefined)}
          pagination={{
            page,
            pageSize,
            total: stockQuery.data?.total ?? 0,
            pageSizes: [25, 50, 100],
            onChange: (p, size) => {
              setPage(size === pageSize ? p : 1);
              setPageSize(size);
            },
          }}
        />
      </Card>

      <ReorderDialog
        level={editing}
        onClose={() => setEditing(null)}
        onDone={(msg) => {
          setFlashId(editing?.variantId ?? null);
          setEditing(null);
          toast.success(msg);
        }}
      />
      {canRequest && (
        <AddToRequestDialog
          level={requesting}
          onClose={() => setRequesting(null)}
          onDone={(request) => {
            setRequesting(null);
            toast.success(`Đã thêm vào ${request.number}`, {
              action: {
                label: 'Mở',
                onClick: () => navigate(ROUTES.company.purchaseRequest(companyContext?.companyId ?? '', request.id)),
              },
            });
          }}
        />
      )}
      <StockDetailDrawer variantId={viewing} canCost={canCost} onClose={() => setViewing(null)} />
    </div>
  );
}
