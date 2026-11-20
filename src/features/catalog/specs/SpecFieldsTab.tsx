import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Link2, Pencil, Trash2 } from 'lucide-react';
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
import { useSpecMappings } from '@/api/channelSpecMappings.api';
import { PLATFORM_TABS } from '../platformCategory';
import { SpecFieldDialog } from './SpecFieldDialog';
import { SpecMappingDialog } from './SpecMappingDialog';
import { SPEC_INPUT_LABELS } from './specLabels';

const MAX_CHIPS = 4;

/** Một dòng mỗi sàn trong ô "Ánh xạ sàn": mã ưu tiên nhất, hoặc gợi ý chưa lưu, hoặc chưa ánh xạ */
function MappingCell({ fieldId }: { fieldId: string }) {
  return (
    <div className="grid gap-1">
      {PLATFORM_TABS.map((t) => (
        <PlatformMappingLine key={t.platform} platform={t.platform} label={t.label} fieldId={fieldId} />
      ))}
    </div>
  );
}

function PlatformMappingLine({ platform, label, fieldId }: { platform: string; label: string; fieldId: string }) {
  const query = useSpecMappings(platform);
  const row = query.data?.find((m) => m.fieldId === fieldId);
  const codes = [...(row?.codes ?? [])].sort((a, b) => a.priority - b.priority);
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
      {query.isLoading ? (
        <span className="text-muted-foreground">…</span>
      ) : query.isError ? (
        <span className="text-xs text-muted-foreground">Không tải được</span>
      ) : codes.length ? (
        <>
          <Badge variant="secondary">{codes[0].attributeLabel}</Badge>
          {codes.length > 1 && <span className="text-xs text-muted-foreground">+{codes.length - 1} mã</span>}
        </>
      ) : row?.suggestions.length ? (
        <span className="text-xs text-foreground-2">Có gợi ý, chưa lưu</span>
      ) : (
        <span className="text-xs text-muted-foreground">Chưa ánh xạ</span>
      )}
    </div>
  );
}

interface SpecFieldsTabProps {
  canManage: boolean;
  /** Công ty bật kênh bán và người dùng xem được gian hàng: hiện cột và hộp ánh xạ sàn */
  showMapping: boolean;
  /** Mở hộp thêm thông số (nút ở đầu trang) */
  creating: boolean;
  onCloseCreate: () => void;
}

/** Thư viện thông số của công ty (Documents/21 §5.5) */
export function SpecFieldsTab({ canManage, showMapping, creating, onCloseCreate }: SpecFieldsTabProps) {
  const query = useSpecFields();
  const deleteMut = useDeleteSpecField();
  const [editing, setEditing] = useState<SpecField | null>(null);
  const [deleting, setDeleting] = useState<SpecField | null>(null);
  const [mapping, setMapping] = useState<SpecField | null>(null);

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
      ...(showMapping
        ? [
            {
              id: 'mapping',
              header: 'Ánh xạ sàn',
              meta: { className: 'min-w-52' },
              cell: ({ row }) => (
                <button
                  type="button"
                  className="w-full cursor-pointer rounded-md text-left hover:bg-muted"
                  aria-label={`Ánh xạ ${row.original.name} sang sàn`}
                  onClick={() => setMapping(row.original)}
                >
                  <MappingCell fieldId={row.original.id} />
                </button>
              ),
            } satisfies ColumnDef<SpecField>,
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
                  {showMapping && (
                    <RowAction label="Ánh xạ sàn" onClick={() => setMapping(row.original)}>
                      <Link2 />
                    </RowAction>
                  )}
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
    [canManage, showMapping],
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
      <SpecMappingDialog field={mapping} canEdit={canManage} onClose={() => setMapping(null)} />
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
