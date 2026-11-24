/**
 * Trạng thái lưu của từng ô (FE#475): đang lưu (vòng xoay nhỏ), đã lưu (dấu ✓ khoảng 1 giây), lỗi (viền đỏ, câu lỗi nối
 * qua aria-describedby). Ô lỗi giữ chữ người dùng đã gõ (`draft`) để sửa tiếp hoặc lưu lại sau khi tải lại dòng.
 */

export type CellStatus =
  | { kind: 'saving'; draft: string }
  | { kind: 'saved' }
  | { kind: 'error'; message: string; draft: string; conflict?: boolean };

export type CellStatuses = Readonly<Record<string, CellStatus>>;

export const cellKey = (rowId: string, columnId: string) => `${rowId}\u0000${columnId}`;

export type StatusAction =
  | { type: 'saving'; rowId: string; columnId: string; draft: string }
  | { type: 'saved'; rowId: string; columnId: string }
  | { type: 'error'; rowId: string; columnId: string; message: string; draft: string; conflict?: boolean }
  /** Hết thời gian hiện ✓; ô đã sang trạng thái khác thì giữ */
  | { type: 'expire'; rowId: string; columnId: string }
  | { type: 'clear'; rowId: string; columnId: string }
  /** Tải lại dòng: bỏ cờ xung đột mọi ô của dòng */
  | { type: 'clearRow'; rowId: string };

export function statusReducer(state: CellStatuses, action: StatusAction): CellStatuses {
  if (action.type === 'clearRow') {
    const prefix = `${action.rowId}\u0000`;
    const keys = Object.keys(state).filter((k) => k.startsWith(prefix));
    if (!keys.length) return state;
    const next = { ...state };
    for (const k of keys) delete next[k];
    return next;
  }
  const k = cellKey(action.rowId, action.columnId);
  switch (action.type) {
    case 'saving':
      return { ...state, [k]: { kind: 'saving', draft: action.draft } };
    case 'saved':
      return { ...state, [k]: { kind: 'saved' } };
    case 'error':
      return { ...state, [k]: { kind: 'error', message: action.message, draft: action.draft, conflict: action.conflict } };
    case 'expire':
      if (state[k]?.kind !== 'saved') return state;
      return without(state, k);
    case 'clear':
      return k in state ? without(state, k) : state;
  }
}

function without(state: CellStatuses, k: string): CellStatuses {
  const next = { ...state };
  delete next[k];
  return next;
}

/** Số ô đang lỗi */
export const errorCount = (state: CellStatuses) => Object.values(state).filter((s) => s.kind === 'error').length;
