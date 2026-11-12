import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, ImageIcon, Pencil, Plus, Settings2, TableProperties } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { RowAction } from '@/components/common/RowAction';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCategories, useProducts } from '@/api/catalog.api';
import { getErrorMessage } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { useDebounce } from '@/hooks/useDebounce';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import type { ProductListItem, ProductListParams, ProductStatus } from '@/types/catalog';
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
  const canSetup = can(PERMISSIONS.catalogSetup);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim());
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState<ProductStatus>('active');
  const [businessStatus, setBusinessStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const business = useBusinessAction();
  const { startTour } = usePageGuide('products');

  const productsQuery = useProducts({
    page,
    pageSize,
    search: debouncedSearch || undefined,
    categoryId: categoryId || undefined,
    status,
    businessStatus: status === 'active' && businessStatus ? (businessStatus as ProductListParams['businessStatus']) : undefined,
  });
  const categoriesQuery = useCategories();
  const categories = categoriesQuery.data ?? [];

  const withReset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const open = (id: string) => navigate(ROUTES.company.catalogProduct(companyId, id));

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
            <span className="min-w-0 font-medium">{row.original.name}</span>
          </div>
        ),
      },
      {
        id: 'category',
        header: 'Danh mục',
        meta: { className: 'min-w-32' },
        cell: ({ row }) => row.original.category.name,
      },
      {
        accessorKey: 'variantCount',
        header: 'Biến thể',
        meta: {
          className: 'w-24',
          numeric: true,
          help: 'Số SKU chưa lưu trữ. Mỗi biến thể là một SKU, tồn và giá chuẩn nằm ở biến thể.',
        },
      },
      {
        id: 'status',
        header: 'Trạng thái',
        meta: {
          className: 'w-48',
          help: 'Trạng thái kinh doanh gộp từ các SKU: đang bán, tạm ngừng hoặc ngừng bán, kèm số SKU ở mỗi trạng thái.',
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
        meta: { className: 'w-24 text-right' },
        cell: ({ row }) => {
          const p = row.original;
          const editable = canManage && p.status === 'active';
          return (
            <div className="flex justify-end gap-1">
              <RowAction label={editable ? 'Sửa' : 'Xem'} onClick={() => open(p.id)}>
                {editable ? <Pencil /> : <Eye />}
              </RowAction>
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
    [canManage, companyId],
  );

  const filtered = Boolean(debouncedSearch || categoryId);
  const empty = filtered
    ? 'Không tìm thấy sản phẩm phù hợp'
    : status === 'archived'
      ? 'Chưa có sản phẩm đã lưu trữ'
      : 'Chưa có sản phẩm';

  return (
    <div>
      <PageHeader
        title="Sản phẩm"
        subtitle="Mỗi sản phẩm có các biến thể, mỗi biến thể một SKU."
        help="Mã SKU sinh theo quy tắc của danh mục, nên cần tạo danh mục và thuộc tính trước khi thêm sản phẩm."
        onTour={startTour}
        action={
          <div className="flex flex-wrap gap-2">
            {canSetup && (
              <Button variant="outline" onClick={() => navigate(ROUTES.company.catalogSetup(companyId))}>
                <Settings2 />
                Danh mục & thuộc tính
              </Button>
            )}
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
          <FilterSelect loading={categoriesQuery.isLoading}
            label="Danh mục"
            value={categoryId}
            onChange={withReset(setCategoryId)}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
          />
          {/* API không có "tất cả": sản phẩm chưa lưu trữ và đã lưu trữ xem riêng */}
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Trạng thái</Label>
            <Select value={status} onValueChange={withReset((v: string) => setStatus(v as ProductStatus))}>
              <SelectTrigger className="w-full md:min-w-40" aria-label="Trạng thái">
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
              label="Có SKU"
              value={businessStatus}
              onChange={withReset(setBusinessStatus)}
              options={(['selling', 'paused', 'discontinued'] as const).map((s) => ({
                value: s,
                label: BUSINESS_STATUS_LABELS[s],
              }))}
            />
          )}
        </FilterBar>
        <div data-guide="products-table">
          <DataTable
            columns={columns}
            data={productsQuery.data?.items ?? []}
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

      {business.dialog}
    </div>
  );
}
