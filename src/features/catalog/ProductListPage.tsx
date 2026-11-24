import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { ImageIcon, Plus, TableProperties } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { GroupCombobox } from './GroupCombobox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProductDraftsTab } from '@/features/purchasing/ProductDraftsTab';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useGroups, useProducts } from '@/api/catalog.api';
import { getErrorMessage } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { useDebounce } from '@/hooks/useDebounce';
import { ROUTES } from '@/router/routes';
import { DRAFT_PERMISSIONS, PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import type { ProductListItem, ProductListParams, ProductStatus, VariantReadiness } from '@/types/catalog';
import { PRODUCT_STATUS_LABELS } from './labels';
import { usePageGuide } from '@/guides/usePageGuide';
import { BulkEditPage } from './BulkEditPage';
import { BUSINESS_STATUS_LABELS, BusinessActionMenu, ParentStatus, parentActions, useBusinessAction } from './businessStatus';

/** /catalog?mode=bulk mở bảng sửa hàng loạt (FE#155), cần quyền quản lý sản phẩm */
export function ProductListPage() {
  const [params, setParams] = useSearchParams();
  const can = useCan();
  if (params.get('mode') === 'bulk' && can(PERMISSIONS.productManage)) {
    return <BulkEditPage onExit={() => setParams({})} />;
  }
  return <ProductListView onBulk={() => setParams({ mode: 'bulk' })} />;
}

/** UC-CP-02: danh sách sản phẩm của công ty, tìm theo tên hoặc SKU */
function ProductListView({ onBulk }: { onBulk: () => void }) {
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const can = useCan();
  const canManage = can(PERMISSIONS.productManage);
  // Tab "Hàng mới sắp về cần soạn" (chốt 21/11/2026 câu 1): xem đề nghị hoặc quản lý sản phẩm (Documents/21 §16.3)
  const canDrafts = DRAFT_PERMISSIONS.some((p) => can(p));
  const [tabParams, setTabParams] = useSearchParams();
  const tab = canDrafts && tabParams.get('tab') === 'drafts' ? 'drafts' : 'products';

  const [urlParams] = useSearchParams();
  // `?search=`: link "Hoàn thiện <tên>" ở phiếu nhập kho mở sẵn đúng sản phẩm vừa tạo
  const [search, setSearch] = useState(() => urlParams.get('search') ?? '');
  const debouncedSearch = useDebounce(search.trim());
  const [groupId, setGroupId] = useState('');
  const [status, setStatus] = useState<ProductStatus>('active');
  const [businessStatus, setBusinessStatus] = useState('');
  // `?readiness=incomplete`: link "Hoàn thiện ngay" sau nhập kho mở thẳng bộ lọc Chờ hoàn thiện (Documents/29 bước 2–3)
  const [readiness, setReadiness] = useState(() => (urlParams.get('readiness') === 'incomplete' ? 'incomplete' : ''));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const business = useBusinessAction();
  const { startTour } = usePageGuide('products');

  const productsQuery = useProducts({
    page,
    pageSize,
    search: debouncedSearch || undefined,
    groupId: groupId || undefined,
    status,
    businessStatus: status === 'active' && businessStatus ? (businessStatus as ProductListParams['businessStatus']) : undefined,
    readiness: status === 'active' && readiness ? (readiness as VariantReadiness) : undefined,
  });
  // BE chưa lọc `readiness` (Documents#228 chờ merge) thì lọc thêm trên trang để không hiện sai dòng
  const rows = (productsQuery.data?.items ?? []).filter((p) =>
    status !== 'active' || !readiness ? true : readiness === 'incomplete' ? p.incompleteCount > 0 : p.incompleteCount === 0,
  );
  // Bộ lọc vẫn lọc được theo nhóm chuẩn đã ẩn (Documents/25 E182)
  const groupsQuery = useGroups({ includeHidden: true });
  const groups = groupsQuery.data ?? [];

  const withReset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  // Mở từ bộ lọc Chờ hoàn thiện: form có nút "Lưu và sang sản phẩm kế" (phương án 3A)
  const productHref = (id: string) =>
    `${ROUTES.company.catalogProduct(companyId, id)}${readiness === 'incomplete' ? '?from=incomplete' : ''}`;
  const open = (id: string) => navigate(productHref(id));

  const columns = useMemo<ColumnDef<ProductListItem>[]>(
    () => [
      {
        id: 'name',
        header: 'Sản phẩm',
        meta: { className: 'min-w-64' },
        // Ảnh nhỏ cạnh tên như `.pthumb` của Test_UI
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <Avatar className="size-9 shrink-0 rounded-md">
              {row.original.thumbnailUrl && (
                <AvatarImage src={row.original.thumbnailUrl} alt="" className="object-cover" />
              )}
              <AvatarFallback className="rounded-md">
                <ImageIcon className="size-4 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
            <span className="grid min-w-0">
              {/* Tên là link để mở bằng bàn phím; bấm vào dòng vẫn mở như cũ (FE#474) */}
              <Link
                to={productHref(row.original.id)}
                className="font-medium hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {row.original.name}
              </Link>
              <span className="font-mono text-xs text-muted-foreground" data-testid="product-code">
                {row.original.code}
              </span>
            </span>
          </div>
        ),
      },
      {
        id: 'group',
        header: 'Danh mục sản phẩm',
        meta: { className: 'min-w-32' },
        cell: ({ row }) => row.original.group.name,
      },
      {
        accessorKey: 'variantCount',
        header: 'Số biến thể',
        meta: {
          className: 'w-24',
          numeric: true,
          help: 'Số SKU đang dùng (không tính SKU đã lưu trữ). Mỗi biến thể là một SKU; tồn kho và giá chuẩn nằm ở từng SKU.',
        },
      },
      {
        id: 'status',
        header: 'Trạng thái',
        meta: {
          className: 'w-48',
          help: 'Tóm tắt trạng thái các SKU của sản phẩm. "Đang bán 3/5" là 3 trên 5 SKU đang bán trên sàn. Nếu không SKU nào đang bán thì hiện trạng thái của phần lớn SKU. Nhãn phụ "Thiếu thông tin", "Listing lỗi" báo có SKU cần xử lý.',
        },
        cell: ({ row }) => <ParentStatus item={row.original} />,
      },
      {
        id: 'updatedAt',
        header: 'Cập nhật',
        meta: { className: 'w-40 whitespace-nowrap' },
        cell: ({ row }) => formatDateTime(row.original.updatedAt),
      },
      {
        id: 'actions',
        header: '',
        meta: { className: 'w-28 text-right' },
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex justify-end gap-1">
              {canManage && (
                <BusinessActionMenu
                  label={`Đổi trạng thái ${p.name}`}
                  choices={parentActions(p).map((action) => ({ action }))}
                  onSelect={(action) => business.request({ productId: p.id, name: p.name, action })}
                />
              )}
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage, companyId, readiness],
  );

  const filtered = Boolean(debouncedSearch || groupId || readiness);
  const empty = filtered
    ? 'Không tìm thấy sản phẩm phù hợp'
    : status === 'archived'
      ? 'Chưa có sản phẩm đã lưu trữ'
      : 'Chưa có sản phẩm';

  return (
    <div>
      <PageHeader
        title="Sản phẩm"
        subtitle="Mỗi sản phẩm có một hoặc nhiều biến thể, mỗi biến thể là một SKU."
        help="Mỗi sản phẩm thuộc một danh mục sản phẩm; mã SKU tự tạo theo mẫu ở Cài đặt sản phẩm. Thuộc tính sản phẩm của từng danh mục sửa ở trang Danh mục sản phẩm."
        onTour={startTour}
        action={
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <Button variant="outline" onClick={onBulk}>
                <TableProperties />
                Sửa hàng loạt
              </Button>
            )}
            {canManage && (
              <Button onClick={() => navigate(ROUTES.company.catalogNew(companyId))} data-guide="products-add">
                <Plus />
                Thêm sản phẩm
              </Button>
            )}
          </div>
        }
      />

      {canDrafts && (
        <Tabs
          value={tab}
          onValueChange={(v) => setTabParams(v === 'drafts' ? { tab: 'drafts' } : {}, { replace: true })}
          className="mb-2"
        >
          <TabsList>
            <TabsTrigger value="products">Sản phẩm</TabsTrigger>
            <TabsTrigger value="drafts">Hàng mới sắp về cần soạn</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      {tab === 'drafts' ? (
        <ProductDraftsTab companyId={companyId} />
      ) : (
        <>
          {productsQuery.isError && (
            <AlertMessage severity="error" className="mb-4">
              {getErrorMessage(productsQuery.error)}
            </AlertMessage>
          )}

          <Card className="gap-0 py-0">
            <FilterBar>
              <SearchInput
                value={search}
                onChange={withReset(setSearch)}
                placeholder="Tìm theo tên hoặc SKU..."
              />
              <div className="grid gap-1.5 md:min-w-48">
                <Label className="text-xs text-muted-foreground">Danh mục sản phẩm</Label>
                <GroupCombobox
                  value={groupId}
                  onChange={withReset(setGroupId)}
                  groups={groups}
                  loading={groupsQuery.isLoading}
                  allLabel="Tất cả"
                />
              </div>
              {/* API không có "tất cả": sản phẩm đang hoạt động và đã lưu trữ xem riêng */}
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Hiển thị</Label>
                <Select value={status} onValueChange={withReset((v: string) => setStatus(v as ProductStatus))}>
                  <SelectTrigger className="w-full md:min-w-40" aria-label="Hiển thị">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRODUCT_STATUS_LABELS).map(([value, { label }]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {status === 'active' && (
                <FilterSelect
                  guide="products-business"
                  label="Trạng thái kinh doanh"
                  value={businessStatus}
                  onChange={withReset(setBusinessStatus)}
                  options={(['selling', 'paused', 'discontinued'] as const).map((s) => ({
                    value: s,
                    label: BUSINESS_STATUS_LABELS[s],
                  }))}
                />
              )}
              {status === 'active' && (
                <FilterSelect
                  label="Độ hoàn thiện"
                  value={readiness}
                  onChange={withReset(setReadiness)}
                  options={[
                    { value: 'incomplete', label: 'Chờ hoàn thiện' },
                    { value: 'ready', label: 'Sẵn sàng' },
                  ]}
                />
              )}
            </FilterBar>
            <div data-guide="products-table">
              <DataTable
                columns={columns}
                data={rows}
                getRowId={(r) => r.id}
                loading={productsQuery.isLoading}
                fetching={productsQuery.isFetching}
                empty={empty}
                onRowClick={(r) => open(r.id)}
                pagination={{
                  page,
                  pageSize,
                  total: productsQuery.data?.total ?? 0,
                  onChange: (p, size) => {
                    setPage(p);
                    setPageSize(size);
                  },
                }}
              />
            </div>
          </Card>
        </>
      )}

      {business.dialog}
    </div>
  );
}
