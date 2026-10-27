/**
 * Bảng chuyển của phiếu kho (sơ đồ Phiếu kho B3, FE#56). Mock kiểm bằng `check`, UI hiện nút bằng `available`.
 */
import { defineMachine } from '@/lib/stateMachine';
import { PERMISSIONS } from '@/utils/permissions';
import type { StockDocAction, StockDocStatus, StockDocType } from '@/types/inventory';

export interface StockDocRecord {
  createdBy: string;
  lineCount: number;
  /** Kiểm hàng về: tổng số dự kiến − số quét */
  missing: number;
}

/** Kiểm kê, xuất huỷ, chuyển chờ xử lý: kho lập, CEO duyệt mọi phiếu */
export const adjustmentMachine = defineMachine<StockDocStatus, StockDocAction, StockDocRecord>([
  {
    from: 'draft',
    to: 'pending',
    action: 'submit',
    label: 'Gửi duyệt',
    permission: PERMISSIONS.stockDocManage,
    guard: (r) => (r.lineCount ? null : 'empty_document'),
  },
  { from: 'pending', to: 'posted', action: 'approve', label: 'Duyệt và ghi sổ', permission: PERMISSIONS.stockDocApprove },
  {
    from: 'pending',
    to: 'rejected',
    action: 'reject',
    label: 'Từ chối',
    permission: PERMISSIONS.stockDocApprove,
    needsReason: true,
  },
  { from: 'draft', to: 'cancelled', action: 'cancel', label: 'Huỷ phiếu', permission: PERMISSIONS.stockDocManage },
]);

/**
 * Kiểm hàng về: không có phần thiếu thì ghi sổ thẳng; có phần thiếu thì người thứ hai duyệt
 * (CEO, hoặc kho khác người quét). Bị trả về thì kho kiểm lại trên chính phiếu.
 */
export const inspectionMachine = defineMachine<StockDocStatus, StockDocAction, StockDocRecord>([
  {
    from: 'draft',
    to: 'posted',
    action: 'post',
    label: 'Ghi sổ',
    permission: PERMISSIONS.stockDocManage,
    guard: (r) => (r.missing > 0 ? 'shortage_needs_review' : null),
  },
  {
    from: 'draft',
    to: 'pending',
    action: 'submit',
    label: 'Gửi duyệt phần thiếu',
    permission: PERMISSIONS.stockDocManage,
    guard: (r) => (r.missing > 0 ? null : 'no_shortage'),
  },
  {
    from: 'pending',
    to: 'posted',
    action: 'approve',
    label: 'Duyệt và ghi sổ',
    permission: PERMISSIONS.stockDocManage,
    needsSecondPerson: true,
  },
  {
    from: 'pending',
    to: 'draft',
    action: 'reject',
    label: 'Yêu cầu kiểm lại',
    permission: PERMISSIONS.stockDocManage,
    needsSecondPerson: true,
    needsReason: true,
  },
]);

/** Phiếu nhập, xuất của mô hình cũ: hệ thống ghi sổ ngay, chỉ xem */
export const legacyMachine = defineMachine<StockDocStatus, StockDocAction, StockDocRecord>([]);

export function stockDocMachine(type: StockDocType) {
  if (type === 'return_inspection') return inspectionMachine;
  if (type === 'receipt' || type === 'issue') return legacyMachine;
  return adjustmentMachine;
}

/** Phiếu làm giảm tồn thực: tạm khoá hàng trong lúc chờ duyệt */
export const isDecreaseDoc = (type: StockDocType) => type === 'write_off' || type === 'to_quarantine' || type === 'stocktake';
