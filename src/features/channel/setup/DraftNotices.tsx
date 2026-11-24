import { Loader2, RefreshCw, Save } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/utils/format';
import { changedNotice } from './setupDraft';
import type { SetupDraftState } from './useSetupDraft';

/**
 * Thanh báo của bản nháp thiết lập (design v2.html s3state, s3back): tab khác vừa sửa (409 `version_conflict`), chưa lưu
 * được (lỗi mạng, 5xx), gian hàng mất uỷ quyền (409 `invalid_transition`), SKU sàn đổi so với lúc xác nhận
 * (`draft.changed`). `onReconnect`: nút tới chỗ Kết nối lại, khác nhau giữa wizard và trang thiết lập.
 */
export function DraftNotices({ state, onReconnect }: { state: SetupDraftState; onReconnect?: () => void }) {
  const changed = changedNotice(state.draft);
  return (
    <>
      {state.conflict && (
        <AlertMessage severity="warning">
          <p>
            <b className="font-semibold">Bản nháp vừa được sửa ở tab hoặc máy khác.</b> Tải bản mới nhất để không ghi đè. Lựa chọn chưa lưu ở
            tab này sẽ bỏ.
          </p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => void state.reload()}>
            <RefreshCw />
            Tải bản mới nhất
          </Button>
        </AlertMessage>
      )}
      {state.saveError && !state.conflict && (
        <AlertMessage severity="warning">
          <b className="font-semibold">Chưa lưu được nháp.</b> Lựa chọn vẫn còn trên trang này nhưng tải lại sẽ mất.{' '}
          <Button size="sm" variant="link" className="h-auto p-0" onClick={() => void state.retry()}>
            Lưu lại
          </Button>
        </AlertMessage>
      )}
      {state.needsReauth && (
        <AlertMessage severity="error">
          <b className="font-semibold">Commerio mất quyền truy cập gian hàng nên chưa lưu được nháp.</b> Kết nối lại bằng đúng tài khoản người
          bán của gian hàng này; lựa chọn đã lưu vẫn giữ.
          <span className="mt-2 flex flex-wrap gap-2">
            {onReconnect && (
              <Button size="sm" onClick={onReconnect}>
                <RefreshCw />
                Kết nối lại
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => void state.reload()}>
              Đã kết nối lại, tải lại nháp
            </Button>
          </span>
        </AlertMessage>
      )}
      {state.writeError && <AlertMessage severity="error">{state.writeError}</AlertMessage>}
      {changed && (
        <AlertMessage severity="warning">
          {changed}
        </AlertMessage>
      )}
    </>
  );
}

/** Dòng "Đã lưu nháp lúc HH:MM" (design v2.html `draftOk`) */
export function DraftSavedLine({ state }: { state: SetupDraftState }) {
  if (state.saving)
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
        <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
        Đang lưu nháp...
      </p>
    );
  if (!state.savedAt) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
      <Save className="size-3.5" aria-hidden />
      Đã lưu nháp lúc {formatDate(state.savedAt.toISOString(), "HH:mm")}.
    </p>
  );
}
