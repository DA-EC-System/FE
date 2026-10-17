import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { DateFilter, FilterBar, FilterSelect } from '@/components/common/FilterBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompanyAuditLog, useCompanyAuditLogs } from '@/api/companySettings.api';
import { useStaff } from '@/api/identity.api';
import { getErrorMessage } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/utils/format';
import type { AuditAction, CompanyAuditLog } from '@/types/companySettings';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  auditFieldLabel,
  auditValueText,
  entityTypeLabel,
} from './auditLabels';

const columns: ColumnDef<CompanyAuditLog>[] = [
  {
    id: 'createdAt',
    header: 'Thời điểm',
    meta: { className: 'w-40 whitespace-nowrap' },
    cell: ({ row }) => formatDateTime(row.original.createdAt),
  },
  {
    id: 'actor',
    header: 'Người làm',
    meta: { className: 'min-w-52' },
    cell: ({ row: { original: r } }) => (
      <div className="leading-tight">
        <div>{r.actor.fullName}</div>
        <div className="text-xs text-muted-foreground">{r.actor.email}</div>
      </div>
    ),
  },
  {
    id: 'action',
    header: 'Thao tác',
    meta: { className: 'w-28' },
    cell: ({ row }) => {
      const a = AUDIT_ACTION_LABELS[row.original.action];
      return <Badge variant={a.variant}>{a.label}</Badge>;
    },
  },
  {
    id: 'entityType',
    header: 'Đối tượng',
    meta: { className: 'w-32' },
    cell: ({ row }) => entityTypeLabel(row.original.entityType),
  },
  { accessorKey: 'entityLabel', header: 'Tên', meta: { className: 'min-w-52' } },
];

/** UC-PI-07: nhật ký thao tác của công ty, chỉ đọc. Admin và CEO xem được. */
export function CompanyAuditLogPage() {
  const [actorId, setActorId] = useState('');
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState<AuditAction | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Lọc theo người: chọn trong danh sách nhân viên (Admin và CEO đều xem được nhân viên)
  const staffQuery = useStaff({ pageSize: 100 });
  const query = useCompanyAuditLogs({
    page,
    pageSize,
    actorId: actorId || undefined,
    entityType: entityType || undefined,
    action: action || undefined,
    from: from || undefined,
    to: to || undefined,
  });

  const withReset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };
  const hasFilter = Boolean(actorId || entityType || action || from || to);

  return (
    <div>
      <PageHeader
        title="Nhật ký thao tác"
        subtitle="Mọi thao tác thêm, sửa, xoá trong công ty. Nhật ký chỉ xem, không ai sửa hay xoá được."
      />

      {query.isError && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(query.error)}
        </AlertMessage>
      )}

      <Card className="gap-0 py-0">
        <FilterBar>
          <FilterSelect
            label="Người làm"
            value={actorId}
            onChange={withReset(setActorId)}
            className="w-56"
            options={(staffQuery.data?.items ?? []).map((s) => ({
              value: s.accountId,
              label: `${s.fullName} (${s.email})`,
            }))}
          />
          <FilterSelect
            label="Đối tượng"
            value={entityType}
            onChange={withReset(setEntityType)}
            options={Object.entries(AUDIT_ENTITY_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <FilterSelect
            label="Thao tác"
            value={action}
            onChange={withReset((v: string) => setAction(v as AuditAction | ''))}
            options={Object.entries(AUDIT_ACTION_LABELS).map(([value, { label }]) => ({ value, label }))}
          />
          <DateFilter label="Từ ngày" value={from} onChange={withReset(setFrom)} max={to || undefined} />
          <DateFilter label="Đến ngày" value={to} onChange={withReset(setTo)} min={from || undefined} />
          {hasFilter && (
            <Button
              variant="ghost"
              onClick={() => {
                setActorId('');
                setEntityType('');
                setAction('');
                setFrom('');
                setTo('');
                setPage(1);
              }}
            >
              Xoá lọc
            </Button>
          )}
        </FilterBar>
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          fetching={query.isFetching}
          onRowClick={(r) => setSelectedId(r.id)}
          empty={hasFilter ? 'Không có dòng nào khớp bộ lọc' : 'Chưa có thao tác nào'}
          pagination={{
            page,
            pageSize,
            total: query.data?.total ?? 0,
            onChange: (p, size) => {
              setPage(p);
              setPageSize(size);
            },
          }}
        />
      </Card>

      <AuditLogDetailDialog id={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

/** UC-PI-07 bước 4: giá trị trước và sau của một dòng */
function AuditLogDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const query = useCompanyAuditLog(id);
  const log = query.data;
  const fields = log
    ? [...new Set([...Object.keys(log.before ?? {}), ...Object.keys(log.after ?? {})])]
    : [];

  return (
    <Dialog open={Boolean(id)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Chi tiết thao tác</DialogTitle>
          {log && (
            <DialogDescription>
              {log.actor.fullName} ({log.actor.email}) lúc {formatDateTime(log.createdAt)}
            </DialogDescription>
          )}
        </DialogHeader>
        {query.isError && <AlertMessage severity="error">{problemMessage(query.error)}</AlertMessage>}
        {query.isLoading && <Skeleton className="h-48" />}
        {log && (
          <div className="grid min-w-0 gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={AUDIT_ACTION_LABELS[log.action].variant}>
                {AUDIT_ACTION_LABELS[log.action].label}
              </Badge>
              <span className="font-medium">
                {entityTypeLabel(log.entityType)}: {log.entityLabel}
              </span>
            </div>
            <div className="max-h-[55vh] overflow-auto rounded-md border">
              <Table className="table-fixed" data-testid="audit-diff">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-1/4">Trường</TableHead>
                    <TableHead>Trước</TableHead>
                    <TableHead>Sau</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((f) => {
                    const before = log.before ? auditValueText(log.before[f]) : '—';
                    const after = log.after ? auditValueText(log.after[f]) : '—';
                    const changed = before !== after;
                    return (
                      <TableRow
                        key={f}
                        data-changed={changed || undefined}
                        className={cn(changed && 'bg-muted/60')}
                      >
                        <TableCell className="font-medium whitespace-normal">{auditFieldLabel(f)}</TableCell>
                        <TableCell className="break-words whitespace-pre-wrap">{before}</TableCell>
                        <TableCell
                          className={cn('break-words whitespace-pre-wrap', changed && 'font-semibold')}
                        >
                          {after}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
