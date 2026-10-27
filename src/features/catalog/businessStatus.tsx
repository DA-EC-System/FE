import { useState } from 'react';
import { toast } from 'sonner';
import { MoreHorizontal } from 'lucide-react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import type { StatusMeta } from '@/components/common/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useChangeBusinessStatus } from '@/api/catalog.api';
import { getErrorMessage } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { BUSINESS_ACTIONS, MAIN_LABELS, actionLabel, parentLabel, variantMachine } from '@/lib/machines/product';
import type {
  BusinessStatusResult,
  ProductListItem,
  VariantBusinessAction,
  VariantBusinessStatus,
  VariantMainLabel,
} from '@/types/catalog';

/** Màu nhãn chính (sơ đồ B1): trạng thái kinh doanh đè lên hiện diện trên sàn */
export const MAIN_LABEL_META: Record<VariantMainLabel, StatusMeta> = {
  archived: { label: MAIN_LABELS.archived, variant: 'secondary' },
  discontinued: { label: MAIN_LABELS.discontinued, variant: 'outline' },
  paused: { label: MAIN_LABELS.paused, variant: 'warning' },
  live: { label: MAIN_LABELS.live, variant: 'success' },
  pending: { label: MAIN_LABELS.pending, variant: 'info' },
  not_listed: { label: MAIN_LABELS.not_listed, variant: 'outline' },
};

export const BUSINESS_STATUS_LABELS: Record<VariantBusinessStatus, string> = {
  selling: 'Đang kinh doanh',
  paused: 'Tạm ngừng',
  discontinued: 'Ngừng nhập',
  archived: 'Lưu trữ',
};

/** Hậu quả của từng thao tác, hiện trong hộp xác nhận */
const ACTION_EFFECT: Record<VariantBusinessAction, string> = {
  pause: 'Listing trên các sàn bị ẩn cho đến khi bỏ tạm ngừng. Hàng vẫn nhập và giữ tồn như cũ.',
  unpause: 'Listing đang ẩn hiện lại trên sàn.',
  discontinue:
    'Không nhập thêm: SKU rời gợi ý nhập lại và không thêm được vào đề nghị nhập. Hàng còn tồn vẫn bán tiếp; listing đang ẩn vì tạm ngừng sẽ hiện lại.',
  reactivate: 'SKU nhập và bán lại như bình thường.',
  archive:
    'SKU ẩn khỏi danh sách, listing trên các sàn bị gỡ. Chỉ lưu trữ được khi tồn, hàng đang về, hàng chờ xử lý đều bằng 0 và không còn chứng từ mở.',
  restore: 'SKU quay về Ngừng nhập với SKU cũ.',
};

/** Nhãn cha suy từ con ("Đang bán 4/6") kèm nhãn phụ Chờ hoàn thiện, Có lỗi */
export function ParentStatus({ item }: { item: ProductListItem }) {
  const { label, text } = parentLabel(item.labelCounts);
  return (
    <span className="flex flex-wrap items-center gap-1" data-testid="product-status">
      <Badge variant={MAIN_LABEL_META[label].variant} data-status={label}>
        {text}
      </Badge>
      {label !== 'archived' && item.incompleteCount > 0 && (
        <Badge variant="warning" data-flag="incomplete">
          Chờ hoàn thiện
        </Badge>
      )}
      {label !== 'archived' && item.errorCount > 0 && (
        <Badge variant="destructive" data-flag="error">
          Có lỗi
        </Badge>
      )}
    </span>
  );
}

/** Trạng thái kinh doanh đang có trong các SKU con, suy từ số đếm nhãn */
function childStatuses(item: ProductListItem): VariantBusinessStatus[] {
  const c = item.labelCounts;
  return (
    [
      c.live + c.pending + c.not_listed > 0 && 'selling',
      c.paused > 0 && 'paused',
      c.discontinued > 0 && 'discontinued',
      c.archived > 0 && 'archived',
    ] as const
  ).filter((s): s is VariantBusinessStatus => Boolean(s));
}

/** Thao tác trên cha: có ít nhất một SKU con làm được. Khôi phục chỉ khi cả sản phẩm đã lưu trữ */
export function parentActions(item: ProductListItem): VariantBusinessAction[] {
  const statuses = childStatuses(item);
  return BUSINESS_ACTIONS.filter((action) => {
    if (action === 'restore') return item.status === 'archived';
    if (item.status === 'archived') return false;
    return variantMachine.transitions.some(
      (t) => t.action === action && statuses.some((s) => (typeof t.from === 'string' ? t.from === s : t.from.includes(s))),
    );
  });
}

export interface ActionChoice {
  action: VariantBusinessAction;
  /** Có lý do thì mục bị khoá và hiện lý do bên dưới */
  blocked?: string[];
}

export function BusinessActionMenu({ label, choices, onSelect }: {
  label: string;
  choices: ActionChoice[];
  onSelect: (action: VariantBusinessAction) => void;
}) {
  if (!choices.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {choices.map(({ action, blocked }) => (
          <DropdownMenuItem
            key={action}
            disabled={Boolean(blocked?.length)}
            onSelect={() => onSelect(action)}
            className="flex-col items-start gap-0.5"
          >
            <span>{actionLabel(action)}</span>
            {blocked?.length ? (
              <span className="text-xs text-muted-foreground" data-testid="archive-blockers">
                {blocked.join('; ')}
              </span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface BusinessTarget {
  productId: string;
  /** Tên sản phẩm hoặc SKU, dùng trong hộp xác nhận và thông báo */
  name: string;
  action: VariantBusinessAction;
  variantIds?: string[];
}

function resultToast(target: BusinessTarget, result: BusinessStatusResult) {
  const label = actionLabel(target.action);
  const blocked = result.skipped.filter((s) => s.reasons.length);
  const lines = blocked.map((s) => `${s.sku}: ${s.reasons.join('; ')}`);
  if (!result.applied.length) {
    toast.warning(`Chưa ${label.toLowerCase()} được ${target.name}`, {
      description: lines.join('\n') || 'Không SKU nào làm được thao tác này.',
    });
    return;
  }
  const scope = target.variantIds ? target.name : `${result.applied.length} SKU của ${target.name}`;
  if (blocked.length) {
    toast.warning(`${label}: ${scope}. ${blocked.length} SKU chưa làm được`, { description: lines.join('\n') });
  } else {
    toast.success(`${label}: ${scope}`);
  }
}

/** Hộp xác nhận và gọi API đổi trạng thái kinh doanh, dùng chung cho danh sách và trang sản phẩm */
export function useBusinessAction() {
  const [target, setTarget] = useState<BusinessTarget | null>(null);
  const mut = useChangeBusinessStatus();

  const confirm = async () => {
    if (!target) return;
    try {
      const result = await mut.mutateAsync({
        productId: target.productId,
        action: target.action,
        variantIds: target.variantIds,
      });
      resultToast(target, result);
    } catch (e) {
      if (problemCode(e) === 'archive_blocked') toast.warning(getErrorMessage(e));
      else toast.error(problemMessage(e));
    }
    setTarget(null);
  };

  const dialog = (
    <ConfirmDialog
      open={Boolean(target)}
      title={target ? `${actionLabel(target.action)} ${target.name}?` : ''}
      message={
        target && (
          <>
            {!target.variantIds && <>Áp cho mọi SKU làm được thao tác này. </>}
            {ACTION_EFFECT[target.action]}
          </>
        )
      }
      confirmLabel={target ? actionLabel(target.action) : ''}
      destructive={target?.action === 'archive'}
      loading={mut.isPending}
      onConfirm={confirm}
      onClose={() => setTarget(null)}
    />
  );

  return { request: setTarget, dialog };
}
