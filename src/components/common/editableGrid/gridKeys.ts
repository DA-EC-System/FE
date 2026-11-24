/**
 * Phím của bảng sửa từng ô (FE#475, kiểu Next Engine). Tách khỏi component để test không cần DOM.
 * Hai chế độ: đang chọn ô (di chuyển, mở sửa) và đang sửa ô (lưu, huỷ).
 */

export interface CellPos {
  row: number;
  col: number;
}

export interface KeyInput {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

export type IdleAction =
  | { type: 'move'; to: CellPos }
  /** `initial` null: giữ giá trị đang có; chuỗi: gõ đè bằng ký tự này */
  | { type: 'edit'; initial: string | null }
  /** Enter, Space ở ô không sửa được: bấm nút, ô chọn trong ô */
  | { type: 'activate' }
  | { type: 'toggleLock' }
  | { type: 'none' };

export type EditAction =
  | { type: 'commit'; then: 'down' | 'right' | 'left' | 'stay' }
  | { type: 'cancel' }
  | { type: 'none' };

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));

/** Ctrl+E (Cmd+E trên Mac) bật, tắt khoá sửa */
export const isToggleLock = (e: KeyInput) => (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'e';

/** Một ký tự gõ được, không kèm Ctrl, Cmd, Alt: mở sửa và gõ đè */
export const isTypeOver = (e: KeyInput) => e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey;

/** Ô kế tiếp theo phím mũi tên, Home, End; null khi không phải phím di chuyển */
export function moveTarget(pos: CellPos, e: KeyInput, rows: number, cols: number): CellPos | null {
  if (rows <= 0 || cols <= 0) return null;
  const ctrl = e.ctrlKey || e.metaKey;
  switch (e.key) {
    case 'ArrowUp':
      return { row: ctrl ? 0 : clamp(pos.row - 1, rows - 1), col: pos.col };
    case 'ArrowDown':
      return { row: ctrl ? rows - 1 : clamp(pos.row + 1, rows - 1), col: pos.col };
    case 'ArrowLeft':
      return { row: pos.row, col: ctrl ? 0 : clamp(pos.col - 1, cols - 1) };
    case 'ArrowRight':
      return { row: pos.row, col: ctrl ? cols - 1 : clamp(pos.col + 1, cols - 1) };
    case 'Home':
      return ctrl ? { row: 0, col: 0 } : { row: pos.row, col: 0 };
    case 'End':
      return ctrl ? { row: rows - 1, col: cols - 1 } : { row: pos.row, col: cols - 1 };
    default:
      return null;
  }
}

/**
 * Phím khi đang chọn ô. `editable`: ô này sửa được và bảng đang mở khoá. Đang khoá thì mũi tên vẫn chọn ô, còn Enter, F2,
 * gõ phím không mở sửa
 */
export function idleKeyAction(e: KeyInput, ctx: { pos: CellPos; rows: number; cols: number; editable: boolean }): IdleAction {
  if (isToggleLock(e)) return { type: 'toggleLock' };
  const to = moveTarget(ctx.pos, e, ctx.rows, ctx.cols);
  if (to) return { type: 'move', to };
  if (e.key === 'Enter' || e.key === 'F2') return ctx.editable ? { type: 'edit', initial: null } : e.key === 'Enter' ? { type: 'activate' } : { type: 'none' };
  if (e.key === ' ' && !ctx.editable) return { type: 'activate' };
  if (ctx.editable && isTypeOver(e)) return { type: 'edit', initial: e.key };
  return { type: 'none' };
}

/** Phím khi đang sửa ô: Enter lưu rồi xuống dòng, Tab lưu rồi sang phải (Shift+Tab sang trái), Esc huỷ */
export function editKeyAction(e: KeyInput): EditAction {
  if (e.key === 'Escape') return { type: 'cancel' };
  if (e.key === 'Enter') return { type: 'commit', then: e.shiftKey ? 'stay' : 'down' };
  if (e.key === 'Tab') return { type: 'commit', then: e.shiftKey ? 'left' : 'right' };
  return { type: 'none' };
}

/** Ô sau khi lưu: xuống dòng dưới, sang phải, sang trái; ở mép thì đứng yên */
export function afterCommit(pos: CellPos, then: 'down' | 'right' | 'left' | 'stay', rows: number, cols: number): CellPos {
  if (then === 'down') return { row: clamp(pos.row + 1, rows - 1), col: pos.col };
  if (then === 'right') return { row: pos.row, col: clamp(pos.col + 1, cols - 1) };
  if (then === 'left') return { row: pos.row, col: clamp(pos.col - 1, cols - 1) };
  return pos;
}
