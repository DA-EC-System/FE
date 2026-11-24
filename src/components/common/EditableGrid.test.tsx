// @vitest-environment jsdom
import { createRef } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditableGrid, type EditableGridApi, type GridColumn, type SaveResult } from './EditableGrid';
import { parseCell } from './editableGrid/cellParse';

interface Row {
  id: string;
  sku: string;
  price: number | null;
  weight: number | null;
  version: number;
}

const numberColumn = (id: 'price' | 'weight', header: string): GridColumn<Row> => ({
  id,
  header,
  numeric: true,
  testId: `col-${id}`,
  render: (r) => (r[id] === null ? '—' : String(r[id])),
  edit: {
    raw: (r) => (r[id] === null ? '' : String(r[id])),
    parse: (raw) => parseCell(raw, { max: 50000, tooBig: 'Quá lớn' }),
  },
});
const columns: GridColumn<Row>[] = [
  { id: 'sku', header: 'SKU', render: (r) => r.sku },
  numberColumn('price', 'Giá'),
  numberColumn('weight', 'Khối lượng'),
];
const A: Row = { id: 'a', sku: 'SKU-A', price: 100, weight: 200, version: 1 };
const B: Row = { id: 'b', sku: 'SKU-B', price: 300, weight: null, version: 7 };

type SaveFn = (row: Row, columnId: string, value: unknown, version: number) => Promise<SaveResult<number>>;

const setup = (opts: { rows?: Row[]; save?: SaveFn; reloadRow?: (row: Row) => Promise<void>; unlocked?: boolean } = {}) => {
  if (opts.unlocked) window.localStorage.setItem('editable-grid:test-grid:unlocked', '1');
  const save = vi.fn<SaveFn>(opts.save ?? (async (_r, _c, _v, version) => ({ ok: true, version: version + 1 })));
  const apiRef = createRef<EditableGridApi>();
  const props = (rows: Row[]) => (
    <EditableGrid
      gridId="test-grid"
      aria-label="Bảng thử"
      apiRef={apiRef}
      columns={columns}
      rows={rows}
      getRowId={(r) => r.id}
      rowLabel={(r) => r.sku}
      getVersion={(r) => r.version}
      save={save}
      reloadRow={opts.reloadRow}
      canEdit
    />
  );
  const utils = render(props(opts.rows ?? [A, B]));
  return { ...utils, save, apiRef, rerenderRows: (rows: Row[]) => utils.rerender(props(rows)) };
};

const cell = (rowId: string, colId: string) =>
  document.querySelector<HTMLElement>(`tr[data-row-id="${rowId}"] [data-col-id="${colId}"]`)!;
const editor = () => document.querySelector<HTMLInputElement>('[data-grid-editor]');
const lockButton = () => screen.getByRole('button', { name: 'Khoá sửa' });

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('EditableGrid: khoá sửa', () => {
  it('mặc định khoá: bấm đúp hay gõ vào ô không mở ô sửa, không gửi', async () => {
    const user = userEvent.setup();
    const { save } = setup();
    expect(lockButton()).toHaveProperty('ariaPressed', 'true');
    expect(cell('a', 'price').getAttribute('aria-readonly')).toBe('true');
    await user.dblClick(cell('a', 'price'));
    expect(editor()).toBeNull();
    cell('a', 'price').focus();
    await user.keyboard('5');
    expect(editor()).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('mở ô qua focusCell (lối ?spec=) chỉ mở khoá trong phiên, không ghi nhớ', () => {
    const { apiRef } = setup();
    act(() => apiRef.current!.focusCell('b', 'weight', { edit: true }));
    expect(editor()).not.toBeNull();
    expect(lockButton().getAttribute('aria-pressed')).toBe('false');
    expect(window.localStorage.getItem('editable-grid:test-grid:unlocked')).toBeNull();
  });

  it('Ctrl+E khi ô đang có chữ sai: đóng ô sửa, khoá bảng, không gửi, giữ chữ và lỗi trên ô', async () => {
    const user = userEvent.setup();
    const { save } = setup({ unlocked: true });
    await user.dblClick(cell('a', 'weight'));
    await user.clear(editor()!);
    await user.type(editor()!, 'abc');
    await user.keyboard('{Control>}e{/Control}');
    expect(editor()).toBeNull();
    expect(lockButton().getAttribute('aria-pressed')).toBe('true');
    expect(save).not.toHaveBeenCalled();
    expect(cell('a', 'weight').textContent).toContain('abc');
    expect(within(cell('a', 'weight')).getByTestId('cell-error').textContent).toBe('Nhập số lớn hơn 0');
  });
});

describe('EditableGrid: lưu từng ô', () => {
  it('Enter rồi blur ngay (cùng một lượt) chỉ gửi một lần', async () => {
    const user = userEvent.setup();
    const { save } = setup({ unlocked: true });
    await user.dblClick(cell('a', 'price'));
    await user.clear(editor()!);
    await user.type(editor()!, '150');
    const input = editor()!;
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
      fireEvent.blur(input);
    });
    await waitFor(() => expect(within(cell('a', 'price')).getByTestId('cell-saved')).toBeTruthy());
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(A, 'price', 150, 1);
  });

  it('rời ô với chữ sai: không gửi; lỗi nối qua aria-describedby, không role="alert"', async () => {
    const user = userEvent.setup();
    const { save } = setup({ unlocked: true });
    await user.dblClick(cell('a', 'weight'));
    await user.clear(editor()!);
    await user.type(editor()!, '60000');
    act(() => fireEvent.blur(editor()!));
    expect(editor()).toBeNull();
    expect(save).not.toHaveBeenCalled();
    const td = cell('a', 'weight');
    const error = within(td).getByTestId('cell-error');
    expect(error.textContent).toBe('Quá lớn');
    expect(td.getAttribute('aria-invalid')).toBe('true');
    expect(td.getAttribute('aria-describedby')).toBe(error.id);
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('dòng xê dịch giữa hai lượt cùng dòng: lượt sau vẫn gửi đúng SKU, version lượt trước trả về', async () => {
    const user = userEvent.setup();
    let release!: (r: SaveResult<number>) => void;
    const first = new Promise<SaveResult<number>>((resolve) => (release = resolve));
    const { save, rerenderRows } = setup({
      unlocked: true,
      save: async (_r, _c, _v, version) => (version === 1 ? first : { ok: true, version: version + 1 }),
    });
    await user.dblClick(cell('a', 'price'));
    await user.clear(editor()!);
    await user.type(editor()!, '150{Enter}');
    await user.dblClick(cell('a', 'weight'));
    await user.clear(editor()!);
    await user.type(editor()!, '250{Enter}');
    expect(save).toHaveBeenCalledTimes(1);

    // Đổi bộ lọc/trang: A sang dòng thứ hai, dòng đầu là SKU khác cùng version dễ trùng
    const C: Row = { id: 'c', sku: 'SKU-C', price: 1, weight: 1, version: 2 };
    rerenderRows([C, A]);
    await act(async () => release({ ok: true, version: 2 }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    const [row, columnId, value, version] = save.mock.calls[1]!;
    expect(row.id).toBe('a');
    expect([columnId, value, version]).toEqual(['weight', 250, 2]);
  });

  it('dòng đã rời bảng khi tới lượt: vẫn gửi đúng SKU theo bản chụp lúc xếp lượt', async () => {
    const user = userEvent.setup();
    let release!: (r: SaveResult<number>) => void;
    const first = new Promise<SaveResult<number>>((resolve) => (release = resolve));
    const { save, rerenderRows } = setup({
      unlocked: true,
      save: async (_r, _c, _v, version) => (version === 1 ? first : { ok: true, version: version + 1 }),
    });
    await user.dblClick(cell('a', 'price'));
    await user.type(editor()!, '9{Enter}');
    await user.dblClick(cell('a', 'weight'));
    await user.type(editor()!, '9{Enter}');
    rerenderRows([B]);
    await act(async () => release({ ok: true, version: 2 }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![0].id).toBe('a');
    expect(save.mock.calls[1]![3]).toBe(2);
  });
});

describe('EditableGrid: xung đột version', () => {
  const conflict: SaveResult<number> = { ok: false, conflict: true, error: 'Người khác vừa sửa SKU này' };

  it('nút Tải lại dòng: nạp lại dòng rồi mở lại ô với số đã gõ', async () => {
    const user = userEvent.setup();
    const reloadRow = vi.fn(async () => {});
    setup({ unlocked: true, save: async () => conflict, reloadRow });
    await user.dblClick(cell('b', 'price'));
    await user.clear(editor()!);
    await user.type(editor()!, '310{Enter}');
    const reload = await within(cell('b', 'price')).findByRole('button', { name: 'Tải lại dòng' });
    // Ô xung đột không mở sửa được tới khi tải lại
    expect(cell('b', 'price').getAttribute('aria-readonly')).toBe('true');
    await user.click(reload);
    expect(reloadRow).toHaveBeenCalledWith(B);
    await waitFor(() => expect(editor()?.value).toBe('310'));
  });

  it('Enter trên ô xung đột bấm Tải lại dòng, bỏ qua nút đang tắt trong ô', async () => {
    const user = userEvent.setup();
    const reloadRow = vi.fn(async () => {});
    const chip = vi.fn();
    const withChip: GridColumn<Row>[] = columns.map((c) =>
      c.id === 'price'
        ? {
            ...c,
            edit: {
              ...c.edit!,
              extra: (_row, { locked }) => (
                <button type="button" disabled={locked} onClick={chip}>
                  gợi ý
                </button>
              ),
            },
          }
        : c,
    );
    window.localStorage.setItem('editable-grid:test-grid:unlocked', '1');
    render(
      <EditableGrid
        gridId="test-grid"
        aria-label="Bảng thử"
        columns={withChip}
        rows={[A, B]}
        getRowId={(r) => r.id}
        rowLabel={(r) => r.sku}
        getVersion={(r) => r.version}
        save={async () => conflict}
        reloadRow={reloadRow}
        canEdit
      />,
    );
    await user.dblClick(cell('a', 'price'));
    await user.clear(editor()!);
    await user.type(editor()!, '120{Enter}');
    await within(cell('a', 'price')).findByRole('button', { name: 'Tải lại dòng' });
    cell('a', 'price').focus();
    await user.keyboard('{Enter}');
    expect(chip).not.toHaveBeenCalled();
    expect(reloadRow).toHaveBeenCalledWith(A);
  });
});

describe('EditableGrid: lỗi từ ngoài bảng, ô có ô nhập riêng (FE#476)', () => {
  const renderGrid = (opts: { error?: string; save?: SaveFn } = {}) => {
    window.localStorage.setItem('editable-grid:test-grid:unlocked', '1');
    const save = vi.fn<SaveFn>(opts.save ?? (async () => ({ ok: true, version: 0 })));
    const cols: GridColumn<Row>[] = [
      { id: 'sku', header: 'SKU', interactive: true, render: (r) => <input aria-label={`Tên ${r.sku}`} defaultValue={r.sku} /> },
      numberColumn('price', 'Giá'),
    ];
    render(
      <EditableGrid
        gridId="test-grid"
        aria-label="Bảng thử"
        columns={cols}
        rows={[A]}
        getRowId={(r) => r.id}
        rowLabel={(r) => r.sku}
        getVersion={() => 0}
        save={save}
        cellError={(_r, columnId) => (columnId === 'price' ? opts.error : undefined)}
        canEdit
      />,
    );
    return { save };
  };

  it('lỗi kiểm form hiện trên ô, nối qua aria-describedby, không role="alert"; lưu ô xong thì nhường trạng thái lưu', async () => {
    const user = userEvent.setup();
    const { save } = renderGrid({ error: 'Nhập giá nhập' });
    const c = cell('a', 'price');
    const id = c.getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)?.textContent).toBe('Nhập giá nhập');
    expect(c.getAttribute('aria-invalid')).toBe('true');
    expect(document.querySelector('[role="alert"]')).toBeNull();
    await user.dblClick(c);
    await user.clear(editor()!);
    await user.type(editor()!, '150{Enter}');
    await waitFor(() => expect(cell('a', 'price').getAttribute('data-status')).toBe('saved'));
    expect(save).toHaveBeenCalledWith(A, 'price', 150, 0);
    expect(cell('a', 'price').getAttribute('aria-describedby')).toBeNull();
  });

  it('ô interactive: ô nhập trong ô vẫn nhận Tab; Enter trên ô đưa focus vào ô nhập', async () => {
    const user = userEvent.setup();
    renderGrid();
    const input = screen.getByRole('textbox', { name: 'Tên SKU-A' });
    expect(input.tabIndex).toBe(0);
    cell('a', 'sku').focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(input);
    await user.keyboard('X');
    expect((input as HTMLInputElement).value).toBe('SKU-AX');
  });
});
