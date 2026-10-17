import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { History, Pencil, TriangleAlert } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { RowAction } from '@/components/common/RowAction';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useStock } from '@/api/inventory.api';
import { useCategories } from '@/api/catalog.api';
import { getErrorMessage } from '@/api/client';
import { useCan } from '@/hooks/usePermission';
import { useDebounce } from '@/hooks/useDebounce';
import { PERMISSIONS } from '@/utils/permissions';
import { formatCurrency } from '@/utils/format';
import { cn } from '@/lib/utils';
import type { StockLevel } from '@/types/inventory';
import { ReorderDialog } from './ReorderDialog';
import { StockDetailDrawer } from './StockDetailDrawer';
import { formatQty } from './shared';

interface SummaryCardProps {
  label: string;
  value: string;
  tone?: 'error';
  onClick?: () => void;
  active?: boolean;
}

function SummaryCard({ label, value, tone, onClick, active }: SummaryCardProps) {
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn('text-2xl font-semibold', tone === 'error' && 'text-destructive')}>{value}</p>
    </>
  );
  const className = cn(
    'rounded-xl border bg-card p-4 text-start',
    active && 'border-destructive ring-1 ring-destructive',
  );
  return onClick ? (
    <button type="button" className={cn(className, 'hover:bg-muted/50')} aria-pressed={active} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** UC-IN-01 tồn theo biến thể, UC-IN-02 đặt ngưỡng ngay trên dòng */
export function StockTab() {
  const can = useCan();
  const canReorder = can(PERMISSIONS.reorderManage);
  const canCost = can(PERMISSIONS.costView);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim());
  const [categoryId, setCategoryId] = useState('');
  const [belowMin, setBelowMin] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [editing, setEditing] = useState<StockLevel | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const stockQuery = useStock({
    page,
    pageSize,
    search: debouncedSearch || undefined,
    categoryId: categoryId || undefined,
    belowMin: belowMin || undefined,
  });
  const categories = useCategories().data ?? [];
  const summary = stockQuery.data?.summary;
  const filtered = Boolean(debouncedSearch || categoryId || belowMin);

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
        meta: { className: 'min-w-60' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="min-w-0">
              <p className="font-medium">{r.sku}</p>
              <p className="truncate text-xs text-muted-foreground">
                {r.productName}
                {r.attributesLabel && ` · ${r.attributesLabel}`}
              </p>
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
        meta: { className: 'w-24 text-right' },
        cell: ({ row }) => formatQty(row.original.onHand),
      },
      {
        id: 'reserved',
        header: 'Đang giữ',
        meta: { className: 'w-24 text-right' },
        cell: ({ row }) => formatQty(row.original.reserved),
      },
      {
        id: 'available',
        header: 'Khả dụng',
        meta: { className: 'w-28 text-right' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              {r.belowMin && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TriangleAlert
                      className="size-4 text-destructive"
                      aria-label={`Dưới ngưỡng ${formatQty(r.minQty ?? 0)}`}
                      data-testid="below-min"
                    />
                  </TooltipTrigger>
                  <TooltipContent>Dưới ngưỡng {formatQty(r.minQty ?? 0)}</TooltipContent>
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
        meta: { className: 'w-12 text-right' },
        cell: ({ row }) => (
          <RowAction label="Lịch sử biến động" onClick={() => setViewing(row.original.variantId)}>
            <History />
          </RowAction>
        ),
      },
    ],
    [canReorder, canCost],
  );

  return (
    <div>
      <div className={cn('mb-4 grid gap-4', canCost ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
        <SummaryCard label="Biến thể đang bán" value={summary ? formatQty(summary.variantCount) : '—'} />
        <SummaryCard
          label="Dưới ngưỡng tồn"
          value={summary ? formatQty(summary.belowMinCount) : '—'}
          tone={summary?.belowMinCount ? 'error' : undefined}
          active={belowMin}
          onClick={() => withReset(setBelowMin)(!belowMin)}
        />
        {canCost && (
          <SummaryCard
            label="Giá trị tồn (giá vốn)"
            value={summary?.totalValue != null ? formatCurrency(summary.totalValue) : '—'}
          />
        )}
      </div>

      {stockQuery.isError && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(stockQuery.error)}
        </AlertMessage>
      )}

      <Card className="gap-0 py-0">
        <FilterBar>
          <SearchInput
            value={search}
            onChange={withReset(setSearch)}
            placeholder="Tìm theo tên sản phẩm hoặc SKU"
          />
          <FilterSelect
            label="Danh mục"
            value={categoryId}
            onChange={withReset(setCategoryId)}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
          />
          <div className="flex items-center gap-2 md:h-9">
            <Switch id="below-min" checked={belowMin} onCheckedChange={withReset(setBelowMin)} />
            <Label htmlFor="below-min">Chỉ hiện dưới ngưỡng</Label>
          </div>
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
          setEditing(null);
          toast.success(msg);
        }}
      />
      <StockDetailDrawer variantId={viewing} canCost={canCost} onClose={() => setViewing(null)} />
    </div>
  );
}
