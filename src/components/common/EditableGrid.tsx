import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { Check, Loader2, Lock, LockOpen, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '@/api/client';
import { cn } from '@/lib/utils';
import { EmptyState } from './EmptyState';
import { HeaderLabel, PaginationBar, type ServerPagination } from './DataTable';
import { cellKey, statusReducer, type CellStatus } from './editableGrid/cellStatus';
import { afterCommit, editKeyAction, idleKeyAction, isToggleLock, type CellPos } from './editableGrid/gridKeys';
import { readLocked, writeLocked } from './editableGrid/gridLock';
import { RowSaveQueue, type SaveResult } from './editableGrid/rowSaveQueue';

export type { SaveResult } from './editableGrid/rowSaveQueue';

/** Đọc chữ trong ô thành giá trị gửi đi; sai thì không gửi, ô giữ chế độ sửa */
export type ParseResult = { ok: true; value: unknown } | { ok: false; error: string };

export interface GridColumn<T> {
  id: string;
  header: string;
  /** Tên ô cho trình đọc màn hình, ghép với nhãn dòng: "Giá chuẩn SP00008-123-100G". Mặc định là `header` */
  label?: string;
  /** Nội dung tiêu đề thay cho chữ `header`, vd ô chọn mọi dòng */
  headerContent?: ReactNode;
  help?: ReactNode;
  className?: string;
  numeric?: boolean;
  /** Cột định danh: dính bên trái khi cuộn ngang */
  sticky?: boolean;
  testId?: string;
  /**
   * Ô có ô nhập riêng (vd thông tin sản phẩm mới trên đề nghị nhập hàng): ô nhập trong ô vẫn nhận Tab, Enter trên ô đưa
   * focus vào ô nhập đầu tiên
   */
  interactive?: boolean;
  /** Nội dung ô khi không sửa */
  render: (row: T) => ReactNode;
  edit?: {
    /** Chữ đặt sẵn trong ô sửa (giá trị đang lưu) */
    raw: (row: T) => string;
    parse: (raw: string) => ParseResult;
    /** Dòng này không sửa được ô này; chuỗi là lý do (hiện khi rê chuột) */
    readOnly?: (row: T) => boolean | string;
    /** Phần thêm dưới giá trị, vd chip gợi ý. `save` lưu ngay một chữ như khi gõ rồi Enter */
    extra?: (row: T, ctx: { locked: boolean; save: (raw: string) => void }) => ReactNode;
  };
}

export interface EditableGridApi {
  /** Mở khoá, chọn ô, cuộn tới; `edit` mở luôn ô sửa */
  focusCell: (rowId: string, columnId: string, options?: { edit?: boolean }) => void;
  /** Lưu một chữ vào ô như người dùng gõ rồi Enter (qua hàng đợi của dòng) */
  saveCell: (rowId: string, columnId: string, raw: string) => void;
  /** Báo lỗi từ một lần lưu bên ngoài bảng, vd áp gợi ý cho nhiều dòng */
  setCellError: (rowId: string, columnId: string, message: string, draft: string, conflict?: boolean) => void;
  markSaved: (rowId: string, columnId: string) => void;
  /**
   * Ô đầu tiên (theo thứ tự dòng, cột) còn chữ chưa lưu được: ô sửa đang mở báo lỗi, hoặc ô báo lỗi giữ chữ đã gõ.
   * Trang ghi ô vào form (không gọi API theo ô) dựa vào đây để chặn Lưu cả phiếu khi chữ sai chưa vào form (FE#476)
   */
  firstInvalid: () => { rowId: string; columnId: string; message: string } | null;
}

interface EditableGridProps<T, V> {
  /** Khoá nhớ trạng thái khoá sửa trong localStorage */
  gridId: string;
  'aria-label': string;
  columns: GridColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  /** Nhãn dòng ghép vào tên ô, thường là mã SKU */
  rowLabel: (row: T) => string;
  getVersion: (row: T) => V;
  /** Gửi một ô; trả version mới để lượt sau cùng dòng dùng. Không ném lỗi thì tốt; ném thì ô hiện câu lỗi chung */
  save: (row: T, columnId: string, value: unknown, version: V) => Promise<SaveResult<V>>;
  /**
   * Lỗi từ ngoài bảng của một ô, vd kiểm form khi bấm Lưu cả phiếu. Hiện khi ô không có trạng thái lưu riêng; nối qua
   * aria-describedby như lỗi lưu ô
   */
  cellError?: (row: T, columnId: string) => string | undefined;
  /** Nạp lại một dòng sau xung đột version */
  reloadRow?: (row: T) => Promise<void>;
  /** Không có quyền sửa: không hiện nút khoá, bảng luôn chỉ đọc */
  canEdit: boolean;
  /** Hành động phụ trên thanh công cụ */
  actions?: ReactNode;
  selectedCount?: number;
  isRowSelected?: (row: T) => boolean;
  rowClassName?: (row: T) => string | undefined;
  loading?: boolean;
  fetching?: boolean;
  empty?: ReactNode;
  pagination?: ServerPagination;
  onBusyChange?: (busy: boolean) => void;
  /** Có hay hết ô còn chữ chưa lưu được (xem `firstInvalid`): trang tính là còn thay đổi để hỏi trước khi rời */
  onInvalidChange?: (invalid: boolean) => void;
  apiRef?: Ref<EditableGridApi>;
  /** Chiều cao tối đa vùng cuộn, đầu bảng dính trong vùng này */
  maxHeightClass?: string;
}

interface Editing {
  rowId: string;
  columnId: string;
  value: string;
  error?: string;
  /** Mở bằng gõ đè: đặt con trỏ cuối thay vì chọn hết */
  typed: boolean;
}

const SAVED_MS = 1200;
const INNER_FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([role="gridcell"])';

/**
 * Bảng sửa trực tiếp từng ô có khoá (FE#475, kiểu Next Engine). Ô hiện chữ; mở sửa bằng bấm đúp, Enter, F2 hoặc gõ đè;
 * lưu ngay từng ô qua hàng đợi theo dòng. Mặc định khoá. Lỗi theo ô chỉ nối qua aria-describedby, không role="alert".
 */
export function EditableGrid<T, V>(props: EditableGridProps<T, V>) {
  const {
    gridId,
    columns,
    rows,
    getRowId,
    rowLabel,
    canEdit,
    actions,
    selectedCount,
    isRowSelected,
    rowClassName,
    loading,
    fetching,
    empty = 'Không có dữ liệu',
    pagination,
    apiRef,
    maxHeightClass = 'max-h-[70vh]',
  } = props;
  const latest = useRef(props);
  latest.current = props;

  const [lockedPref, setLockedPref] = useState(() => readLocked(gridId));
  const locked = !canEdit || lockedPref;
  const [active, setActive] = useState<CellPos>({ row: 0, col: 0 });
  const [editing, setEditingState] = useState<Editing | null>(null);
  const editingRef = useRef<Editing | null>(null);
  const setEditing = (next: Editing | null) => {
    editingRef.current = next;
    setEditingState(next);
  };
  const [statuses, dispatch] = useReducer(statusReducer, {});
  const statusesRef = useRef(statuses);
  statusesRef.current = statuses;
  const [announce, setAnnounce] = useState('');
  const tableRef = useRef<HTMLTableElement>(null);
  const pendingFocus = useRef(false);

  const [queue] = useState(
    () =>
      new RowSaveQueue<V>((busy) => {
        latest.current.onBusyChange?.(busy);
      }),
  );

  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  // Luôn tìm theo id trên danh sách mới nhất: lượt lưu chạy sau một lần await, lúc đó bảng có thể đã đổi trang, đổi bộ
  // lọc hay tải lại làm dòng xê dịch, chỉ số dòng của lần vẽ cũ trỏ sang SKU khác
  const indexOfRow = (rowId: string) => rowsRef.current.findIndex((r) => latest.current.getRowId(r) === rowId);
  const findRow = (rowId: string): T | undefined => rowsRef.current[indexOfRow(rowId)];
  const colIndex = (columnId: string) => columns.findIndex((c) => c.id === columnId);

  // Dữ liệu đổi (đổi trang, lọc) thì giữ ô chọn trong bảng
  const rowCount = rows.length;
  const colCount = columns.length;
  const pos = { row: Math.min(active.row, Math.max(0, rowCount - 1)), col: Math.min(active.col, Math.max(0, colCount - 1)) };

  const readOnlyReason = (row: T, col: GridColumn<T>): boolean | string => (col.edit ? (col.edit.readOnly?.(row) ?? false) : true);
  const statusOf = (rowId: string, columnId: string): CellStatus | undefined => statuses[cellKey(rowId, columnId)];
  const isEditable = (row: T | undefined, col: GridColumn<T> | undefined) => {
    if (!row || !col?.edit || locked || readOnlyReason(row, col)) return false;
    // Ô xung đột phải tải lại dòng trước, sửa tiếp thì lại vấp version cũ
    const st = statusOf(getRowId(row), col.id);
    return !(st?.kind === 'error' && st.conflict);
  };

  const cellEl = (p: CellPos) => tableRef.current?.querySelector<HTMLElement>(`[data-cell="${p.row}:${p.col}"]`) ?? null;

  const moveTo = (p: CellPos) => {
    pendingFocus.current = true;
    setActive(p);
  };

  // Đưa focus tới ô chọn (hoặc ô sửa) sau khi vẽ lại
  useLayoutEffect(() => {
    if (!pendingFocus.current || editing) return;
    pendingFocus.current = false;
    const el = cellEl(pos);
    el?.focus();
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  });

  // Nút, link, ô chọn trong ô không nhận Tab: Tab vào bảng một lần (roving tabindex), Enter trên ô mới bấm tới
  useLayoutEffect(() => {
    tableRef.current?.querySelectorAll<HTMLElement>(`tbody [role="gridcell"]:not([data-interactive]) :is(${INNER_FOCUSABLE})`).forEach((el) => {
      if (!el.hasAttribute('data-grid-editor')) el.tabIndex = -1;
    });
  });

  const toggleLock = useCallback(
    (next?: boolean) => {
      if (!latest.current.canEdit) return;
      setLockedPref((prev) => {
        const value = next ?? !prev;
        writeLocked(gridId, value);
        return value;
      });
    },
    [gridId],
  );

  const runSave = (rowId: string, col: GridColumn<T>, value: unknown, draft: string) => {
    // Bản chụp của chính dòng này lúc xếp lượt: dòng đã rời bảng (đổi trang, lọc) vẫn gửi đúng SKU
    const snapshot = findRow(rowId);
    if (!snapshot) return;
    dispatch({ type: 'saving', rowId, columnId: col.id, draft });
    const label = `${col.label ?? col.header} ${latest.current.rowLabel(snapshot)}`;
    queue
      .run(
        rowId,
        () => latest.current.getVersion(findRow(rowId) ?? snapshot),
        (version) => latest.current.save(findRow(rowId) ?? snapshot, col.id, value, version),
      )
      .then(
        (result) => {
          if (result.ok) {
            dispatch({ type: 'saved', rowId, columnId: col.id });
            setAnnounce(`Đã lưu ${label}`);
            window.setTimeout(() => dispatch({ type: 'expire', rowId, columnId: col.id }), SAVED_MS);
          } else {
            dispatch({ type: 'error', rowId, columnId: col.id, message: result.error, draft, conflict: result.conflict });
          }
        },
        (e: unknown) => dispatch({ type: 'error', rowId, columnId: col.id, message: getErrorMessage(e), draft }),
      );
  };

  /** Lưu chữ `raw` vào ô; chữ sai thì báo lỗi ở ô, không gửi. Trả false khi chữ sai */
  const submitRaw = (rowId: string, col: GridColumn<T>, raw: string): boolean | string => {
    const row = findRow(rowId);
    if (!row || !col.edit) return true;
    const parsed = col.edit.parse(raw);
    if (!parsed.ok) return parsed.error;
    const before = col.edit.parse(col.edit.raw(row));
    const unchanged = before.ok && JSON.stringify(before.value) === JSON.stringify(parsed.value);
    if (unchanged) dispatch({ type: 'clear', rowId, columnId: col.id });
    else runSave(rowId, col, parsed.value, raw);
    return true;
  };

  const openEditor = (p: CellPos, initial: string | null) => {
    const row = rows[p.row];
    const col = columns[p.col];
    if (!row || !col?.edit || !isEditable(row, col)) return;
    const rowId = getRowId(row);
    const st = statusOf(rowId, col.id);
    const current = st && st.kind !== 'saved' ? st.draft : col.edit.raw(row);
    setActive(p);
    setEditing({ rowId, columnId: col.id, value: initial ?? current, typed: initial !== null });
  };

  const commit = (then: 'down' | 'right' | 'left' | 'stay' | 'blur') => {
    const ed = editingRef.current;
    if (!ed) return;
    const c = colIndex(ed.columnId);
    const col = columns[c];
    const result = submitRaw(ed.rowId, col, ed.value);
    if (result !== true) {
      if (then === 'blur') {
        // Rời ô với chữ sai: không gửi, giữ chữ và câu lỗi trên ô để sửa tiếp
        setEditing(null);
        dispatch({ type: 'error', rowId: ed.rowId, columnId: ed.columnId, message: String(result), draft: ed.value });
      } else {
        setEditing({ ...ed, error: String(result) });
      }
      return;
    }
    setEditing(null);
    if (then === 'blur') return;
    const i = indexOfRow(ed.rowId);
    moveTo(afterCommit({ row: i < 0 ? pos.row : i, col: c }, then, rowCount, colCount));
  };

  const cancel = () => {
    setEditing(null);
    moveTo(pos);
  };

  const activateInner = (p: CellPos) => {
    const cell = cellEl(p);
    if (!cell) return;
    const el =
      cell.querySelector<HTMLElement>('[data-grid-reload]') ??
      Array.from(cell.querySelectorAll<HTMLElement>(INNER_FOCUSABLE)).find(
        (x) => !(x as HTMLButtonElement).disabled && x.getAttribute('aria-disabled') !== 'true',
      );
    if (!el) return;
    if (el.matches('input, textarea, select')) {
      el.focus();
    } else if (el.getAttribute('aria-haspopup')) {
      // Menu của Radix mở bằng phím trên nút: chuyển focus vào nút rồi gửi Enter
      el.focus();
      el.dispatchEvent(new globalThis.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    } else {
      el.click();
    }
  };

  const onWrapperKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!isToggleLock(e)) return;
    e.preventDefault();
    if (editingRef.current) {
      // Như rời ô: chữ đúng thì lưu, chữ sai thì đóng ô sửa, giữ chữ và câu lỗi trên ô, không gửi. Không để ô sửa mở khi bảng khoá
      commit('blur');
      moveTo(pos);
    }
    toggleLock();
  };

  const onGridKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    if (editingRef.current || isToggleLock(e)) return;
    const target = e.target as HTMLElement;
    if (target.getAttribute('role') !== 'gridcell') {
      // Đang ở nút trong ô: Esc quay về ô
      if (e.key === 'Escape') {
        const cell = target.closest<HTMLElement>('[role="gridcell"]');
        if (cell) {
          e.preventDefault();
          cell.focus();
        }
      }
      return;
    }
    const action = idleKeyAction(e, { pos, rows: rowCount, cols: colCount, editable: isEditable(rows[pos.row], columns[pos.col]) });
    if (action.type === 'none') return;
    e.preventDefault();
    if (action.type === 'move') moveTo(action.to);
    else if (action.type === 'edit') openEditor(pos, action.initial);
    else if (action.type === 'activate') activateInner(pos);
  };

  const reload = async (rowId: string, columnId: string) => {
    const row = findRow(rowId);
    const reloadRow = latest.current.reloadRow;
    const st = statusOf(rowId, columnId);
    if (!row || !reloadRow) return;
    try {
      await reloadRow(row);
    } catch (e) {
      dispatch({ type: 'error', rowId, columnId, message: getErrorMessage(e), draft: st && st.kind !== 'saved' ? st.draft : '', conflict: true });
      return;
    }
    dispatch({ type: 'clearRow', rowId });
    // Mở lại ô với số đã gõ để lưu lại bằng version mới; tải lại có thể làm dòng đổi chỗ nên tìm lại theo id
    const draft = st && st.kind !== 'saved' ? st.draft : null;
    const r = indexOfRow(rowId);
    const c = colIndex(columnId);
    if (r < 0 || c < 0) return;
    const col = columns[c];
    setActive({ row: r, col: c });
    if (col.edit && draft !== null && !locked) setEditing({ rowId, columnId, value: draft, typed: true });
    else moveTo({ row: r, col: c });
  };

  /** Ô còn chữ chưa lưu được; ô sửa đang mở có lỗi tính trước. Đọc ref nên đúng cả ngay sau khi ô sửa vừa rời */
  const firstInvalid = () => {
    const ed = editingRef.current;
    if (ed?.error) return { rowId: ed.rowId, columnId: ed.columnId, message: ed.error };
    for (const row of rowsRef.current) {
      const rowId = latest.current.getRowId(row);
      for (const col of columns) {
        const st = statusesRef.current[cellKey(rowId, col.id)];
        if (st?.kind === 'error') return { rowId, columnId: col.id, message: st.message };
      }
    }
    return null;
  };
  // Chỉ tính dòng còn trên bảng: dòng bị bỏ (vd Bỏ dòng ở đề nghị) mang theo ô lỗi thì không còn gì để sửa
  const invalid =
    Boolean(editing?.error) ||
    rows.some((row) => {
      const rowId = getRowId(row);
      return columns.some((col) => statuses[cellKey(rowId, col.id)]?.kind === 'error');
    });
  useEffect(() => {
    latest.current.onInvalidChange?.(invalid);
  }, [invalid]);

  useImperativeHandle(apiRef, () => ({
    focusCell: (rowId, columnId, options) => {
      const r = indexOfRow(rowId);
      const c = colIndex(columnId);
      if (r < 0 || c < 0) return;
      const row = rowsRef.current[r];
      const col = columns[c];
      const canOpen = options?.edit && latest.current.canEdit && col.edit && !readOnlyReason(row, col);
      if (canOpen) {
        // Chỉ mở khoá trong phiên này; lần sau vào trang vẫn theo lựa chọn đã nhớ (mặc định khoá)
        setLockedPref(false);
        setActive({ row: r, col: c });
        // Ô đang báo lỗi: mở lại với chữ đã gõ và câu lỗi, không lấy số cũ đè lên
        const st = statusOf(rowId, columnId);
        const draft = st && st.kind !== 'saved' ? st.draft : null;
        setEditing({
          rowId,
          columnId,
          value: draft ?? col.edit!.raw(row),
          typed: draft !== null,
          error: st?.kind === 'error' ? st.message : undefined,
        });
        window.requestAnimationFrame(() => cellEl({ row: r, col: c })?.scrollIntoView?.({ block: 'center', inline: 'nearest' }));
      } else {
        moveTo({ row: r, col: c });
      }
    },
    saveCell: (rowId, columnId, raw) => {
      const col = columns[colIndex(columnId)];
      if (!col) return;
      const result = submitRaw(rowId, col, raw);
      if (result !== true) dispatch({ type: 'error', rowId, columnId, message: String(result), draft: raw });
    },
    setCellError: (rowId, columnId, message, draft, conflict) =>
      dispatch({ type: 'error', rowId, columnId, message, draft, conflict }),
    markSaved: (rowId, columnId) => {
      dispatch({ type: 'saved', rowId, columnId });
      window.setTimeout(() => dispatch({ type: 'expire', rowId, columnId }), SAVED_MS);
    },
    firstInvalid,
  }));

  // TanStack lo mô hình dòng và tiêu đề; ô tự vẽ để điều khiển focus, chế độ sửa
  const tableColumns = useMemo<ColumnDef<T>[]>(() => columns.map((c) => ({ id: c.id, header: c.header })), [columns]);
  const table = useReactTable({ data: rows, columns: tableColumns, getRowId: (r) => getRowId(r), getCoreRowModel: getCoreRowModel(), manualPagination: true });

  const lockId = `${gridId}-lock-state`;

  return (
    <div onKeyDown={onWrapperKeyDown}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2" data-testid="grid-toolbar">
        {canEdit && (
          <>
            <Button
              type="button"
              variant={locked ? 'outline' : 'secondary'}
              size="sm"
              aria-pressed={locked}
              aria-keyshortcuts="Control+E"
              aria-describedby={lockId}
              onClick={() => toggleLock()}
            >
              {locked ? <Lock /> : <LockOpen />}
              Khoá sửa
            </Button>
            <span id={lockId} className="text-xs text-muted-foreground" data-testid="grid-lock-state">
              {locked ? 'Đang khoá. Bấm nút hoặc Ctrl+E để sửa.' : 'Đang cho sửa: bấm đúp, Enter hoặc gõ vào ô; Enter lưu, Esc huỷ.'}
            </span>
          </>
        )}
        {selectedCount ? <span className="text-sm text-muted-foreground">Đã chọn {selectedCount} dòng</span> : null}
        {actions && <div className="flex flex-wrap items-center gap-2 md:ml-auto">{actions}</div>}
      </div>
      <div className={cn('overflow-auto transition-opacity', maxHeightClass, fetching && !loading && 'opacity-60')}>
        <table
          ref={tableRef}
          role="grid"
          aria-label={props['aria-label']}
          aria-rowcount={pagination ? pagination.total + 1 : rowCount + 1}
          className="w-full caption-bottom border-separate border-spacing-0 text-sm"
          onKeyDown={onGridKeyDown}
        >
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header, c) => {
                  const col = columns[c];
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      className={cn(
                        'sticky top-0 z-20 h-9 border-b bg-table-head px-2 text-start align-middle text-xs font-medium whitespace-nowrap text-muted-foreground',
                        col.numeric && 'text-end',
                        col.sticky && 'left-0 z-30',
                        col.className,
                      )}
                    >
                      {col.headerContent ?? (
                        <HeaderLabel help={col.help} topic={col.header}>
                          {col.header}
                        </HeaderLabel>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading && rowCount === 0 ? (
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i}>
                  <td colSpan={colCount} className="border-b px-2 py-1.5">
                    <Skeleton className="h-6 w-full" />
                  </td>
                </tr>
              ))
            ) : rowCount === 0 ? (
              <tr>
                <td colSpan={colCount} className="border-b px-2 py-2 text-center">
                  {typeof empty === 'string' ? <EmptyState title={empty} compact /> : empty}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((tableRow, r) => {
                const row = tableRow.original;
                const rowId = tableRow.id;
                const selected = isRowSelected?.(row);
                return (
                  <tr
                    key={rowId}
                    data-row-id={rowId}
                    data-state={selected ? 'selected' : undefined}
                    className={cn('group/row', rowClassName?.(row))}
                  >
                    {columns.map((col, c) => {
                      const isActive = pos.row === r && pos.col === c;
                      const ed = editing && editing.rowId === rowId && editing.columnId === col.id ? editing : null;
                      const st = statusOf(rowId, col.id);
                      const ro = readOnlyReason(row, col);
                      const editable = isEditable(row, col);
                      const errId = `${gridId}-err-${rowId}-${col.id}`;
                      const errorText = ed?.error ?? (st ? (st.kind === 'error' ? st.message : undefined) : props.cellError?.(row, col.id));
                      const name = col.edit ? `${col.label ?? col.header} ${rowLabel(row)}` : undefined;
                      return (
                        <td
                          key={col.id}
                          role="gridcell"
                          data-cell={`${r}:${c}`}
                          data-col-id={col.id}
                          data-testid={col.testId}
                          data-status={st?.kind}
                          data-interactive={col.interactive ? '' : undefined}
                          tabIndex={ed ? -1 : isActive ? 0 : -1}
                          aria-label={col.edit && !ed ? `${name}: ${displayText(st, col.edit.raw(row))}` : undefined}
                          aria-readonly={col.edit ? !editable : undefined}
                          aria-invalid={errorText ? true : undefined}
                          aria-describedby={errorText ? errId : undefined}
                          aria-selected={selected ? true : undefined}
                          title={typeof ro === 'string' ? ro : undefined}
                          onFocus={() => {
                            if (!isActive) setActive({ row: r, col: c });
                          }}
                          onDoubleClick={() => {
                            if (editable) openEditor({ row: r, col: c }, null);
                          }}
                          className={cn(
                            'h-8 border-b px-2 py-1 align-middle outline-none',
                            'focus:relative focus:z-[1] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                            col.numeric && 'text-end tabular-nums whitespace-nowrap',
                            col.sticky && 'sticky left-0 z-10 bg-card group-data-[state=selected]/row:bg-accent',
                            editable && 'cursor-text hover:bg-accent/60 focus:bg-accent/60',
                            errorText && 'ring-1 ring-destructive ring-inset',
                            col.className,
                          )}
                        >
                          {ed && col.edit ? (
                            <CellEditor
                              label={name ?? col.header}
                              value={ed.value}
                              typed={ed.typed}
                              numeric={col.numeric}
                              error={ed.error}
                              errId={errId}
                              onChange={(value) => setEditing({ ...ed, value, error: undefined })}
                              onKey={(key) => {
                                const action = editKeyAction(key);
                                if (action.type === 'commit') commit(action.then);
                                else if (action.type === 'cancel') cancel();
                                return action.type !== 'none';
                              }}
                              onBlur={() => commit('blur')}
                            />
                          ) : (
                            <>
                              <div className={cn('flex items-center gap-1', col.numeric && 'justify-end')}>
                                {st?.kind === 'saving' && <Loader2 aria-hidden className="size-3 shrink-0 animate-spin text-muted-foreground" />}
                                {st?.kind === 'saved' && <Check aria-hidden className="size-3 shrink-0 text-success-text" data-testid="cell-saved" />}
                                {st && st.kind !== 'saved' ? (
                                  <span className={cn(st.kind === 'error' && 'text-destructive-text')}>{st.draft.trim() || 'Trống'}</span>
                                ) : (
                                  col.render(row)
                                )}
                              </div>
                              {col.edit?.extra?.(row, {
                                locked: !editable,
                                save: (raw) => {
                                  const result = submitRaw(rowId, col, raw);
                                  if (result !== true) dispatch({ type: 'error', rowId, columnId: col.id, message: String(result), draft: raw });
                                },
                              })}
                            </>
                          )}
                          {errorText && !ed && (
                            <div className="mt-0.5 grid justify-items-end gap-0.5 text-start whitespace-normal">
                              <span id={errId} className="text-xs text-destructive-text" data-testid="cell-error">
                                {errorText}
                              </span>
                              {st?.kind === 'error' && st.conflict && props.reloadRow && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  data-grid-reload=""
                                  onClick={() => void reload(rowId, col.id)}
                                >
                                  <RotateCcw className="size-3" />
                                  Tải lại dòng
                                </Button>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
      {pagination && <PaginationBar pageSizes={[25, 50, 100]} {...pagination} />}
    </div>
  );
}

const displayText = (st: CellStatus | undefined, raw: string) => {
  const text = st && st.kind !== 'saved' ? st.draft : raw;
  return text.trim() || 'trống';
};

function CellEditor({
  label,
  value,
  typed,
  numeric,
  error,
  errId,
  onChange,
  onKey,
  onBlur,
}: {
  label: string;
  value: string;
  typed: boolean;
  numeric?: boolean;
  error?: string;
  errId: string;
  onChange: (value: string) => void;
  /** Trả true khi phím đã được bảng xử lý */
  onKey: (e: { key: string; shiftKey: boolean }) => boolean;
  onBlur: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    if (typed) el.setSelectionRange(el.value.length, el.value.length);
    else el.select();
    // Chỉ khi mở ô
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="grid gap-0.5">
      <input
        ref={ref}
        data-grid-editor=""
        aria-label={label}
        aria-readonly={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        inputMode={numeric ? 'numeric' : undefined}
        autoComplete="off"
        className={cn(
          'h-7 w-full min-w-20 rounded-sm border border-primary bg-background px-1.5 text-sm outline-none',
          numeric && 'text-end tabular-nums',
          error && 'border-destructive',
        )}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (onKey(e)) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onBlur={onBlur}
      />
      {error && (
        <span id={errId} className="text-start text-xs whitespace-normal text-destructive-text" data-testid="cell-error">
          {error}
        </span>
      )}
    </div>
  );
}
