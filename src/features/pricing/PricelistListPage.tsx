import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Eye, Pencil, Plus, TextCursorInput, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { RowAction } from '@/components/common/RowAction';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDeletePricelist, usePricelists } from '@/api/pricing.api';
import { useShops } from '@/api/shops.api';
import { getErrorMessage } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan, useModuleEnabled } from '@/hooks/usePermission';
import { platformLabel } from '@/features/channel/shopSchemas';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import type { Pricelist } from '@/types/pricing';
import { CreatePricelistDialog, RenamePricelistDialog } from './PricelistFormDialog';

/** UC-CP-03 bước 1–3: bảng giá chuẩn và bảng giá theo gian hàng của công ty (QT-12) */
export function PricelistListPage() {
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const can = useCan();
  const canManage = can(PERMISSIONS.pricelistManage);
  // Bảng giá theo kênh cần phân hệ Kênh bán và quyền xem gian hàng để chọn gian hàng (AC-G3)
  const channelOn = useModuleEnabled('channel');
  const canSeeShops = can(PERMISSIONS.shopView);
  const canPickShop = canManage && channelOn && canSeeShops;

  const listQuery = usePricelists();
  const shopsQuery = useShops({ enabled: canPickShop });
  const deleteMut = useDeletePricelist();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Pricelist | null>(null);
  const [deleting, setDeleting] = useState<Pricelist | null>(null);

  const pricelists = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  // Chỉ gian hàng còn kết nối và chưa có bảng giá
  const freeShops = useMemo(() => {
    const taken = new Set(pricelists.map((p) => p.shop?.id).filter(Boolean));
    return (canPickShop ? (shopsQuery.data?.items ?? []) : []).filter(
      (s) => s.status !== 'disconnected' && !taken.has(s.id),
    );
  }, [pricelists, shopsQuery.data, canPickShop]);

  const open = (id: string) => navigate(ROUTES.company.pricelist(companyId, id));

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMut.mutateAsync({ id: deleting.id, version: deleting.version });
      toast.success(`Đã xoá ${deleting.name}`);
    } catch (e) {
      const code = problemCode(e);
      if (code === 'in_use') {
        toast.warning(
          `Không xoá được ${deleting.name}: gian hàng ${deleting.shop?.shopName ?? ''} còn kết nối và đơn của gian hàng đang lấy giá trong bảng này. Ngắt gian hàng trước khi xoá.`,
        );
      } else if (code === 'version_conflict') {
        toast.warning(`${deleting.name} vừa được người khác sửa. Chưa có gì thay đổi, hãy thử lại.`);
      } else {
        toast.error(problemMessage(e));
      }
    }
    setDeleting(null);
  };

  const columns = useMemo<ColumnDef<Pricelist>[]>(
    () => [
      { accessorKey: 'name', header: 'Bảng giá', meta: { className: 'min-w-48 font-medium' } },
      {
        id: 'type',
        header: 'Loại',
        meta: { className: 'w-36' },
        cell: ({ row }) =>
          row.original.type === 'standard' ? (
            <Badge>Chuẩn</Badge>
          ) : (
            <Badge variant="secondary">Theo gian hàng</Badge>
          ),
      },
      {
        id: 'shop',
        header: 'Gian hàng',
        meta: { className: 'min-w-48' },
        cell: ({ row }) => {
          const p = row.original;
          if (p.type === 'standard') {
            return <span className="text-muted-foreground">Mặc định cho mọi đơn</span>;
          }
          return p.shop ? (
            `${p.shop.shopName} · ${platformLabel(p.shop.platform, p.shop.platformName)}`
          ) : (
            <span className="text-muted-foreground">Gian hàng đã xoá</span>
          );
        },
      },
      {
        id: 'priced',
        header: 'Đã gán giá',
        meta: { className: 'w-44' },
        cell: ({ row }) => {
          const p = row.original;
          const percent = p.variantCount ? (p.pricedCount / p.variantCount) * 100 : 0;
          return (
            <div className="grid gap-1" data-testid="priced-count">
              <span>
                {p.pricedCount} / {p.variantCount} biến thể
              </span>
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
              </div>
            </div>
          );
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
        meta: { className: 'w-32 text-right' },
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex justify-end gap-1">
              <RowAction label={canManage ? 'Sửa giá' : 'Xem giá'} onClick={() => open(p.id)}>
                {canManage ? <Pencil /> : <Eye />}
              </RowAction>
              {canManage && (
                <RowAction label="Đổi tên" onClick={() => setRenaming(p)}>
                  <TextCursorInput />
                </RowAction>
              )}
              {/* Bảng giá chuẩn không xoá được (AC-G2) */}
              {canManage && p.type === 'channel' && (
                <RowAction label="Xoá" destructive onClick={() => setDeleting(p)}>
                  <Trash2 />
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

  const createBlocked = !canManage
    ? null
    : !channelOn
      ? 'Công ty chưa bật phân hệ Kênh bán nên chỉ có bảng giá chuẩn.'
      : !canSeeShops
        ? 'Bạn cần quyền xem gian hàng để tạo bảng giá theo gian hàng.'
        : null;

  return (
    <div>
      <PageHeader
        title="Bảng giá"
        subtitle="Bảng giá chuẩn áp dụng mặc định; đơn từ gian hàng có bảng giá riêng lấy giá trong bảng đó."
        action={
          canPickShop ? (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              Tạo bảng giá
            </Button>
          ) : undefined
        }
      />

      {listQuery.isError && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(listQuery.error)}
        </AlertMessage>
      )}
      {createBlocked && (
        <AlertMessage severity="info" className="mb-4">
          {createBlocked}
        </AlertMessage>
      )}

      <Card className="gap-0 py-0">
        <DataTable
          columns={columns}
          data={pricelists}
          getRowId={(r) => r.id}
          loading={listQuery.isLoading}
          fetching={listQuery.isFetching}
          empty="Chưa có bảng giá"
          onRowClick={(r) => open(r.id)}
        />
      </Card>

      <CreatePricelistDialog
        open={creating}
        shops={freeShops}
        onClose={() => setCreating(false)}
        onDone={(created) => {
          setCreating(false);
          toast.success(`Đã tạo ${created.name}`);
          navigate(ROUTES.company.pricelist(companyId, created.id));
        }}
      />
      <RenamePricelistDialog
        pricelist={renaming}
        onClose={() => setRenaming(null)}
        onDone={(message) => {
          setRenaming(null);
          toast.success(message);
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Xoá bảng giá?"
        message={
          <>
            Xoá <strong>{deleting?.name}</strong>. Đơn từ gian hàng {deleting?.shop?.shopName} sẽ lấy giá
            chuẩn. Gian hàng còn kết nối thì không xoá được.
          </>
        }
        confirmLabel="Xoá"
        destructive
        loading={deleteMut.isPending}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
