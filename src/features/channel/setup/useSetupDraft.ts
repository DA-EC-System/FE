import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { setupDraftKeys, useApplySavedDraft, useSaveCreateGroups, useSaveSetupDraft, useSetupDraftView } from '@/api/setupDraft.api';
import { useAuthStore } from '@/stores/authStore';
import type { CreateGroup, DraftStep, SetupDraftInput, SetupDraftSaved, ShopSetupDraftView } from '@/types/setupDraft';

/** Kết quả một lần ghi: `invalid` là 422 (lỗi theo ô, bên gọi tự hiện); các lỗi khác hook giữ để hiện thanh báo (`DraftNotices`) */
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
  const apply = useApplySavedDraft(shopId);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const lastFailed = useRef<(() => Promise<DraftWriteOutcome>) | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [conflict, setConflict] = useState(false);
  /** Nháp vừa được thay bằng bản BE trả kèm 409 (người khác vừa sửa); chỉ báo, không chặn */
  const [replaced, setReplaced] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  /** Lỗi khác (403 thiếu quyền, 404, 409 mã khác...): một câu theo `problemMessage`, xoá khi lần ghi sau thành công */
  const [writeError, setWriteError] = useState<string | null>(null);
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
            setWriteError(null);
            setReplaced(false);
            // Chỉ xoá báo "chưa lưu được" khi chính lần ghi lỗi đó đã lưu lại được, không xoá vì một lần ghi khác
            if (lastFailed.current === attempt) {
              lastFailed.current = null;
              setSaveError(false);
            }
            return { ok: true };
          } catch (e) {
            const p = getProblem(e);
            if (p?.status === 422) return { ok: false, invalid: true, error: e };
            if (p?.code === 'version_conflict') {
              // Documents/21 §18.7.5 (Documents#253): 409 kèm `current: { draft, draftVersion }`, FE thay nháp đang giữ
              // bằng bản này rồi báo một dòng; thiếu `current` thì mới chặn và bắt bấm "Tải bản mới nhất"
              const cur = p.current as Partial<SetupDraftSaved> | undefined;
              if (cur?.draft && typeof cur.draftVersion === 'number') {
                const draft = cur.draft;
                const version = cur.draftVersion;
                // Giữ `changed` (chỉ GET trả) như useApplySavedDraft: baseline Liên kết SKU không đổi thì câu báo vẫn đúng
                qc.setQueryData<ShopSetupDraftView>(setupDraftKeys.view(companyId, shopId), (old) => {
                  if (!old) return old;
                  const sameBaseline = old.draft?.confirmed.link_skus === draft.confirmed.link_skus;
                  return { ...old, draft: { ...draft, changed: sameBaseline ? (old.draft?.changed ?? null) : null }, draftVersion: version };
                });
                setReplaced(true);
              } else setConflict(true);
            }
            else if (p?.code === 'invalid_transition') setNeedsReauth(true);
            else if (!p?.status || p.status >= 500) {
              setSaveError(true);
              lastFailed.current = attempt;
            } else setWriteError(problemMessage(e));
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
    [currentVersion, qc, companyId, shopId],
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
    setReplaced(false);
    setSaveError(false);
    setNeedsReauth(false);
    setWriteError(null);
    lastFailed.current = null;
    await qc.invalidateQueries({ queryKey: setupDraftKeys.view(companyId, shopId) });
  }, [qc, companyId, shopId]);

  const retry = useCallback(() => lastFailed.current?.(), []);

  /** Lần ghi nháp ngoài hook (danh sách Liên kết SKU tự ghi `items`, FE#460): đưa bản mới vào cache và dòng "Đã lưu" */
  const applySaved = useCallback(
    (draft: SetupDraftSaved['draft'], draftVersion: number) => {
      void apply({ draft, draftVersion });
      setSavedAt(new Date());
      setWriteError(null);
    },
    [apply],
  );

  return {
    view,
    draft: view.data?.draft ?? null,
    draftVersion: view.data?.draftVersion ?? 0,
    save,
    confirm,
    writeGroups,
    applySaved,
    saving: pending > 0,
    savedAt,
    saveError,
    retry,
    conflict,
    replaced,
    reload,
    needsReauth,
    writeError,
    setWriteError,
  };
}

export type SetupDraftState = ReturnType<typeof useSetupDraft>;
