import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Link2 } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { RowAction } from '@/components/common/RowAction';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCategories } from '@/api/catalog.api';
import { problemMessage } from '@/api/problemMessages';
import { useCategoryMaps, useShop } from '@/api/shops.api';
import { useCan } from '@/hooks/usePermission';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import { CategoryMapDialog } from './CategoryMapDialog';
import { categoryMapRows, type CategoryMapRow } from './categoryMap';
import { isUsable } from './shopSchemas';

interface CategoryMapSectionProps {
  shopId: string;
  /**
   * Danh mục Commerio đang mở hộp ghép. Truyền vào khi trang chứa cần mở hộp từ chỗ khác
   * (vd dòng đẩy lỗi `category_unmapped`); bỏ trống thì mục tự giữ.
   */
  editingCategoryId?: string | null;
  onEditingChange?: (categoryId: string | null) => void;
}

/**
 * FE#146: bảng danh mục Commerio và danh mục sàn đã ghép của một gian hàng.
 * Tự lấy dữ liệu theo `shopId` để chuyển nguyên sang trang chi tiết gian hàng mới (FE#135).
 */
export function CategoryMapSection({ shopId, editingCategoryId, onEditingChange }: CategoryMapSectionProps) {
  const can = useCan();
  const shopQuery = useShop(shopId);
  const usable = shopQuery.data ? isUsable(shopQuery.data.status) : false;
  const canEdit = can(PERMISSIONS.listingManage) && usable;

  const categoriesQuery = useCategories();
  const mapsQuery = useCategoryMaps(shopId);

  const [ownEditing, setOwnEditing] = useState<string | null>(null);
  const editingId = editingCategoryId !== undefined ? editingCategoryId : ownEditing;
  const setEditing = (id: string | null) => {
    setOwnEditing(id);
    onEditingChange?.(id);
  };

  const rows = useMemo(
    () => categoryMapRows(categoriesQuery.data ?? [], mapsQuery.data ?? []),
    [categoriesQuery.data, mapsQuery.data],
  );
  const editing = rows.find((r) => r.category.id === editingId) ?? null;
  const unmapped = rows.filter((r) => !r.map).length;

  const columns = useMemo<ColumnDef<CategoryMapRow>[]>(() => {
    const cols: ColumnDef<CategoryMapRow>[] = [
      {
        id: 'category',
        header: 'Danh mục Commerio',
        cell: ({ row }) => <span className="font-medium">{row.original.category.name}</span>,
      },
      {
        id: 'external',
        header: 'Danh mục sàn',
        meta: { className: 'min-w-56' },
        cell: ({ row }) => {
          const m = row.original.map;
          if (!m) return <Badge variant="outline">Chưa ghép</Badge>;
          const values = Object.values(m.attributes).filter(Boolean);
          return (
            <div className="flex flex-col">
              <span>Mã {m.externalCategoryId}</span>
              {values.length > 0 && <span className="text-xs text-muted-foreground">{values.join(' · ')}</span>}
            </div>
          );
        },
      },
      {
        id: 'updatedAt',
        header: 'Cập nhật',
        cell: ({ row }) =>
          row.original.map ? (
            formatDateTime(row.original.map.updatedAt)
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ];
    if (canEdit) {
      cols.push({
        id: 'actions',
        header: '',
        meta: { className: 'w-12 text-right' },
        cell: ({ row }) => (
          <RowAction
            label={row.original.map ? 'Sửa ghép danh mục' : 'Ghép danh mục'}
            onClick={() => setEditing(row.original.category.id)}
          >
            {row.original.map ? <Pencil /> : <Link2 />}
          </RowAction>
        ),
      });
    }
    return cols;
    // setEditing chỉ gọi setState và callback của trang chứa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, onEditingChange]);

  const error = categoriesQuery.error ?? mapsQuery.error;

  return (
    <Card className="mt-6 gap-0 py-0" data-testid="category-map-section" id="category-maps">
      <CardHeader className="py-4">
        <CardTitle>Ghép danh mục</CardTitle>
        <CardDescription>
          Sàn cần danh mục lá và thuộc tính bắt buộc của danh mục. Ghép mỗi danh mục Commerio một lần, mọi sản phẩm
          trong danh mục dùng chung khi đẩy lên sàn.
          {rows.length > 0 && unmapped > 0 && ` Còn ${unmapped} danh mục chưa ghép.`}
        </CardDescription>
      </CardHeader>
      {error ? (
        <div className="px-6 pb-6">
          <AlertMessage severity="error">{problemMessage(error)}</AlertMessage>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(r) => r.category.id}
          loading={categoriesQuery.isLoading || mapsQuery.isLoading}
          fetching={categoriesQuery.isFetching || mapsQuery.isFetching}
          empty="Công ty chưa có danh mục sản phẩm"
        />
      )}
      {canEdit && (
        <CategoryMapDialog
          shopId={shopId}
          category={editing?.category ?? null}
          current={editing?.map ?? null}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}
