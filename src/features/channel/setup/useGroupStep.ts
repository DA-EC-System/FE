import { useEffect, useMemo, useRef, useState } from 'react';
import { useAllRemoteProducts } from '@/api/setupDraft.api';
import { groupCounts, groupRows, suggestedGroupsToWrite } from './setupDraft';
import type { SetupDraftState } from './useSetupDraft';

/** Trần phần tử `groups` mỗi lần gọi `sku-links` (§18.12) */
const GROUPS_PER_CALL = 200;

/**
 * Dữ liệu bước 4 Danh mục sản phẩm: mọi sản phẩm sàn có SKU sẽ tạo, danh mục lấy từ nháp. `active`: đang ở bước 4; chỉ
 * khi đó mới đọc danh sách (đọc mới mỗi lần vào bước) và ghi danh mục gợi ý cho sản phẩm chưa có danh mục (acn-fe chốt
 * 24/11/2026, không đè lựa chọn của người dùng), rồi báo số đã áp. Ghi lỗi thì lần vào bước sau mới thử lại (không thử lại liền, tránh vòng lặp khi lỗi quyền).
 */
export function useGroupStep(shopId: string, state: SetupDraftState, active: boolean) {
  const products = useAllRemoteProducts(shopId, 'create', active);
  const rows = useMemo(() => groupRows(products.data ?? [], state.draft), [products.data, state.draft]);
  const [applied, setApplied] = useState<number | null>(null);
  const wrote = useRef(false);
  const enteredAt = useRef(0);
  const { writeGroups } = state;

  useEffect(() => {
    if (active) enteredAt.current = Date.now();
    else wrote.current = false;
  }, [active]);

  useEffect(() => {
    // Chờ lượt đọc bắt đầu sau khi vào bước, để không áp gợi ý theo danh sách cũ trong cache
    const fresh = products.isSuccess && !products.isFetching && products.dataUpdatedAt >= enteredAt.current;
    if (!active || wrote.current || !fresh || !state.view.data) return;
    wrote.current = true;
    const todo = suggestedGroupsToWrite(rows);
    if (!todo.length) return;
    void (async () => {
      // Xếp mọi phần vào hàng đợi cùng lúc: lựa chọn người dùng bấm trong lúc ghi nằm sau, không bị phần gợi ý đè
      const chunks: (typeof todo)[] = [];
      for (let i = 0; i < todo.length; i += GROUPS_PER_CALL) chunks.push(todo.slice(i, i + GROUPS_PER_CALL));
      const outs = await Promise.all(chunks.map((c) => writeGroups(c)));
      const done = chunks.reduce((n, c, i) => n + (outs[i].ok ? c.length : 0), 0);
      if (done) setApplied(done);
    })();
  }, [active, products.isSuccess, products.isFetching, products.dataUpdatedAt, state.view.data, rows, writeGroups]);

  const counts = groupCounts(rows);
  return {
    products,
    rows,
    counts,
    applied,
    missing: counts.missing,
    firstMissing: rows.find((r) => r.source === 'none')?.externalProductId ?? null,
  };
}

export type GroupStepData = ReturnType<typeof useGroupStep>;

