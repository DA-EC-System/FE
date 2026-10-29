import { Fragment, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnDefTemplate,
  type RowData,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Lớp CSS cho cả ô tiêu đề và ô dữ liệu, vd độ rộng */
    className?: string;
  }
}

export interface ServerPagination {
  /** Bắt đầu từ 1 như `page` của API (C5) */
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number, pageSize: number) => void;
  pageSizes?: number[];
}

interface DataTableProps<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[];
  data: T[];
  getRowId?: (row: T) => string;
  /** Lần tải đầu: hiện dòng giả */
  loading?: boolean;
  /** Đang tải lại (đổi trang, lọc): làm mờ bảng hiện có */
  fetching?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  pagination?: ServerPagination;
  /** Nội dung mở rộng dưới một dòng; trả `null` là dòng đang đóng */
  renderExpanded?: (row: T) => ReactNode;
  /** Lớp CSS thêm cho dòng, vd tô sáng */
  rowClassName?: (row: T) => string | undefined;
}

/** Bảng dữ liệu dùng TanStack Table, phân trang phía server (thay DataGrid của MUI). */
export function DataTable<T>({
  columns,
  data,
  getRowId,
  loading,
  fetching,
  empty = 'Không có dữ liệu',
  onRowClick,
  pagination,
  renderExpanded,
  rowClassName,
}: DataTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });
  const colCount = columns.length;

  return (
    <div>
      <div className={cn('overflow-x-auto transition-opacity', fetching && !loading && 'opacity-60')}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id} className={header.column.columnDef.meta?.className}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading && data.length === 0 ? (
              Array.from({ length: 5 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={colCount}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="h-24 text-center text-muted-foreground">
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => {
                const expanded = renderExpanded?.(row.original);
                return (
                  <Fragment key={row.id}>
                    <TableRow
                      data-row-id={row.id}
                      className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row.original))}
                      onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={cn('whitespace-normal', cell.column.columnDef.meta?.className)}
                        >
                          {renderCell(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                    {expanded && (
                      <TableRow data-expanded-for={row.id} className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={colCount} className="whitespace-normal">
                          {expanded}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      {pagination && <PaginationBar {...pagination} />}
    </div>
  );
}

/**
 * Gọi thẳng hàm `cell` thay vì flexRender: flexRender coi hàm là component, nên khi `columns`
 * tạo lại (vd lưới giá đổi bản nháp) React gắn lại cả ô và ô nhập mất focus sau mỗi phím.
 * Vì vậy hàm `cell` không được dùng hook.
 */
function renderCell<TProps extends object>(cell: ColumnDefTemplate<TProps> | undefined, props: TProps): ReactNode {
  return typeof cell === 'function' ? (cell as (p: TProps) => ReactNode)(props) : cell;
}

function PaginationBar({ page, pageSize, total, onChange, pageSizes = [10, 25, 50] }: ServerPagination) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2 border-t px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Số dòng mỗi trang</span>
        <Select value={String(pageSize)} onValueChange={(v) => onChange(1, Number(v))}>
          <SelectTrigger size="sm" aria-label="Số dòng mỗi trang">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizes.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <span className="text-muted-foreground" data-testid="page-range">
        {first}–{last} / {total}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          aria-label="Trang trước"
          disabled={page <= 1}
          onClick={() => onChange(page - 1, pageSize)}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          aria-label="Trang sau"
          disabled={page >= pageCount}
          onClick={() => onChange(page + 1, pageSize)}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
