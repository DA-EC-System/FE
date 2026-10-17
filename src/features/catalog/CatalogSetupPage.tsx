import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { RowAction } from '@/components/common/RowAction';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useAttributes,
  useCategories,
  useDeleteAttribute,
  useDeleteCategory,
} from '@/api/catalog.api';
import { getErrorMessage } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { useCan } from '@/hooks/usePermission';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import type { Attribute, Category } from '@/types/catalog';
import { CategoryFormDialog } from './CategoryFormDialog';
import { AttributeFormDialog } from './AttributeFormDialog';

type Deleting = { kind: 'category'; item: Category } | { kind: 'attribute'; item: Attribute };
type TabKey = 'categories' | 'attributes';

/** UC-CP-01: danh mục kèm quy tắc SKU, thuộc tính và giá trị */
export function CatalogSetupPage() {
  const can = useCan();
  const canManage = can(PERMISSIONS.catalogSetup);
  const [tab, setTab] = useState<TabKey>('categories');

  const categoriesQuery = useCategories();
  const attributesQuery = useAttributes();
  const deleteCategory = useDeleteCategory();
  const deleteAttribute = useDeleteAttribute();

  const [categoryForm, setCategoryForm] = useState<{ item: Category | null } | null>(null);
  const [attributeForm, setAttributeForm] = useState<{ item: Attribute | null } | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);

  const handleDelete = async () => {
    if (!deleting) return;
    const { id, version, name } = deleting.item;
    try {
      if (deleting.kind === 'category') await deleteCategory.mutateAsync({ id, version });
      else await deleteAttribute.mutateAsync({ id, version });
      toast.success(`Đã xoá ${name}`);
    } catch (e) {
      const code = problemCode(e);
      if (code === 'in_use') {
        // V25: kể cả khi chỉ còn sản phẩm đã lưu trữ
        toast.warning(`Không thể xoá ${name} vì đang được sử dụng.`);
      } else if (code === 'version_conflict') {
        toast.warning(`${name} vừa được người khác sửa. Chưa có gì thay đổi, hãy thử lại.`);
      } else {
        toast.error(problemMessage(e));
      }
    }
    setDeleting(null);
  };

  const inUseReason = (count: number) =>
    count > 0 ? `Đang có ${count} sản phẩm dùng (kể cả đã lưu trữ), không xoá được` : null;

  const categoryColumns = useMemo<ColumnDef<Category>[]>(
    () => [
      { accessorKey: 'name', header: 'Danh mục', meta: { className: 'min-w-40 font-medium' } },
      {
        accessorKey: 'skuPattern',
        header: 'Quy tắc SKU',
        meta: { className: 'min-w-44 font-mono' },
      },
      { accessorKey: 'skuNextSeq', header: 'Số kế tiếp', meta: { className: 'w-28 text-right' } },
      { accessorKey: 'productCount', header: 'Số sản phẩm', meta: { className: 'w-28 text-right' } },
      {
        id: 'updatedAt',
        header: 'Cập nhật',
        meta: { className: 'w-40 whitespace-nowrap' },
        cell: ({ row }) => formatDateTime(row.original.updatedAt),
      },
      ...(canManage
        ? [
            {
              id: 'actions',
              header: '',
              meta: { className: 'w-24 text-right' },
              cell: ({ row }) => (
                <div className="flex justify-end gap-1">
                  <RowAction label="Sửa" onClick={() => setCategoryForm({ item: row.original })}>
                    <Pencil />
                  </RowAction>
                  <RowAction
                    label="Xoá"
                    destructive
                    reason={inUseReason(row.original.productCount)}
                    onClick={() => setDeleting({ kind: 'category', item: row.original })}
                  >
                    <Trash2 />
                  </RowAction>
                </div>
              ),
            } satisfies ColumnDef<Category>,
          ]
        : []),
    ],
    [canManage],
  );

  const attributeColumns = useMemo<ColumnDef<Attribute>[]>(
    () => [
      { accessorKey: 'name', header: 'Thuộc tính', meta: { className: 'w-44 font-medium' } },
      {
        id: 'values',
        header: 'Giá trị (mã)',
        meta: { className: 'min-w-64' },
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.values.map((v) => (
              <Badge
                key={v.id}
                variant={v.inUse ? 'secondary' : 'outline'}
                title={v.inUse ? 'Đã có biến thể dùng' : undefined}
              >
                {v.value}
                <span className="font-mono text-muted-foreground">{v.code}</span>
              </Badge>
            ))}
          </div>
        ),
      },
      { accessorKey: 'productCount', header: 'Số sản phẩm', meta: { className: 'w-28 text-right' } },
      ...(canManage
        ? [
            {
              id: 'actions',
              header: '',
              meta: { className: 'w-24 text-right' },
              cell: ({ row }) => (
                <div className="flex justify-end gap-1">
                  <RowAction label="Sửa" onClick={() => setAttributeForm({ item: row.original })}>
                    <Pencil />
                  </RowAction>
                  <RowAction
                    label="Xoá"
                    destructive
                    reason={inUseReason(row.original.productCount)}
                    onClick={() => setDeleting({ kind: 'attribute', item: row.original })}
                  >
                    <Trash2 />
                  </RowAction>
                </div>
              ),
            } satisfies ColumnDef<Attribute>,
          ]
        : []),
    ],
    [canManage],
  );

  const query = tab === 'categories' ? categoriesQuery : attributesQuery;
  const done = (message: string) => {
    setCategoryForm(null);
    setAttributeForm(null);
    toast.success(message);
  };

  return (
    <div>
      <PageHeader
        title="Danh mục & thuộc tính"
        subtitle="Danh mục quyết định quy tắc SKU; thuộc tính dùng để tạo tổ hợp biến thể."
        action={
          canManage ? (
            <Button
              onClick={() =>
                tab === 'categories' ? setCategoryForm({ item: null }) : setAttributeForm({ item: null })
              }
            >
              <Plus />
              {tab === 'categories' ? 'Thêm danh mục' : 'Thêm thuộc tính'}
            </Button>
          ) : null
        }
      />

      {query.isError && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(query.error)}
        </AlertMessage>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList>
          <TabsTrigger value="categories">Danh mục</TabsTrigger>
          <TabsTrigger value="attributes">Thuộc tính</TabsTrigger>
        </TabsList>
        <TabsContent value="categories">
          <Card className="py-0">
            <DataTable
              columns={categoryColumns}
              data={categoriesQuery.data ?? []}
              getRowId={(r) => r.id}
              loading={categoriesQuery.isLoading}
              empty="Chưa có danh mục"
            />
          </Card>
        </TabsContent>
        <TabsContent value="attributes">
          <Card className="py-0">
            <DataTable
              columns={attributeColumns}
              data={attributesQuery.data ?? []}
              getRowId={(r) => r.id}
              loading={attributesQuery.isLoading}
              empty="Chưa có thuộc tính"
            />
          </Card>
        </TabsContent>
      </Tabs>

      <CategoryFormDialog
        open={Boolean(categoryForm)}
        category={categoryForm?.item ?? null}
        onClose={() => setCategoryForm(null)}
        onDone={done}
      />
      <AttributeFormDialog
        open={Boolean(attributeForm)}
        attribute={attributeForm?.item ?? null}
        onClose={() => setAttributeForm(null)}
        onDone={done}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={deleting?.kind === 'category' ? 'Xoá danh mục?' : 'Xoá thuộc tính?'}
        message={
          <>
            Bạn sắp xoá <strong>{deleting?.item.name}</strong>. Hành động này không thể hoàn tác.
          </>
        }
        confirmLabel="Xoá"
        destructive
        loading={deleteCategory.isPending || deleteAttribute.isPending}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
