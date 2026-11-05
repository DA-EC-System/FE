/** Bỏ tham số rỗng ('', null, undefined) trước khi gửi; giữ 0 và false */
export function compactParams<T extends object>(params: T): Partial<T> {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null)) as Partial<T>;
}
