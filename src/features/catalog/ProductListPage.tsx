import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Archive, Eye, ImageIcon, Pencil, Plus, Settings2 } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { RowAction } from '@/components/common/RowAction';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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
import { useArchiveProduct, useCategories, useProducts } from '@/api/catalog.api';
import { getErrorMessage } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { useDebounce } from '@/hooks/useDebounce';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import type { ProductListItem, ProductStatus } from '@/types/catalog';
import { PRODUCT_STATUS_LABELS } from './labels';

/** UC-CP-02: danh sách sản phẩm của công ty, tìm theo tên hoặc SKU */
export function ProductListPage() {
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [archiving, setArchiving] = useState<ProductListItem | null>(null);

  const productsQuery = useProducts({
    page,
    pageSize,
    search: debouncedSearch || undefined,
    categoryId: categoryId || undefined,
    status,
  });
  const categories = useCategories().data ?? [];
  const archiveMut = useArchiveProduct();

  const withReset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const open = (id: string) => navigate(ROUTES.company.catalogProduct(companyId, id));

  const handleArchive = async () => {
    if (!archiving) return;
    try {
      await archiveMut.mutateAsync({ id: archiving.id, version: archiving.version });
      toast.success(`Đã chuyển ${archiving.name} sang Đã lưu trữ`);
    } catch (e) {
      const code = problemCode(e);
      if (code === 'version_conflict') {
        toast.warning(`${archiving.name} vừa được người khác sửa. Chưa có gì thay đổi, hãy thử lại.`);
      } else if (code === 'product_has_active_orders') {
        toast.warning(`Không xoá được ${archiving.name} vì sản phẩm còn đơn hàng chưa hoàn tất.`);
      } else {
        toast.error(problemMessage(e));
      }
    }
    setArchiving(null);
  };

  const columns = useMemo<ColumnDef<ProductListItem>[]>(
    () => [
      {
        id: 'thumbnail',
        header: '',
        meta: { className: 'w-14' },
        cell: ({ row }) => (
          <Avatar className="size-10 rounded-md">
            {row.original.thumbnailUrl && (
              <AvatarImage src={row.original.thumbnailUrl} alt={row.original.name} className="object-cover" />
            )}
            <AvatarFallback className="rounded-md">
              <ImageIcon className="size-4 text-muted-foreground" />
            </AvatarFallback>
          </Avatar>
        ),
      },
      { accessorKey: 'name', header: 'Sản phẩm', meta: { className: 'min-w-56 font-medium' } },
      {
        id: 'category',
        header: 'Danh mục',
        meta: { className: 'min-w-32' },
        cell: ({ row }) => row.original.category.name,
      },
      {
        accessorKey: 'variantCount',
        header: 'Số biến thể',
        meta: { className: 'w-28 text-right' },
      },
      {
        id: 'status',
        header: 'Trạng thái',
        meta: { className: 'w-32' },
        cell: ({ row }) => {
          const s = PRODUCT_STATUS_LABELS[row.original.status];
          return <Badge variant={s.variant}>{s.label}</Badge>;
        },
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
              {editable && (
                <RowAction label="Xoá" destructive onClick={() => setArchiving(p)}>
                  <Archive />
                </RowAction>
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
        subtitle="Sản phẩm và biến thể; SKU sinh theo quy tắc của danh mục."
        action={
          <div className="flex flex-wrap gap-2">
            {canSetup && (
              <Button variant="outline" onClick={() => navigate(ROUTES.company.catalogSetup(companyId))}>
                <Settings2 />
                Danh mục & thuộc tính
              </Button>
            )}
            {canManage && (
              <Button onClick={() => navigate(ROUTES.company.catalogNew(companyId))}>
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
          <FilterSelect
            label="Danh mục"
            value={categoryId}
            onChange={withReset(setCategoryId)}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
          />
          {/* API không có "tất cả": sản phẩm đang bán và đã lưu trữ xem riêng */}
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
        </FilterBar>
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
      </Card>

      <ConfirmDialog
        open={Boolean(archiving)}
        title="Xoá sản phẩm?"
        message={
          <>
            <strong>{archiving?.name}</strong> sẽ chuyển sang Đã lưu trữ cùng {archiving?.variantCount}{' '}
            biến thể và chỉ còn xem được. SKU đã cấp được giữ lại, không cấp cho sản phẩm khác. Sản
            phẩm còn đơn hàng chưa hoàn tất thì không xoá được.
          </>
        }
        confirmLabel="Xoá"
        destructive
        loading={archiveMut.isPending}
        onConfirm={handleArchive}
        onClose={() => setArchiving(null)}
      />
    </div>
  );
}
