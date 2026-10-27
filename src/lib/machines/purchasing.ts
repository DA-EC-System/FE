/**
 * Bảng chuyển của nhập hàng (sơ đồ A1 Đề nghị nhập, A2 Phiếu nhận, B4 Phiếu trả NCC; FE#17).
 * Mock kiểm bằng `check`, UI hiện nút bằng `available`.
 */
import { defineMachine } from '@/lib/stateMachine';
import { PERMISSIONS } from '@/utils/permissions';
import type {
  GoodsReceiptAction,
  GoodsReceiptStatus,
  PurchaseRequestAction,
  PurchaseRequestStatus,
  SupplierReturnAction,
  SupplierReturnStatus,
} from '@/types/purchasing';

const P = PERMISSIONS;

export interface PurchaseRequestRecord {
  createdBy: string;
  lineCount: number;
  /** Dòng chưa bị loại khi duyệt */
  activeLines: number;
  /** Phiếu nhận chưa huỷ */
  receiptCount: number;
  /** Phiếu nhận đang kiểm */
  countingReceipts: number;
}

const notEmpty = (r: PurchaseRequestRecord) => (r.lineCount ? null : 'empty_document');

/**
 * Mua hàng lập nháp một NCC, gửi duyệt; CEO (khác người lập) duyệt, trả về hoặc từ chối.
 * Đặt NCC thì "đang về" tăng; phiếu nhận ghi sổ chuyển sang nhận một phần / nhận xong.
 */
export const purchaseRequestMachine = defineMachine<PurchaseRequestStatus, PurchaseRequestAction, PurchaseRequestRecord>([
  {
    from: 'draft',
    to: 'pending_approval',
    action: 'submit',
    label: 'Gửi duyệt',
    permission: P.purchaseRequestManage,
    guard: notEmpty,
  },
  { from: 'pending_approval', to: 'draft', action: 'withdraw', label: 'Rút lại', permission: P.purchaseRequestManage },
  {
    from: 'changes_requested',
    to: 'pending_approval',
    action: 'resubmit',
    label: 'Gửi lại',
    permission: P.purchaseRequestManage,
    guard: notEmpty,
  },
  {
    from: 'pending_approval',
    to: 'approved',
    action: 'approve',
    label: 'Duyệt',
    permission: P.purchaseRequestApprove,
    needsSecondPerson: true,
    guard: (r) => (r.activeLines ? null : 'all_lines_excluded'),
  },
  {
    from: 'pending_approval',
    to: 'changes_requested',
    action: 'request_changes',
    label: 'Trả về',
    permission: P.purchaseRequestApprove,
    needsSecondPerson: true,
    needsReason: true,
  },
  {
    from: 'pending_approval',
    to: 'rejected',
    action: 'reject',
    label: 'Từ chối',
    permission: P.purchaseRequestApprove,
    needsSecondPerson: true,
    needsReason: true,
  },
  { from: 'approved', to: 'ordered', action: 'order', label: 'Đã đặt NCC', permission: P.purchaseRequestManage },
  { from: ['ordered', 'partially_received'], to: 'partially_received', action: 'receive_partial', label: 'Nhận một phần', system: true },
  { from: ['ordered', 'partially_received'], to: 'received', action: 'receive_all', label: 'Nhận xong', system: true },
  {
    from: ['ordered', 'partially_received'],
    to: 'closed_short',
    action: 'close_short',
    label: 'Đóng thiếu',
    permission: P.purchaseRequestApprove,
    needsReason: true,
    guard: (r) => (r.countingReceipts ? 'receipt_counting' : null),
  },
  {
    from: ['draft', 'changes_requested', 'pending_approval'],
    to: 'cancelled',
    action: 'cancel',
    label: 'Huỷ đề nghị',
    permission: P.purchaseRequestManage,
  },
  {
    // Đã duyệt, đã đặt: chỉ CEO huỷ, kèm lý do; có phiếu nhận rồi thì không huỷ được
    from: ['approved', 'ordered'],
    to: 'cancelled',
    action: 'cancel',
    label: 'Huỷ đề nghị',
    permission: P.purchaseRequestApprove,
    needsReason: true,
    guard: (r) => (r.receiptCount ? 'has_receipts' : null),
  },
]);

export interface GoodsReceiptRecord {
  /** Người lập đề nghị: người ghi sổ phải khác */
  createdBy: string;
  /** Tổng thiếu của phiếu */
  short: number;
}

/** Kho kiểm đếm rồi ghi sổ một lần; có thiếu thì sang giao thiếu, chờ ghi kết quả */
export const goodsReceiptMachine = defineMachine<GoodsReceiptStatus, GoodsReceiptAction, GoodsReceiptRecord>([
  {
    from: 'counting',
    to: 'matched',
    action: 'post',
    label: 'Ghi sổ',
    permission: P.goodsReceiptManage,
    needsSecondPerson: true,
    guard: (r) => (r.short > 0 ? 'has_shortage' : null),
  },
  {
    from: 'counting',
    to: 'short',
    action: 'post_short',
    label: 'Ghi sổ, báo giao thiếu',
    permission: P.goodsReceiptManage,
    needsSecondPerson: true,
    guard: (r) => (r.short > 0 ? null : 'no_shortage'),
  },
  {
    from: 'counting',
    to: 'cancelled',
    action: 'cancel',
    label: 'Huỷ phiếu',
    permission: P.goodsReceiptManage,
    needsReason: true,
  },
  // Đề nghị nhận đủ hoặc bị đóng thiếu
  { from: 'short', to: 'resolved', action: 'auto_resolve', label: 'Đã xử lý', system: true },
]);

export interface SupplierReturnRecord {
  /** Người gửi: người ghi kết quả phải khác */
  createdBy: string | null;
  lineCount: number;
  hasSupplier: boolean;
}

/** Mua hàng lập, CEO duyệt và gửi (chờ xử lý giảm); người khác người gửi ghi kết quả */
export const supplierReturnMachine = defineMachine<SupplierReturnStatus, SupplierReturnAction, SupplierReturnRecord>([
  {
    from: 'draft',
    to: 'pending_approval',
    action: 'submit',
    label: 'Gửi duyệt',
    permission: P.supplierReturnManage,
    guard: (r) => (!r.lineCount ? 'empty_document' : r.hasSupplier ? null : 'supplier_required'),
  },
  {
    from: 'pending_approval',
    to: 'draft',
    action: 'send_back',
    label: 'Trả về',
    permission: P.purchaseRequestApprove,
    needsReason: true,
  },
  {
    from: 'pending_approval',
    to: 'sent',
    action: 'approve_send',
    label: 'Duyệt và gửi',
    permission: P.purchaseRequestApprove,
  },
  {
    from: 'sent',
    to: 'refunded',
    action: 'record_refund',
    label: 'NCC hoàn tiền',
    permission: P.supplierReturnManage,
    needsSecondPerson: true,
  },
  {
    from: 'sent',
    to: 'replaced',
    action: 'record_replaced',
    label: 'NCC bù hàng',
    permission: P.supplierReturnManage,
    needsSecondPerson: true,
  },
  {
    from: 'sent',
    to: 'returned_to_us',
    action: 'record_rejected',
    label: 'NCC không nhận',
    permission: P.supplierReturnManage,
    needsSecondPerson: true,
  },
  {
    from: ['draft', 'pending_approval'],
    to: 'cancelled',
    action: 'cancel',
    label: 'Huỷ phiếu',
    permission: P.purchaseRequestApprove,
    needsReason: true,
  },
]);
