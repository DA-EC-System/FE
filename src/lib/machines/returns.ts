/**
 * Bảng chuyển của yêu cầu trả hàng (sơ đồ D3, FE#60). Mock kiểm bằng `check`, UI hiện nút bằng `available`.
 */
import { defineMachine, type OwnedRecord } from '@/lib/stateMachine';
import { PERMISSIONS } from '@/utils/permissions';
import type { ReturnAction, ReturnSource, ReturnStatus } from '@/types/returns';

const P = PERMISSIONS;

export interface ReturnRecord extends OwnedRecord {
  source: ReturnSource;
}

/** Sàn xử cho khách chỉ có với yêu cầu từ sàn */
const marketplaceOnly = (r: ReturnRecord) => (r.source === 'marketplace' ? null : 'not_marketplace');

export const returnMachine = defineMachine<ReturnStatus, ReturnAction, ReturnRecord>([
  { from: 'requested', to: 'awaiting_return', action: 'accept', label: 'Chấp nhận trả hàng', permission: P.returnProcess },
  { from: 'requested', to: 'rejected', action: 'reject', label: 'Từ chối', permission: P.returnProcess, needsReason: true },
  {
    from: 'requested',
    to: 'refund_only',
    action: 'refund_only',
    label: 'Hoàn tiền, khách giữ hàng',
    permission: P.returnProcess,
  },
  {
    from: 'rejected',
    to: 'awaiting_return',
    action: 'platform_reopen',
    label: 'Sàn xử cho khách: trả hàng',
    permission: P.returnProcess,
    guard: marketplaceOnly,
  },
  {
    from: 'rejected',
    to: 'refund_only',
    action: 'platform_refund',
    label: 'Sàn xử cho khách: hoàn tiền',
    permission: P.returnProcess,
    guard: marketplaceOnly,
  },
  { from: 'awaiting_return', to: 'received', action: 'receive', label: 'Nhận hàng trả', permission: P.fulfillmentProcess },
  {
    from: 'awaiting_return',
    to: 'closed',
    action: 'no_show',
    label: 'Khách không gửi hàng',
    permission: P.returnProcess,
    needsReason: true,
  },
  { from: 'received', to: 'closed', action: 'close', label: 'Đóng', system: true },
  { from: ['requested', 'awaiting_return'], to: 'closed', action: 'buyer_cancel', label: 'Khách rút yêu cầu', system: true },
]);

/** Yêu cầu còn mở: chặn hoàn tất đơn, đơn mang cờ Có yêu cầu trả */
export const OPEN_RETURN: readonly ReturnStatus[] = ['requested', 'awaiting_return', 'received'];

export const isOpenReturn = (s: ReturnStatus) => OPEN_RETURN.includes(s);

/** Đã hoàn tiền cho khách: chỉ hoàn tiền, hoặc đã nhận hàng (kể cả đóng sau kiểm hàng về) */
export const isRefunded = (s: ReturnStatus, closeResult: string | null) =>
  s === 'refund_only' || s === 'received' || (s === 'closed' && closeResult === 'inspected');
