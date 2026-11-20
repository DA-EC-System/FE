import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { RowAction } from '@/components/common/RowAction';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useDeleteSpecField, useSpecFields } from '@/api/catalog.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import type { SpecField } from '@/types/catalog';
import { SpecFieldDialog } from './SpecFieldDialog';
import { SPEC_INPUT_LABELS } from './specLabels';

const MAX_CHIPS = 4;

interface SpecFieldsTabProps {
  canManage: boolean;
  /** Mở hộp thêm thông số (nút ở đầu trang) */
  creating: boolean;
  onCloseCreate: () => void;
}

/** Thư viện thông số của công ty (Documents/21 §5.5) */
export function SpecFieldsTab({ canManage, creating, onCloseCreate }: SpecFieldsTabProps) {
  const query = useSpecFields();
  const deleteMut = useDeleteSpecField();
  const [editing, setEditing] = useState<SpecField | null>(null);
  const [deleting, setDeleting] = useState<SpecField | null>(null);

  const handleDelete = async () => {
    if (!deleting) return;
    const { id, version, name } = deleting;
    try {
      await deleteMut.mutateAsync({ id, version });
      toast.success(`Đã xoá ${name}`);
    } catch (e) {
      if (problemCode(e) === 'in_use') {
        const p = getProblem(e) as { groupCount?: number; productCount?: number } | undefined;
        const parts = [
          p?.groupCount ? `${p.groupCount} mẫu nhóm hàng` : null,
          p?.productCount ? `${p.productCount} sản phẩm` : null,
        ].filter(Boolean);
        toast.warning(
          `Không xoá được ${name}: còn ${parts.join(' và ') || 'nơi dùng'}. Bỏ khỏi mẫu nhóm và xoá giá trị ở sản phẩm trước.`,
        );
        void query.refetch();
      } else if (problemCode(e) === 'version_conflict') {
        toast.warning(`${name} vừa được người khác sửa. Chưa có gì thay đổi, hãy thử lại.`);
      } else {
        toast.error(problemMessage(e));
      }
    }
    setDeleting(null);
  };

  const columns = useMemo<ColumnDef<SpecField>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Thông số',
        meta: { className: 'min-w-40' },
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="font-mono text-xs text-muted-foreground">{row.original.code}</div>
          </div>
        ),
      },
      {
        id: 'input',
        header: 'Kiểu nhập',
        meta: { className: 'w-32 whitespace-nowrap' },
        cell: ({ row }) => (
          <>
            {SPEC_INPUT_LABELS[row.original.input]}
            {row.original.unit && <span className="text-muted-foreground"> ({row.original.unit})</span>}
          </>
        ),
      },
      {
        id: 'options',
        header: 'Lựa chọn',
        meta: { className: 'min-w-56' },
        cell: ({ row }) => {
          const opts = [...row.original.options].sort((a, b) => a.position - b.position);
          if (!opts.length) {
            return <span className="text-muted-foreground">{row.original.allowCustom ? 'Chưa có, điền tự do' : 'Nhập tự do'}</span>;
          }
          return (
            <div className="flex flex-wrap items-center gap-1">
              {opts.slice(0, MAX_CHIPS).map((o) => (
                <Badge key={o.id} variant="outline">
                  {o.value}
                </Badge>
              ))}
              {opts.length > MAX_CHIPS && <span className="text-xs text-muted-foreground">+{opts.length - MAX_CHIPS}</span>}
              {row.original.allowCustom && <span className="w-full text-xs text-muted-foreground">Cho thêm giá trị mới</span>}
            </div>
          );
        },
      },
      { accessorKey: 'groupCount', header: 'Nhóm dùng', meta: { className: 'w-24 text-right tabular-nums' } },
      { accessorKey: 'productCount', header: 'Sản phẩm dùng', meta: { className: 'w-28 text-right tabular-nums' } },
      ...(canManage
        ? [
            {
              id: 'actions',
              header: '',
              meta: { className: 'w-24 text-right' },
              cell: ({ row }) => (
                <div className="flex justify-end gap-1">
                  <RowAction label="Sửa" onClick={() => setEditing(row.original)}>
                    <Pencil />
                  </RowAction>
                  <RowAction
                    label="Xoá"
                    destructive
                    reason={
                      row.original.groupCount || row.original.productCount
                        ? `Đang trong ${row.original.groupCount} mẫu nhóm, ${row.original.productCount} sản phẩm đã điền, không xoá được`
                        : null
                    }
                    onClick={() => setDeleting(row.original)}
                  >
                    <Trash2 />
                  </RowAction>
                </div>
              ),
            } satisfies ColumnDef<SpecField>,
          ]
        : []),
    ],
    [canManage],
  );

  return (
    <>
      {query.isError && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(query.error)}
        </AlertMessage>
      )}
      <Card className="py-0">
        <DataTable
          columns={columns}
          data={query.data ?? []}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          fetching={query.isFetching}
          empty="Chưa có thông số"
        />
      </Card>
      <SpecFieldDialog
        open={creating || Boolean(editing)}
        field={editing}
        onClose={() => {
          setEditing(null);
          onCloseCreate();
        }}
        onDone={(message) => {
          setEditing(null);
          onCloseCreate();
          toast.success(message);
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Xoá thông số?"
        message={
          <>
            Bạn sắp xoá <strong>{deleting?.name}</strong> khỏi thư viện. Ánh xạ sang sàn của thông số này cũng bị xoá.
          </>
        }
        confirmLabel="Xoá"
        destructive
        loading={deleteMut.isPending}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
