import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Eye, EyeOff, Link2, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { RowAction } from '@/components/common/RowAction';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAttributes, useDeleteAttribute, useDeleteGroup, useGroups, useSetGroupHidden } from '@/api/catalog.api';
import { getErrorMessage } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { useCan, useModuleEnabled } from '@/hooks/usePermission';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { usePageGuide } from '@/guides/usePageGuide';
import { isPlatform, type Attribute, type DataScope, type ProductGroup } from '@/types/catalog';
import { GroupFormDialog } from './GroupFormDialog';
import { DeleteGroupDialog } from './DeleteGroupDialog';
import { AttributeFormDialog } from './AttributeFormDialog';
import { PlatformCategoryTab } from './PlatformCategoryTab';
import { PLATFORM_TABS, isPlatformTab } from './platformCategory';
import { AxisMappingDialog, AxisMappingLine } from './specs/AxisMappingDialog';
import { ScopeSection } from './ScopeSection';
import { splitByScope } from './scope';
import { AttributeValuesDialog } from './AttributeValuesDialog';

const SCOPES: DataScope[] = ['platform', 'company'];

type Deleting = { kind: 'group'; item: ProductGroup } | { kind: 'attribute'; item: Attribute };

/**
 * Danh mục sản phẩm (Documents/29 bước 3, mục 2; Documents/21 §5.2, §5.6). Mỗi danh mục mở trang riêng để sửa thuộc
 * tính sản phẩm, biến thể theo và ánh xạ sang sàn (`CategoryDetailPage`). Mục cuối liệt kê thuộc tính biến thể và giá trị;
 * giá trị mới thêm ngay trong form sản phẩm, không có trang riêng (cố vấn chốt 22/11/2026).
 * Tab theo sàn: cây category và attribute của sàn, chỉ đọc (commerio-backend#400).
 */
export function CatalogSetupPage() {
  const can = useCan();
  const companyId = useAuth().companyContext?.companyId ?? '';
  const navigate = useNavigate();
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
  const { startTour } = usePageGuide('catalog-setup');

  // Trang cài đặt thấy cả danh mục mặc định đã ẩn để bật lại
  const groupsQuery = useGroups({ includeHidden: true });
  const hideMut = useSetGroupHidden();
  const attributesQuery = useAttributes();
  const deleteGroup = useDeleteGroup();
  const deleteAttribute = useDeleteAttribute();

  const [creating, setCreating] = useState(false);
  const [attributeForm, setAttributeForm] = useState<Attribute | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [axisOf, setAxisOf] = useState<Attribute | null>(null);
  const [valuesOf, setValuesOf] = useState<Attribute | null>(null);
  // Danh mục còn sản phẩm: chuyển hết sang danh mục khác rồi xoá
  const [moving, setMoving] = useState<ProductGroup | null>(null);

  const detailHref = (g: ProductGroup) => ROUTES.company.catalogCategory(companyId, g.id);

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
        void groupsQuery.refetch();
        toast.warning(`${name} vừa có sản phẩm mới. Bấm Xoá lại để chuyển sản phẩm sang danh mục khác.`);
      } else if (code === 'in_use') {
        toast.warning(`Không thể xoá ${name} vì đang được sử dụng.`);
      } else if (code === 'version_conflict') {
        toast.warning(`${name} vừa được người khác sửa. Chưa có gì thay đổi, hãy thử lại.`);
      } else {
        toast.error(problemMessage(e));
      }
    }
    setDeleting(null);
  };

  const toggleHidden = async (g: ProductGroup) => {
    try {
      await hideMut.mutateAsync({ id: g.id, hidden: !g.hidden });
      toast.success(g.hidden ? `Đã hiện lại ${g.name}` : `Đã ẩn ${g.name}. Sản phẩm đang ở danh mục này không đổi.`);
    } catch (e) {
      toast.error(problemMessage(e));
    }
  };

  const groupColumns = useMemo<ColumnDef<ProductGroup>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Danh mục',
        meta: { className: 'min-w-44 font-medium' },
        cell: ({ row }) => (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <Link
              to={detailHref(row.original)}
              className={row.original.hidden ? 'text-muted-foreground hover:underline' : 'text-primary-text hover:underline'}
            >
              {row.original.name}
            </Link>
            {row.original.hidden && (
              <Badge variant="outline" title="Không gợi ý khi tạo sản phẩm, đề nghị nhập hàng">
                Đã ẩn
              </Badge>
            )}
          </span>
        ),
      },
      {
        id: 'axes',
        header: 'Biến thể theo',
        meta: { className: 'min-w-40' },
        cell: ({ row }) =>
          row.original.axes?.length ? (
            row.original.axes.map((a) => a.name).join(', ')
          ) : (
            <span className="text-muted-foreground">Không có biến thể</span>
          ),
      },
      {
        id: 'template',
        header: 'Thuộc tính sản phẩm',
        meta: { className: 'w-44 whitespace-nowrap' },
        cell: ({ row }) => {
          const n = row.original.specFieldCount ?? 0;
          return n ? (
            `${n} thuộc tính · ${row.original.requiredCount ?? 0} bắt buộc`
          ) : (
            <span className="text-muted-foreground">Chưa có</span>
          );
        },
      },
      { accessorKey: 'productCount', header: 'Sản phẩm', meta: { className: 'w-24 text-right tabular-nums' } },
      {
        id: 'actions',
        header: '',
        meta: { className: 'w-32 text-right' },
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <RowAction label={canManage ? 'Mở để sửa' : 'Xem'} onClick={() => navigate(detailHref(row.original))}>
              <Pencil />
            </RowAction>
            {canManage &&
              (isPlatform(row.original) ? (
                <RowAction
                  label={row.original.hidden ? 'Hiện lại danh mục' : 'Ẩn danh mục (không bán)'}
                  reason={hideMut.isPending ? 'Đang lưu' : null}
                  onClick={() => void toggleHidden(row.original)}
                >
                  {row.original.hidden ? <Eye /> : <EyeOff />}
                </RowAction>
              ) : (
                <RowAction
                  label="Xoá"
                  destructive
                  onClick={() =>
                    row.original.productCount > 0 ? setMoving(row.original) : setDeleting({ kind: 'group', item: row.original })
                  }
                >
                  <Trash2 />
                </RowAction>
              ))}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- detailHref, toggleHidden đổi theo companyId và mutation
    [canManage, companyId, hideMut.isPending],
  );

  const attributeColumns = useMemo<ColumnDef<Attribute>[]>(
    () => [
      { accessorKey: 'name', header: 'Thuộc tính biến thể', meta: { className: 'w-44 font-medium' } },
      {
        id: 'values',
        header: 'Giá trị (mã trong SKU)',
        meta: { className: 'min-w-64' },
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.values.map((v) => {
              const own = isPlatform(row.original) && v.scope === 'company';
              return (
                <Badge
                  key={v.id}
                  variant={v.inUse ? 'secondary' : 'outline'}
                  title={[own ? 'Giá trị công ty tự thêm' : null, v.inUse ? 'Đã có biến thể dùng' : null].filter(Boolean).join('; ') || undefined}
                >
                  {v.value}
                  <span className="font-mono text-muted-foreground">{v.code}</span>
                  {own && <span className="text-muted-foreground">tự thêm</span>}
                </Badge>
              );
            })}
          </div>
        ),
      },
      { accessorKey: 'productCount', header: 'Sản phẩm', meta: { className: 'w-24 text-right tabular-nums' } },
      ...(showPlatforms
        ? [
            {
              id: 'axisMapping',
              header: 'Trên sàn',
              meta: { className: 'min-w-52' },
              cell: ({ row }) => (
                <button
                  type="button"
                  className="grid w-full cursor-pointer gap-1 rounded-md text-left hover:bg-muted"
                  aria-label={`Ánh xạ ${row.original.name} sang thuộc tính biến thể của sàn`}
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
                    <RowAction label="Ánh xạ sang sàn" onClick={() => setAxisOf(row.original)}>
                      <Link2 />
                    </RowAction>
                  )}
                  {isPlatform(row.original) ? (
                    <RowAction label="Giá trị tự thêm của công ty" onClick={() => setValuesOf(row.original)}>
                      <Plus />
                    </RowAction>
                  ) : (
                    <>
                      <RowAction label="Sửa" onClick={() => setAttributeForm(row.original)}>
                        <Pencil />
                      </RowAction>
                      <RowAction
                        label="Xoá"
                        destructive
                        reason={
                          row.original.productCount > 0
                            ? `Đang có ${row.original.productCount} sản phẩm dùng (kể cả đã lưu trữ), không xoá được`
                            : null
                        }
                        onClick={() => setDeleting({ kind: 'attribute', item: row.original })}
                      >
                        <Trash2 />
                      </RowAction>
                    </>
                  )}
                </div>
              ),
            } satisfies ColumnDef<Attribute>,
          ]
        : []),
    ],
    [canManage, showPlatforms],
  );

  const groupsByScope = useMemo(() => splitByScope(groupsQuery.data ?? []), [groupsQuery.data]);
  const error = groupsQuery.error ?? attributesQuery.error;

  return (
    <div>
      <PageHeader
        title="Danh mục sản phẩm"
        subtitle="Danh mục quyết định thuộc tính sản phẩm cần điền và biến thể gợi ý khi tạo sản phẩm."
        help="Danh mục mặc định của hệ thống dùng chung mọi công ty: không đổi tên, không xoá, nhưng thêm được thuộc tính sản phẩm riêng, lựa chọn riêng, và ẩn danh mục không bán. Danh mục tự tạo thì sửa, xoá tuỳ ý. Mở một danh mục để sửa thuộc tính sản phẩm, biến thể theo, ánh xạ sang sàn và gợi ý giá, ngưỡng tồn. Thuộc tính biến thể (màu, cỡ…) liệt kê ở cuối trang; giá trị mới thêm ngay khi tạo sản phẩm."
        onTour={startTour}
        action={
          canManage && source === 'commerio' ? (
            <Button data-guide="catalog-add" onClick={() => setCreating(true)}>
              <Plus />
              Thêm danh mục
            </Button>
          ) : null
        }
      />

      <Tabs value={source} onValueChange={setSource}>
        {showPlatforms && (
          <TabsList className="mb-3">
            <TabsTrigger value="commerio">Danh mục sản phẩm</TabsTrigger>
            {PLATFORM_TABS.map((t) => (
              <TabsTrigger key={t.platform} value={t.platform}>
                Category {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        )}
        <TabsContent value="commerio" className="grid gap-6">
          {error && <AlertMessage severity="error">{getErrorMessage(error)}</AlertMessage>}
          {SCOPES.map((scope) => {
            const rows = groupsByScope[scope];
            const hidden = rows.filter((g) => g.hidden).length;
            return (
              <div key={scope} data-guide={scope === 'platform' ? 'catalog-categories' : undefined}>
                <ScopeSection scope={scope} count={rows.length} note={hidden ? `${hidden} đang ẩn` : undefined}>
                  <DataTable
                    columns={groupColumns}
                    data={rows}
                    getRowId={(r) => r.id}
                    loading={groupsQuery.isLoading}
                    fetching={groupsQuery.isFetching}
                    empty={scope === 'platform' ? 'Chưa có danh mục mặc định' : 'Chưa có danh mục tự tạo. Bấm "Thêm danh mục" để tạo.'}
                  />
                </ScopeSection>
              </div>
            );
          })}
          <section aria-labelledby="variant-attrs" className="grid gap-2" data-guide="catalog-attributes">
            <div>
              <h2 id="variant-attrs" className="text-base font-semibold">
                Thuộc tính biến thể
              </h2>
              <p className="text-sm text-muted-foreground">
                Thứ phân biệt các biến thể, như màu sắc, kích cỡ. Giá trị mới thêm ngay khi tạo hoặc sửa sản phẩm.
              </p>
            </div>
            <div className="rounded-lg border bg-card">
              <DataTable
                columns={attributeColumns}
                data={attributesQuery.data ?? []}
                getRowId={(r) => r.id}
                loading={attributesQuery.isLoading}
                fetching={attributesQuery.isFetching}
                empty="Chưa có thuộc tính biến thể"
              />
            </div>
          </section>
        </TabsContent>
        {showPlatforms &&
          PLATFORM_TABS.map((t) => (
            <TabsContent key={t.platform} value={t.platform}>
              <PlatformCategoryTab platform={t.platform} />
            </TabsContent>
          ))}
      </Tabs>

      <GroupFormDialog
        open={creating}
        group={null}
        onClose={() => setCreating(false)}
        onDone={(message, created) => {
          setCreating(false);
          toast.success(message);
          if (created) navigate(ROUTES.company.catalogCategory(companyId, created.id));
        }}
      />
      <AxisMappingDialog attribute={axisOf} canEdit={canManage && !(axisOf && isPlatform(axisOf))} onClose={() => setAxisOf(null)} />
      <DeleteGroupDialog
        group={moving}
        groups={(groupsQuery.data ?? []).filter((g) => !g.hidden)}
        onClose={() => setMoving(null)}
        onDone={(message) => {
          setMoving(null);
          toast.success(message);
        }}
      />
      <AttributeValuesDialog attribute={valuesOf} onClose={() => setValuesOf(null)} />
      <AttributeFormDialog
        open={Boolean(attributeForm)}
        attribute={attributeForm}
        onClose={() => setAttributeForm(null)}
        onDone={(message) => {
          setAttributeForm(null);
          toast.success(message);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={deleting?.kind === 'group' ? 'Xoá danh mục?' : 'Xoá thuộc tính biến thể?'}
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
