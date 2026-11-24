import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useFinishSetupFromDraft } from '@/api/setupDraft.api';
import type { ShopSetupResult } from '@/types/shop';
import { setupIssues, type SetupIssue } from './setupDraft';
import type { SetupDraftState } from './useSetupDraft';

/** Câu toast sau khi hoàn tất (design v2.html s6run; chữ cũ ở ShopSetupPage, đổi "phiếu kiểm kho" thành "phiếu kiểm kê đầu kỳ") */
export function finishedMessage(done: ShopSetupResult): string {
  const details = [
    done.matched ? `liên kết ${done.matched} SKU sàn` : null,
    done.created ? `tạo ${done.created} SKU kho` : null,
    done.stocktakeNumber ? `tạo phiếu kiểm kê đầu kỳ ${done.stocktakeNumber}` : null,
  ].filter(Boolean);
  return `${done.shop.shopName} đã thiết lập xong${details.length ? `: ${details.join(', ')}` : ''}`;
}

/**
 * Hoàn tất thiết lập từ nháp (`POST /setup { draftVersion }`, §18.7.5). Lỗi 422 và 409 `setup_draft_incomplete` đổi
 * thành danh sách chỗ sửa (bước, dòng); lỗi khác là một câu chung. Một giao dịch nên lỗi là không tạo gì.
 */
export function useFinishSetup(shopId: string, state: SetupDraftState) {
  const finish = useFinishSetupFromDraft(shopId);
  const [issues, setIssues] = useState<SetupIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ShopSetupResult | null>(null);
  const startedAt = useRef(0);

  const run = async () => {
    setIssues([]);
    setError(null);
    try {
      const done = await finish.mutateAsync(state.draftVersion);
      startedAt.current = Date.now();
      setResult(done);
      toast.success(finishedMessage(done));
      return done;
    } catch (e) {
      const p = getProblem(e);
      const found = setupIssues(p, state.draft);
      if (found.length) setIssues(found);
      else if (p?.code === 'version_conflict') {
        setError('Bản nháp vừa được sửa ở tab hoặc máy khác. Đã tải bản mới nhất; xem lại rồi bấm Hoàn tất lại.');
        void state.reload();
      } else setError(problemMessage(e));
      return null;
    }
  };

  return { run, pending: finish.isPending, issues, error, result, startedAt };
}

export type FinishSetupState = ReturnType<typeof useFinishSetup>;
