import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { useCan, useModuleEnabled } from '@/hooks/usePermission';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import { usePageGuide } from '@/guides/usePageGuide';
import type { Attribute, Category } from '@/types/catalog';
import { CategoryFormDialog } from './CategoryFormDialog';
import { AttributeFormDialog } from './AttributeFormDialog';
import { PlatformCategoryTab } from './PlatformCategoryTab';
import { PLATFORM_TABS, isPlatformTab } from './platformCategory';

type Deleting = { kind: 'category'; item: Category } | { kind: 'attribute'; item: Attribute };
type TabKey = 'categories' | 'attributes';

/**
 * UC-CP-01: category kèm quy tắc SKU, thuộc tính và giá trị.
 * Tab Lazada, TikTok: cây category và attribute của sàn, chỉ đọc (commerio-backend#400).
 */
export function CatalogSetupPage() {
  const can = useCan();
  const canManage = can(PERMISSIONS.catalogSetup);
  const showPlatforms = useModuleEnabled('channel') && can(PERMISSIONS.shopView);
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const source = showPlatforms && isPlatformTab(requested) ? requested : 'commerio';
  const setSource = (value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === 'commerio') next.delete('tab');
        else next.set('tab', value);
        return next;
      },
      { replace: true },
    );
  const [tab, setTab] = useState<TabKey>('categories');
  const { startTour } = usePageGuide('catalog-setup');

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
      { accessorKey: 'name', header: 'Category', meta: { className: 'min-w-40 font-medium' } },
      {
        accessorKey: 'skuPattern',
        header: 'Quy tắc SKU',
        meta: { className: 'min-w-44 font-mono' },
      },
      { accessorKey: 'skuNextSeq', header: 'Số thứ tự tiếp theo', meta: { className: 'w-28 text-right' } },
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
      { accessorKey: 'name', header: 'Thuộc tính phân loại', meta: { className: 'w-44 font-medium' } },
      {
        id: 'values',
        header: 'Giá trị (mã trong SKU)',
        meta: { className: 'min-w-64' },
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.values.map((v) => (
              <Badge
                key={v.id}
                variant={v.inUse ? 'secondary' : 'outline'}
                title={v.inUse ? 'Đã có variant dùng' : undefined}
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
        title="Category & thuộc tính"
        subtitle="Tạo category trước, rồi tới thuộc tính phân loại."
        help="Category quyết định quy tắc sinh mã SKU của sản phẩm trong đó. Thuộc tính phân loại (màu, cỡ…) và các giá trị của nó dùng để tạo tổ hợp variant."
        onTour={startTour}
        action={
          canManage && source === 'commerio' ? (
            <Button
              data-guide="catalog-add"
              onClick={() =>
                tab === 'categories' ? setCategoryForm({ item: null }) : setAttributeForm({ item: null })
              }
            >
              <Plus />
              {tab === 'categories' ? 'Thêm category' : 'Thêm thuộc tính phân loại'}
            </Button>
          ) : null
        }
      />

      <Tabs value={source} onValueChange={setSource}>
        {showPlatforms && (
          <TabsList className="mb-3">
            <TabsTrigger value="commerio">Của công ty</TabsTrigger>
            {PLATFORM_TABS.map((t) => (
              <TabsTrigger key={t.platform} value={t.platform}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        )}
        <TabsContent value="commerio">
          {query.isError && (
            <AlertMessage severity="error" className="mb-4">
              {getErrorMessage(query.error)}
            </AlertMessage>
          )}

          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
            <TabsList>
              <TabsTrigger value="categories" data-guide="catalog-categories">
                Category
              </TabsTrigger>
              <TabsTrigger value="attributes" data-guide="catalog-attributes">
                Thuộc tính phân loại
              </TabsTrigger>
            </TabsList>
            <TabsContent value="categories">
              <Card className="py-0">
                <DataTable
                  columns={categoryColumns}
                  data={categoriesQuery.data ?? []}
                  getRowId={(r) => r.id}
                  loading={categoriesQuery.isLoading} fetching={categoriesQuery.isFetching}
                  empty="Chưa có category"
                />
              </Card>
            </TabsContent>
            <TabsContent value="attributes">
              <Card className="py-0">
                <DataTable
                  columns={attributeColumns}
                  data={attributesQuery.data ?? []}
                  getRowId={(r) => r.id}
                  loading={attributesQuery.isLoading} fetching={attributesQuery.isFetching}
                  empty="Chưa có thuộc tính phân loại"
                />
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>
        {showPlatforms &&
          PLATFORM_TABS.map((t) => (
            <TabsContent key={t.platform} value={t.platform}>
              <PlatformCategoryTab platform={t.platform} />
            </TabsContent>
          ))}
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
        title={deleting?.kind === 'category' ? 'Xoá category?' : 'Xoá thuộc tính phân loại?'}
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
