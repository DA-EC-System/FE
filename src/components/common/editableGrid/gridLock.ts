/**
 * Khoá sửa của bảng (FE#475): mặc định khoá, nhớ theo `gridId` trong localStorage. Trình duyệt chặn bộ nhớ (cửa sổ ẩn
 * danh, chặn dữ liệu trang) thì coi như khoá và bỏ qua lỗi
 */

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

const key = (gridId: string) => `editable-grid:${gridId}:unlocked`;

const defaultStorage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

export function readLocked(gridId: string, storage: Storage | null = defaultStorage()): boolean {
  try {
    return storage?.getItem(key(gridId)) !== '1';
  } catch {
    return true;
  }
}

export function writeLocked(gridId: string, locked: boolean, storage: Storage | null = defaultStorage()): void {
  try {
    if (locked) storage?.removeItem(key(gridId));
    else storage?.setItem(key(gridId), '1');
  } catch {
    // Không nhớ được thì lần sau mở lại vẫn khoá, đúng mặc định
  }
}
