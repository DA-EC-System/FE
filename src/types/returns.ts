/**
 * Yêu cầu trả hàng (sơ đồ D3, FE#60): khách yêu cầu sau khi nhận, gắn dòng đơn và kiện, trả một phần được.
 * Hợp đồng ở Documents/21 mục 20.
 */

import type { StatusChange } from '@/lib/stateMachine';
import type { DocRef } from './inventory';
import type { Attachment } from './purchasing';
import type { UserRef } from './sales';

export type ReturnStatus = 'requested' | 'awaiting_return' | 'received' | 'closed' | 'rejected' | 'refund_only';

export type ReturnAction =
  | 'accept'
  | 'reject'
  | 'refund_only'
  /** Sàn xử cho khách sau khi người bán từ chối: mở lại thành chờ hàng về hoặc hoàn tiền */
  | 'platform_reopen'
  | 'platform_refund'
  | 'receive'
  | 'no_show'
  /** Hệ thống: phiếu kiểm hàng về đã ghi sổ */
  | 'close'
  /** Sàn: khách rút yêu cầu */
  | 'buyer_cancel';

/** `marketplace`: sàn đẩy về; `manual`: Sale lập cho đơn tạo tay, hộp thư */
export type ReturnSource = 'marketplace' | 'manual';

/** Lý do đóng: kiểm hàng về đã ghi sổ, khách không gửi, khách rút yêu cầu */
export type ReturnCloseResult = 'inspected' | 'no_show' | 'buyer_cancelled';

export interface ReturnLine {
  variantId: string;
  sku: string;
  productName: string;
  attributesLabel: string;
  quantity: number;
  unitPrice: number;
  packageId: string;
  packageCode: string;
}

export interface ReturnRequestSummary {
  id: string;
  code: string;
  order: { id: string; code: string };
  source: ReturnSource;
  shopId: string | null;
  shopName: string | null;
  customerName: string | null;
  status: ReturnStatus;
  closeResult: ReturnCloseResult | null;
  /** Trạng thái gốc trên sàn (REQUESTED, JUDGING...) */
  rawMarketplaceStatus: string | null;
  totalQty: number;
  refundAmount: number;
  createdAt: string;
  version: number;
}

export interface ReturnMoney {
  /** Tiền hoàn cho khách: giá bán × số lượng trả */
  refundAmount: number;
  /** Đã hoàn (chỉ hoàn tiền, hoặc đã nhận hàng) */
  refunded: boolean;
  /** Số bán lại được, sau khi kiểm hàng về ghi sổ */
  resellQty: number | null;
  /** Giá vốn giảm theo phần bán lại; null khi chưa ghi sổ hoặc không có quyền xem giá vốn */
  resellCost: number | null;
}

/** Trạng thái gốc của đơn ngược trên sàn (§20.1), chỉ để hiện */
export interface ReturnPlatformInfo {
  reverseStatus: string;
  ofcStatus: string | null;
  /** Khách đang khiếu nại lên sàn */
  disputeInProgress: boolean;
  returnTo: 'warehouse' | 'merchant' | null;
}

export interface ReturnRequest extends ReturnRequestSummary {
  reason: string;
  lines: ReturnLine[];
  /** Mã vận đơn chiều về do sàn cấp; kho quét mã này hoặc mã yêu cầu */
  returnTrackingCode: string | null;
  inspection: DocRef | null;
  receivedAt: string | null;
  receivedBy: UserRef | null;
  money: ReturnMoney;
  statusHistory: StatusChange<ReturnStatus>[];
  /** null với yêu cầu tạo tay */
  platform: ReturnPlatformInfo | null;
  /** Lý do từ chối chọn theo danh sách của sàn */
  rejectReason: { id: string; label: string } | null;
  attachments: Attachment[];
}

/** Lý do từ chối của sàn; `requiresImage` thì bắt buộc ảnh (§20.1) */
export interface ReturnReason {
  id: string;
  label: string;
  requiresImage: boolean;
}

export interface ReturnReasonList {
  items: ReturnReason[];
}

export type ReturnReasonAction = 'reject' | 'refuse-refund';

/** Một bước của đơn ngược phía sàn, mới nhất trước */
export interface PlatformHistoryEntry {
  at: string;
  reverseStatus: string;
  ofcStatus: string | null;
  note: string | null;
}

export interface PlatformHistoryList {
  items: PlatformHistoryEntry[];
}

export interface ReturnListResponse {
  items: ReturnRequestSummary[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<ReturnStatus, number> & { unmatched: number };
}

export interface CreateReturnInput {
  orderId: string;
  reason: string;
  lines: { variantId: string; quantity: number }[];
}

/** Dòng đơn còn trả được: đã giao trừ phần đã nằm trong yêu cầu khác */
export interface ReturnableLine {
  variantId: string;
  sku: string;
  productName: string;
  attributesLabel: string;
  unitPrice: number;
  delivered: number;
  returnable: number;
}

/** Kiện hàng trả về không khớp yêu cầu nào: vào khu chờ xử lý, mang cờ Cần xử lý */
export type UnmatchedStatus = 'open' | 'attached' | 'dismissed';

export interface UnmatchedParcel {
  id: string;
  code: string;
  note: string;
  status: UnmatchedStatus;
  receivedAt: string;
  receivedBy: UserRef | null;
  returnRequest: { id: string; code: string } | null;
  resolvedAt: string | null;
  resolvedBy: UserRef | null;
  resolution: string | null;
  version: number;
}

export type ReceiveResult = { kind: 'matched'; request: ReturnRequest } | { kind: 'unmatched'; parcel: UnmatchedParcel };
