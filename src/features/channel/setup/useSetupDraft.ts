import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getProblem } from '@/api/client';
import { setupDraftKeys, useSaveCreateGroups, useSaveSetupDraft, useSetupDraftView } from '@/api/setupDraft.api';
import { useAuthStore } from '@/stores/authStore';
import type { CreateGroup, DraftStep, SetupDraftInput, ShopSetupDraftView } from '@/types/setupDraft';

/** Kết quả một lần ghi: `invalid` là 422 (lỗi theo ô, bên gọi tự hiện); các lỗi khác hook giữ để hiện thanh báo */
export type DraftWriteOutcome = { ok: true } | { ok: false; invalid: boolean; error: unknown };

/**
 * Ghi bản nháp thiết lập theo hàng đợi (Documents/21 §18.7.5): mỗi lần ghi đọc `draftVersion` mới nhất trong cache lúc
 * chạy, nên hai lần ghi liền nhau không tự gây 409. Lỗi chia ba loại để wizard hiện đúng thanh báo (design v2.html
 * s3state): 409 `version_conflict` (tab khác vừa sửa, "Tải bản mới nhất"), 409 `invalid_transition` (gian hàng mất uỷ
 * quyền, phải Kết nối lại), lỗi mạng hoặc 5xx ("Chưa lưu được nháp", "Lưu lại").
 */
export function useSetupDraft(shopId: string, enabled: boolean) {
  const qc = useQueryClient();
  const companyId = useAuthStore((s) => s.companyContext?.companyId ?? '');
  const view = useSetupDraftView(shopId, enabled);
  const saveDraft = useSaveSetupDraft(shopId);
  const saveGroups = useSaveCreateGroups(shopId);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const lastFailed = useRef<(() => Promise<DraftWriteOutcome>) | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [pending, setPending] = useState(0);

  const currentVersion = useCallback(
    () => qc.getQueryData<ShopSetupDraftView>(setupDraftKeys.view(companyId, shopId))?.draftVersion ?? 0,
    [qc, companyId, shopId],
  );

  const run = useCallback(
    (write: (draftVersion: number) => Promise<unknown>): Promise<DraftWriteOutcome> => {
      const attempt = (): Promise<DraftWriteOutcome> => {
        setPending((n) => n + 1);
        const next = queue.current.then(async (): Promise<DraftWriteOutcome> => {
          try {
            await write(currentVersion());
            setSavedAt(new Date());
            setSaveError(false);
            lastFailed.current = null;
            return { ok: true };
          } catch (e) {
            const p = getProblem(e);
            if (p?.status === 422) return { ok: false, invalid: true, error: e };
            if (p?.code === 'version_conflict') setConflict(true);
            else if (p?.code === 'invalid_transition') setNeedsReauth(true);
            else if (!p?.status || p.status >= 500) {
              setSaveError(true);
              lastFailed.current = attempt;
            }
            return { ok: false, invalid: false, error: e };
          } finally {
            setPending((n) => n - 1);
          }
        });
        queue.current = next;
        return next;
      };
      return attempt();
    },
    [currentVersion],
  );

  const save = useCallback(
    (input: Omit<SetupDraftInput, 'draftVersion' | 'confirm'>) =>
      run((draftVersion) => saveDraft.mutateAsync({ ...input, draftVersion })),
    [run, saveDraft],
  );
  const confirm = useCallback(
    (step: DraftStep) => run((draftVersion) => saveDraft.mutateAsync({ confirm: step, draftVersion })),
    [run, saveDraft],
  );
  const writeGroups = useCallback(
    (groups: CreateGroup[]) => run((draftVersion) => saveGroups.mutateAsync({ groups, draftVersion })),
    [run, saveGroups],
  );

  /** "Tải bản mới nhất": bỏ lựa chọn chưa lưu ở tab này, đọc lại nháp */
  const reload = useCallback(async () => {
    setConflict(false);
    setSaveError(false);
    lastFailed.current = null;
    await qc.invalidateQueries({ queryKey: setupDraftKeys.view(companyId, shopId) });
  }, [qc, companyId, shopId]);

  const retry = useCallback(() => lastFailed.current?.(), []);

  return {
    view,
    draft: view.data?.draft ?? null,
    draftVersion: view.data?.draftVersion ?? 0,
    save,
    confirm,
    writeGroups,
    saving: pending > 0,
    savedAt,
    saveError,
    retry,
    conflict,
    reload,
    needsReauth,
  };
}

export type SetupDraftState = ReturnType<typeof useSetupDraft>;
