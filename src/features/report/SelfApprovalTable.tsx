import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { SelfApprovedTag } from '@/components/common/SelfApprovedTag';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useReportSelfApprovals, type RangeParams } from '@/api/report.api';
import { problemMessage } from '@/api/problemMessages';
import { docRefPath } from '@/router/routes';
import { formatDateTime } from '@/utils/format';
import type { SelfApproval } from '@/types/report';

/** Tên bảng của lịch sử (`entityType`) → loại chứng từ và kiểu tham chiếu của `docRefPath` */
const ENTITIES: Record<string, { label: string; ref?: string }> = {
  purchase_requests: { label: 'Đề nghị nhập', ref: 'purchase_request' },
  goods_receipts: { label: 'Phiếu nhận', ref: 'goods_receipt' },
  supplier_returns: { label: 'Phiếu trả NCC', ref: 'supplier_return' },
  stock_documents: { label: 'Phiếu kho', ref: 'stock_document' },
  packages: { label: 'Kiện', ref: 'package' },
  config_versions: { label: 'Cấu hình phí, thuế' },
  order_settlements: { label: 'Đối soát' },
  listings: { label: 'Ghép SKU' },
};

function columns(companyId: string): ColumnDef<SelfApproval>[] {
  return [
    {
      id: 'at',
      header: 'Thời điểm',
      meta: { className: 'w-40 whitespace-nowrap' },
      cell: ({ row }) => formatDateTime(row.original.at),
    },
    { id: 'by', header: 'Người làm', cell: ({ row }) => row.original.by?.name ?? '—' },
    {
      id: 'entity',
      header: 'Chứng từ',
      cell: ({ row: { original: r } }) => {
        const entity = ENTITIES[r.entityType];
        const path = entity?.ref ? docRefPath(companyId, { type: entity.ref, id: r.entityId }) : null;
        const label = entity?.label ?? r.entityType;
        return path ? (
          <Link className="text-primary hover:underline" to={path}>
            {label}
          </Link>
        ) : (
          label
        );
      },
    },
    {
      id: 'step',
      header: 'Bước',
      cell: ({ row: { original: r } }) => (
        <span className="flex flex-wrap items-center gap-2">
          <code className="text-xs">{r.action}</code>
          <SelfApprovedTag />
        </span>
      ),
    },
  ];
}

/** Các lần tự duyệt trong khoảng ngày của báo cáo (Documents/25 mục 11, US-CT-10) */
export function SelfApprovalTable({ companyId, range }: { companyId: string; range: RangeParams }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const query = useReportSelfApprovals({ ...range, page, pageSize });

  return (
    <Card className="mt-6 gap-0" data-testid="self-approvals">
      <CardHeader>
        <CardTitle>Lần tự duyệt</CardTitle>
        <p className="text-sm text-muted-foreground">
          CEO, hoặc công ty chỉ có một người, tự làm bước cần người duyệt khác.
        </p>
      </CardHeader>
      <CardContent className="pt-4">
        {query.isError ? (
          <AlertMessage severity="error">{problemMessage(query.error)}</AlertMessage>
        ) : (
          <DataTable
            columns={columns(companyId)}
            data={query.data?.items ?? []}
            getRowId={(r) => `${r.entityId}-${r.at}`}
            loading={query.isLoading}
            fetching={query.isFetching}
            empty="Không có lần tự duyệt nào trong khoảng này"
            pagination={{
              page,
              pageSize,
              total: query.data?.total ?? 0,
              pageSizes: [10, 25, 50],
              onChange: (p, size) => {
                setPage(p);
                setPageSize(size);
              },
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
