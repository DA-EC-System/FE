/**
 * Hàng đợi lưu theo dòng (FE#475): các ô của cùng một dòng gửi lần lượt, lần sau dùng `version` lần trước trả về để không
 * tự vấp `version_conflict`. Dòng khác nhau gửi song song. `V` là version của dòng (số, hoặc nhiều version như
 * { version, reorderVersion } ở bảng sửa hàng loạt).
 *
 * Version nhớ trong hàng đợi chỉ dùng khi dòng còn lượt đang chờ; hết lượt thì quên, lượt sau đọc lại từ dữ liệu bảng
 * (đã cập nhật cache), để thao tác khác trên trang (đổi trạng thái…) làm tăng version không bị version cũ đè.
 */

export type SaveResult<V> =
  | { ok: true; version: V }
  | { ok: false; error: string; conflict?: boolean };

export class RowSaveQueue<V> {
  private tails = new Map<string, Promise<unknown>>();
  private versions = new Map<string, V>();
  private counts = new Map<string, number>();
  private total = 0;

  constructor(private onBusyChange?: (busy: boolean) => void) {}

  get busy(): boolean {
    return this.total > 0;
  }

  /** Số lượt đang chờ hoặc đang gửi của một dòng */
  pending(rowId: string): number {
    return this.counts.get(rowId) ?? 0;
  }

  /**
   * Xếp một lượt lưu cho dòng. `initial` đọc version từ dữ liệu bảng khi dòng chưa có lượt nào; `send` nhận version
   * hiện tại. `send` ném lỗi thì promise trả về bị reject, các lượt sau của dòng vẫn chạy
   */
  run(rowId: string, initial: () => V, send: (version: V) => Promise<SaveResult<V>>): Promise<SaveResult<V>> {
    this.bump(rowId, 1);
    const prev = this.tails.get(rowId) ?? Promise.resolve();
    const job = prev.then(async () => {
      const version = this.versions.has(rowId) ? (this.versions.get(rowId) as V) : initial();
      const result = await send(version);
      if (result.ok) this.versions.set(rowId, result.version);
      return result;
    });
    const settled = job.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(rowId, settled);
    void settled.then(() => {
      this.bump(rowId, -1);
      if (this.pending(rowId) === 0) {
        this.versions.delete(rowId);
        if (this.tails.get(rowId) === settled) this.tails.delete(rowId);
      }
    });
    return job;
  }

  private bump(rowId: string, by: number) {
    const was = this.total > 0;
    this.counts.set(rowId, this.pending(rowId) + by);
    if (this.pending(rowId) <= 0) this.counts.delete(rowId);
    this.total += by;
    if (was !== this.total > 0) this.onBusyChange?.(this.total > 0);
  }
}
