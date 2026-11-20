import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Link2, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { RowAction } from '@/components/common/RowAction';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAttributes, useDeleteAttribute, useDeleteGroup, useGroups } from '@/api/catalog.api';
import { getErrorMessage } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { useCan, useModuleEnabled } from '@/hooks/usePermission';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import { usePageGuide } from '@/guides/usePageGuide';
import type { Attribute, ProductGroup } from '@/types/catalog';
import { GroupFormDialog } from './GroupFormDialog';
import { DeleteGroupDialog } from './DeleteGroupDialog';
import { SUGGEST_KEYS } from './suggest';
import { AttributeFormDialog } from './AttributeFormDialog';
import { PlatformCategoryTab } from './PlatformCategoryTab';
import { PLATFORM_TABS, isPlatformTab } from './platformCategory';
import { SpecFieldsTab } from './specs/SpecFieldsTab';
import { GroupTemplateDialog } from './specs/GroupTemplateDialog';
import { AxisMappingDialog, AxisMappingLine } from './specs/AxisMappingDialog';

type Deleting = { kind: 'group'; item: ProductGroup } | { kind: 'attribute'; item: Attribute };
type TabKey = 'groups' | 'specs' | 'attributes';

const ADD_LABELS: Record<TabKey, string> = {
  groups: 'Thêm nhóm hàng',
  specs: 'Thêm thông số',
  attributes: 'Thêm thuộc tính phân loại',
};

/**
 * UC-CP-01: nhóm hàng (FE#350, Documents/21 §5.2), thuộc tính và giá trị.
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
  const [tab, setTab] = useState<TabKey>('groups');
  const { startTour } = usePageGuide('catalog-setup');

  const groupsQuery = useGroups();
  const attributesQuery = useAttributes();
  const deleteGroup = useDeleteGroup();
  const deleteAttribute = useDeleteAttribute();

  const [groupForm, setGroupForm] = useState<{ item: ProductGroup | null } | null>(null);
  const [attributeForm, setAttributeForm] = useState<{ item: Attribute | null } | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [templateOf, setTemplateOf] = useState<ProductGroup | null>(null);
  const [creatingSpec, setCreatingSpec] = useState(false);
  const [axisOf, setAxisOf] = useState<Attribute | null>(null);
  // Nhóm còn sản phẩm: chuyển hết sang nhóm khác rồi xoá
  const [moving, setMoving] = useState<ProductGroup | null>(null);

  const handleDelete = async () => {
    if (!deleting) return;
    const { id, version, name } = deleting.item;
    try {
      if (deleting.kind === 'group') await deleteGroup.mutateAsync({ id, version });
      else await deleteAttribute.mutateAsync({ id, version });
      toast.success(`Đã xoá ${name}`);
    } catch (e) {
      const code = problemCode(e);
      if (code === 'in_use' && deleting.kind === 'group') {
        // Có người vừa thêm sản phẩm vào nhóm: nạp lại số sản phẩm, lần bấm sau mở pop-up chuyển
        void groupsQuery.refetch();
        toast.warning(`${name} vừa có sản phẩm mới. Bấm Xoá lại để chuyển sản phẩm sang nhóm khác.`);
      } else if (code === 'in_use') {
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

  const groupColumns = useMemo<ColumnDef<ProductGroup>[]>(
    () => [
      { accessorKey: 'name', header: 'Nhóm hàng', meta: { className: 'min-w-40 font-medium' } },
      { accessorKey: 'productCount', header: 'Số sản phẩm', meta: { className: 'w-28 text-right' } },
      {
        id: 'axes',
        header: 'Trục phân loại chuẩn',
        meta: { className: 'min-w-40' },
        cell: ({ row }) =>
          row.original.axes?.length ? (
            row.original.axes.map((a) => a.name).join(', ')
          ) : (
            <span className="text-muted-foreground">Chưa đặt</span>
          ),
      },
      {
        id: 'template',
        header: 'Mẫu thông số',
        meta: { className: 'w-40 whitespace-nowrap' },
        cell: ({ row }) => {
          const n = row.original.specFieldCount ?? 0;
          const label = n ? `${n} thông số · ${row.original.requiredCount ?? 0} bắt buộc` : 'Chưa có mẫu';
          return canManage ? (
            <button
              type="button"
              className="min-h-6 cursor-pointer text-primary-text hover:underline"
              onClick={() => setTemplateOf(row.original)}
            >
              {label}
            </button>
          ) : (
            <span className={n ? undefined : 'text-muted-foreground'}>{label}</span>
          );
        },
      },
      {
        id: 'suggest',
        header: 'Gợi ý',
        meta: { className: 'w-36 whitespace-nowrap' },
        cell: ({ row }) => {
          const own = SUGGEST_KEYS.filter((k) => row.original.suggest[k] !== null).length;
          return own ? <Badge variant="secondary">Riêng {own}/5 ô</Badge> : <span className="text-muted-foreground">Theo công ty</span>;
        },
      },
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
              meta: { className: 'w-32 text-right' },
              cell: ({ row }) => (
                <div className="flex justify-end gap-1">
                  <RowAction label="Sửa mẫu thông số" onClick={() => setTemplateOf(row.original)}>
                    <ListChecks />
                  </RowAction>
                  <RowAction label="Sửa" onClick={() => setGroupForm({ item: row.original })}>
                    <Pencil />
                  </RowAction>
                  <RowAction
                    label="Xoá"
                    destructive
                    onClick={() =>
                      row.original.productCount > 0
                        ? setMoving(row.original)
                        : setDeleting({ kind: 'group', item: row.original })
                    }
                  >
                    <Trash2 />
                  </RowAction>
                </div>
              ),
            } satisfies ColumnDef<ProductGroup>,
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
      ...(showPlatforms
        ? [
            {
              id: 'axisMapping',
              header: 'Trục trên sàn',
              meta: { className: 'min-w-52' },
              cell: ({ row }) => (
                <button
                  type="button"
                  className="grid w-full cursor-pointer gap-1 rounded-md text-left hover:bg-muted"
                  aria-label={`Ghép ${row.original.name} sang phân loại của sàn`}
                  onClick={() => setAxisOf(row.original)}
                >
                  {PLATFORM_TABS.map((t) => (
                    <AxisMappingLine key={t.platform} attribute={row.original} platform={t.platform} label={t.label} />
                  ))}
                </button>
              ),
            } satisfies ColumnDef<Attribute>,
          ]
        : []),
      ...(canManage
        ? [
            {
              id: 'actions',
              header: '',
              meta: { className: 'w-32 text-right' },
              cell: ({ row }) => (
                <div className="flex justify-end gap-1">
                  {showPlatforms && (
                    <RowAction label="Ghép sang sàn" onClick={() => setAxisOf(row.original)}>
                      <Link2 />
                    </RowAction>
                  )}
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
    [canManage, showPlatforms],
  );

  const query = tab === 'attributes' ? attributesQuery : groupsQuery;
  const done = (message: string) => {
    setGroupForm(null);
    setAttributeForm(null);
    toast.success(message);
  };

  return (
    <div>
      <PageHeader
        title="Nhóm hàng & thuộc tính"
        subtitle="Nhóm hàng và mẫu thông số để dựng form sản phẩm; thuộc tính phân loại để tạo variant."
        help="Công ty mới có sẵn 12 nhóm hàng, mỗi nhóm có mẫu thông số và trục phân loại chuẩn. Thông số (chất liệu, công dụng…) định nghĩa một lần ở tab Thông số, nhóm nào cần thì thêm vào mẫu. Nhóm hàng không ghép sang sàn; mã SKU sinh theo mẫu của công ty. Mỗi nhóm đặt được gợi ý giá, gợi ý nhập lại riêng, để trống thì theo Cài đặt sản phẩm. Thuộc tính phân loại (màu, cỡ…) và các giá trị của nó dùng để tạo tổ hợp variant."
        onTour={startTour}
        action={
          canManage && source === 'commerio' ? (
            <Button
              data-guide="catalog-add"
              onClick={() =>
                tab === 'groups'
                  ? setGroupForm({ item: null })
                  : tab === 'specs'
                    ? setCreatingSpec(true)
                    : setAttributeForm({ item: null })
              }
            >
              <Plus />
              {ADD_LABELS[tab]}
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
              <TabsTrigger value="groups" data-guide="catalog-categories">
                Nhóm hàng
              </TabsTrigger>
              <TabsTrigger value="specs">Thông số</TabsTrigger>
              <TabsTrigger value="attributes" data-guide="catalog-attributes">
                Thuộc tính phân loại
              </TabsTrigger>
            </TabsList>
            <TabsContent value="groups">
              <Card className="py-0">
                <DataTable
                  columns={groupColumns}
                  data={groupsQuery.data ?? []}
                  getRowId={(r) => r.id}
                  loading={groupsQuery.isLoading} fetching={groupsQuery.isFetching}
                  empty="Chưa có nhóm hàng"
                />
              </Card>
            </TabsContent>
            <TabsContent value="specs">
              <SpecFieldsTab canManage={canManage} showMapping={showPlatforms} creating={creatingSpec} onCloseCreate={() => setCreatingSpec(false)} />
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

      <GroupFormDialog
        open={Boolean(groupForm)}
        group={groupForm?.item ?? null}
        onClose={() => setGroupForm(null)}
        onDone={done}
      />
      <AxisMappingDialog attribute={axisOf} canEdit={canManage} onClose={() => setAxisOf(null)} />
      <GroupTemplateDialog
        group={templateOf}
        onClose={() => setTemplateOf(null)}
        onDone={(message) => {
          setTemplateOf(null);
          toast.success(message);
        }}
      />
      <DeleteGroupDialog
        group={moving}
        groups={groupsQuery.data ?? []}
        onClose={() => setMoving(null)}
        onDone={(message) => {
          setMoving(null);
          toast.success(message);
        }}
      />
      <AttributeFormDialog
        open={Boolean(attributeForm)}
        attribute={attributeForm?.item ?? null}
        onClose={() => setAttributeForm(null)}
        onDone={done}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={deleting?.kind === 'group' ? 'Xoá nhóm hàng?' : 'Xoá thuộc tính phân loại?'}
        message={
          <>
            Bạn sắp xoá <strong>{deleting?.item.name}</strong>. Hành động này không thể hoàn tác.
          </>
        }
        confirmLabel="Xoá"
        destructive
        loading={deleteGroup.isPending || deleteAttribute.isPending}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
