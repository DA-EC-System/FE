/** Việc cần làm theo hạn (FE#55): mỗi phân hệ góp một nguồn nhắc, trang Tổng quan gom lại */

export type TaskSeverity = 'overdue' | 'due_soon' | 'info';

/** Bản ghi mà việc trỏ tới; FE tự dựng đường dẫn theo `type` */
export type TaskRefType = 'shop' | 'order' | 'stock_document' | 'goods_receipt' | 'purchase_request' | 'supplier_return';

export interface TaskItem {
  id: string;
  /** Loại nhắc, ví dụ `shop.reauth`, `goods_receipt.counting` */
  kind: string;
  /** Nhóm hiển thị: Gian hàng, Bán hàng, Kho, Mua hàng... */
  group: string;
  title: string;
  detail: string;
  /** Hạn phải xử lý; null khi không có hạn */
  dueAt: string | null;
  severity: TaskSeverity;
  ref: { type: TaskRefType; id: string };
}
