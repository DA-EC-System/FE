/**
 * Trạng thái kinh doanh của SKU (sơ đồ Sản phẩm B1, FE#57). Mock kiểm bằng `check`, UI hiện thao tác bằng `available`.
 * Ba lớp nhãn không trộn: độ hoàn thiện (tính), trạng thái kinh doanh (lưu), hiện diện trên sàn (tính từ listing).
 */
import { defineMachine, type OwnedRecord } from '@/lib/stateMachine';
import { PERMISSIONS } from '@/utils/permissions';
import type {
  VariantBusinessAction,
  VariantBusinessStatus,
  VariantMainLabel,
  VariantPresence,
} from '@/types/catalog';

export interface VariantRecord extends OwnedRecord {
  /** Lý do chưa lưu trữ được; rỗng là lưu trữ được */
  archiveBlockers: string[];
}

export const variantMachine = defineMachine<VariantBusinessStatus, VariantBusinessAction, VariantRecord>([
  { from: ['selling', 'discontinued'], to: 'paused', action: 'pause', label: 'Tạm ngừng', permission: PERMISSIONS.productManage },
  { from: 'paused', to: 'selling', action: 'unpause', label: 'Bỏ tạm ngừng', permission: PERMISSIONS.productManage },
  { from: ['selling', 'paused'], to: 'discontinued', action: 'discontinue', label: 'Ngừng nhập', permission: PERMISSIONS.productManage },
  { from: 'discontinued', to: 'selling', action: 'reactivate', label: 'Nhập lại', permission: PERMISSIONS.productManage },
  {
    from: 'discontinued',
    to: 'archived',
    action: 'archive',
    label: 'Lưu trữ',
    permission: PERMISSIONS.productManage,
    guard: (r) => (r.archiveBlockers.length ? 'archive_blocked' : null),
  },
  { from: 'archived', to: 'discontinued', action: 'restore', label: 'Khôi phục', permission: PERMISSIONS.productManage },
]);

/** Thứ tự thao tác trên menu */
export const BUSINESS_ACTIONS: VariantBusinessAction[] = ['pause', 'unpause', 'discontinue', 'reactivate', 'archive', 'restore'];

export const actionLabel = (action: VariantBusinessAction) =>
  variantMachine.transitions.find((t) => t.action === action)!.label;

/** Listing đang hiện trên sàn bị ẩn khi tạm ngừng, hiện lại khi rời tạm ngừng */
export const hidesListings = (status: VariantBusinessStatus) => status === 'paused';

/** Ngừng nhập và lưu trữ không còn trong gợi ý nhập lại, không thêm được vào đề nghị nhập */
export const purchasable = (status: VariantBusinessStatus) => status === 'selling' || status === 'paused';

/** Nhãn chính: Lưu trữ → Ngừng nhập → Tạm ngừng → hiện diện trên sàn. "Có lỗi" là nhãn phụ */
export function mainLabel(status: VariantBusinessStatus, presence: VariantPresence): VariantMainLabel {
  if (status !== 'selling') return status;
  return presence === 'error' ? 'live' : presence;
}

export const MAIN_LABELS: Record<VariantMainLabel, string> = {
  archived: 'Lưu trữ',
  discontinued: 'Ngừng nhập',
  paused: 'Tạm ngừng',
  live: 'Đang bán',
  pending: 'Chờ sàn',
  not_listed: 'Chưa đăng',
};

/**
 * Nhãn cha suy từ con: mọi SKU lưu trữ thì "Lưu trữ"; có SKU đang bán thì "Đang bán x/n";
 * không thì nhãn của nhiều SKU nhất. `n` không tính SKU đã lưu trữ.
 */
export function parentLabel(counts: Record<VariantMainLabel, number>): { label: VariantMainLabel; text: string } {
  const entries = (Object.keys(MAIN_LABELS) as VariantMainLabel[]).filter((k) => k !== 'archived');
  const total = entries.reduce((sum, k) => sum + counts[k], 0);
  if (!total) return { label: 'archived', text: MAIN_LABELS.archived };
  const label = counts.live
    ? 'live'
    : entries.reduce((best, k) => (counts[k] > counts[best] ? k : best), entries[0]);
  const n = counts[label];
  return { label, text: total > 1 && n < total ? `${MAIN_LABELS[label]} ${n}/${total}` : MAIN_LABELS[label] };
}
