import { useEffect, useMemo, useRef, useState } from 'react';
import { useAllRemoteProducts } from '@/api/setupDraft.api';
import { groupCounts, groupRows, suggestedGroupsToWrite } from './setupDraft';
import type { SetupDraftState } from './useSetupDraft';

/** Trần phần tử `groups` mỗi lần gọi `sku-links` (§18.12) */
const GROUPS_PER_CALL = 200;

/**
 * Dữ liệu bước 4 Danh mục sản phẩm: mọi sản phẩm sàn có SKU sẽ tạo, danh mục lấy từ nháp. Mở bước thì ghi danh mục gợi ý
 * cho sản phẩm chưa có danh mục (acn-fe chốt 24/11/2026, không đè lựa chọn của người dùng) và báo số đã áp.
 */
export function useGroupStep(shopId: string, state: SetupDraftState, enabled: boolean) {
  const products = useAllRemoteProducts(shopId, 'create', enabled);
  const rows = useMemo(() => groupRows(products.data ?? [], state.draft), [products.data, state.draft]);
  const [applied, setApplied] = useState<number | null>(null);
  const wrote = useRef(false);
  const { writeGroups } = state;

  useEffect(() => {
    if (!enabled || wrote.current || !products.data || !state.view.data) return;
    wrote.current = true;
    const todo = suggestedGroupsToWrite(rows);
    if (!todo.length) return;
    void (async () => {
      let done = 0;
      for (let i = 0; i < todo.length; i += GROUPS_PER_CALL) {
        const chunk = todo.slice(i, i + GROUPS_PER_CALL);
        const out = await writeGroups(chunk);
        if (!out.ok) break;
        done += chunk.length;
      }
      if (done) setApplied(done);
    })();
  }, [enabled, products.data, state.view.data, rows, writeGroups]);

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

