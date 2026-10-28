import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { ClipboardList, Printer, Truck } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { FlagChips } from '@/components/common/FlagChips';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useHandOver, usePackageQueue, usePickList } from '@/api/fulfillment.api';
import { useShops } from '@/api/shops.api';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import type { PackageSummary, PackageTab } from '@/types/fulfillment';
import type { OrderSource } from '@/types/sales';
import { SOURCE_LABELS, sourceLabel } from '@/features/sales/shared';
import { PACKAGE_FLAGS, PACKAGE_STATUS, PACKAGE_TABS, handoverFailureLabel } from './shared';

const PAGE_SIZES = [25, 50, 100];
const MAX_HANDOVER = 50;

/** Hàng đợi kiện theo bước làm việc của kho (sơ đồ D2): nhặt, đóng gói, bàn giao hàng loạt */
export function PackageQueuePage() {
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const canViewShops = useCan()(PERMISSIONS.shopView);
  const f = useUrlFilters(PAGE_SIZES);
  const tabParam = f.params.get('tab') as PackageTab | null;
  const tab = PACKAGE_TABS.some((t) => t.value === tabParam) ? (tabParam as PackageTab) : 'reserved';
  const source = (f.params.get('source') ?? '') as OrderSource | '';
  const shopId = f.params.get('shopId') ?? '';

  const query = usePackageQueue({
    tab,
    page: f.page,
    pageSize: f.pageSize,
    search: f.q || undefined,
    source: source || undefined,
    shopId: shopId || undefined,
  });
  // Kho không có quyền xem gian hàng nên chỉ lọc theo nguồn
  const shops = useShops({ pageSize: 100 }, { enabled: canViewShops });
  const handOver = useHandOver();

  const [selected, setSelected] = useState<Map<string, PackageSummary>>(new Map());
  const [failed, setFailed] = useState<Map<string, string>>(new Map());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showPick, setShowPick] = useState(false);
  const picking = tab === 'reserved';
  const handing = tab === 'awaiting_pickup';
  const selectable = picking || handing;
  const pickList = usePickList([...selected.keys()], picking && showPick);
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const counts = query.data?.counts;
  const filtered = Boolean(f.q || source || shopId);
  const tooMany = handing && selected.size > MAX_HANDOVER;

  const toggle = (p: PackageSummary, on: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (on) next.set(p.id, p);
      else next.delete(p.id);
      return next;
    });
  const allOnPage = items.length > 0 && items.every((p) => selected.has(p.id));
  const toggleAll = (on: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      for (const p of items) {
        if (on) next.set(p.id, p);
        else next.delete(p.id);
      }
      return next;
    });

  const submitHandOver = async () => {
    setFailed(new Map());
    try {
      const r = await handOver.mutateAsync([...selected.values()].map((p) => ({ id: p.id, version: p.version })));
      if (r.handedOver.length) toast.success(`Đã bàn giao ${r.handedOver.length} kiện`);
      setFailed(new Map(r.failed.map((x) => [x.packageId, handoverFailureLabel(x.code)])));
      // Giữ chọn kiện lỗi để xem lại
      setSelected((prev) => new Map([...prev].filter(([id]) => r.failed.some((x) => x.packageId === id))));
    } catch (e) {
      toast.error(problemMessage(e));
    } finally {
      setConfirmOpen(false);
    }
  };

  const columns = useMemo<ColumnDef<PackageSummary>[]>(() => {
    const cols: ColumnDef<PackageSummary>[] = [
      {
        id: 'code',
        header: 'Mã kiện',
        meta: { className: 'w-32' },
        cell: ({ row }) => (
          <div className="grid gap-1">
            <span className="font-medium">{row.original.code}</span>
            {failed.has(row.original.id) && <Badge variant="destructive">{failed.get(row.original.id)}</Badge>}
          </div>
        ),
      },
      { id: 'order', header: 'Đơn', meta: { className: 'w-28' }, cell: ({ row }) => row.original.order.code },
      { id: 'source', header: 'Nguồn', meta: { className: 'w-40' }, cell: ({ row }) => sourceLabel(row.original) },
      { id: 'customer', header: 'Khách', meta: { className: 'min-w-36' }, cell: ({ row }) => row.original.customerName ?? '—' },
      { id: 'totalQty', header: 'Số lượng', meta: { className: 'w-24 text-right' }, cell: ({ row }) => row.original.totalQty },
      {
        id: 'status',
        header: 'Trạng thái',
        meta: { className: 'w-48' },
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <StatusBadge status={row.original.status} statuses={PACKAGE_STATUS} />
            <FlagChips flags={row.original.flags} meta={PACKAGE_FLAGS} />
            {row.original.selfDelivery && <Badge variant="outline">Tự giao</Badge>}
          </div>
        ),
      },
      {
        id: 'shipBy',
        header: 'Hạn bàn giao',
        meta: { className: 'w-40' },
        cell: ({ row }) => (row.original.shipBy ? formatDateTime(row.original.shipBy) : '—'),
      },
    ];
    if (selectable) {
      cols.unshift({
        id: 'select',
        meta: { className: 'w-10' },
        header: () => <Checkbox aria-label="Chọn cả trang" checked={allOnPage} onCheckedChange={(v) => toggleAll(v === true)} />,
        cell: ({ row }) => (
          <Checkbox
            aria-label={`Chọn ${row.original.code}`}
            checked={selected.has(row.original.id)}
            onClick={(e) => e.stopPropagation()}
            onCheckedChange={(v) => toggle(row.original, v === true)}
          />
        ),
      });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectable, selected, failed, allOnPage, items]);

  const action = picking ? (
    <Button variant="outline" onClick={() => setShowPick((v) => !v)}>
      <ClipboardList />
      Danh sách nhặt{selected.size > 0 ? ` (${selected.size} kiện)` : ''}
    </Button>
  ) : handing ? (
    <Button disabled={selected.size === 0 || tooMany} onClick={() => setConfirmOpen(true)}>
      <Truck />
      Bàn giao{selected.size > 0 ? ` (${selected.size})` : ''}
    </Button>
  ) : undefined;

  return (
    <div>
      <PageHeader title="Kiện hàng" subtitle="Nhặt, đóng gói, bàn giao và theo dõi giao theo từng kiện." action={action} />
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setSelected(new Map());
          setFailed(new Map());
          setShowPick(false);
          f.update({ tab: v === 'reserved' ? undefined : v, page: undefined });
        }}
      >
        <div className="mb-2 overflow-x-auto">
          <TabsList>
            {PACKAGE_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
                {counts && (
                  <Badge variant="secondary" className="ms-1">
                    {counts[t.value]}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      {tooMany && (
        <AlertMessage severity="warning" className="mb-4">
          Mỗi lần bàn giao tối đa {MAX_HANDOVER} kiện
        </AlertMessage>
      )}
      {failed.size > 0 && (
        <AlertMessage severity="warning" className="mb-4" onClose={() => setFailed(new Map())}>
          {failed.size} kiện chưa bàn giao được, xem lý do ở từng kiện
        </AlertMessage>
      )}
      {query.isError && (
        <AlertMessage severity="error" className="mb-4">
          {problemMessage(query.error)}
        </AlertMessage>
      )}
      {picking && showPick && (
        <Card className="print-area mb-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              Danh sách nhặt · {selected.size > 0 ? `${selected.size} kiện đã chọn` : 'mọi kiện cần đóng gói'}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer />
              In
            </Button>
          </CardHeader>
          <CardContent>
            <Table data-testid="pick-list">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">SKU</TableHead>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead>Thuộc tính</TableHead>
                  <TableHead className="w-24 text-right">Số lượng</TableHead>
                  <TableHead className="w-20 text-right">Số kiện</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(pickList.data ?? []).map((l) => (
                  <TableRow key={l.variantId} data-row-id={l.sku}>
                    <TableCell className="font-medium">{l.sku}</TableCell>
                    <TableCell className="whitespace-normal">{l.productName}</TableCell>
                    <TableCell>{l.attributesLabel || '—'}</TableCell>
                    <TableCell className="text-right">{l.quantity}</TableCell>
                    <TableCell className="text-right">{l.packageCount}</TableCell>
                  </TableRow>
                ))}
                {pickList.data?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Không có kiện cần nhặt
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <Card className="gap-0 py-0">
        <FilterBar>
          <SearchInput value={f.searchInput} onChange={f.setSearchInput} placeholder="Tìm mã kiện, mã đơn, tên khách" />
          <FilterSelect
            label="Nguồn"
            value={source}
            onChange={(v) => f.update({ source: v, shopId: v === 'marketplace' ? shopId : undefined, page: undefined })}
            options={(Object.keys(SOURCE_LABELS) as OrderSource[]).map((s) => ({ value: s, label: SOURCE_LABELS[s] }))}
          />
          {canViewShops && (
            <FilterSelect
              label="Gian hàng"
              value={shopId}
              onChange={f.setFilter('shopId')}
              options={(shops.data?.items ?? []).map((s) => ({ value: s.id, label: s.shopName }))}
            />
          )}
        </FilterBar>
        <DataTable
          columns={columns}
          data={items}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          fetching={query.isFetching}
          onRowClick={(p) => navigate(ROUTES.company.package(companyId, p.id))}
          empty={filtered ? 'Không tìm thấy kiện phù hợp' : 'Không có kiện nào'}
          pagination={{
            page: f.page,
            pageSize: f.pageSize,
            total: query.data?.total ?? 0,
            pageSizes: PAGE_SIZES,
            onChange: f.onPageChange,
          }}
        />
      </Card>
      <ConfirmDialog
        open={confirmOpen}
        title="Bàn giao kiện"
        message={`Bàn giao ${selected.size} kiện cho đơn vị vận chuyển. Hàng rời kho, tồn thực giảm theo từng kiện.`}
        confirmLabel="Bàn giao"
        loading={handOver.isPending}
        onConfirm={submitHandOver}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
