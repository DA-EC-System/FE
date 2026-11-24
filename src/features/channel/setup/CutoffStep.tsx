import { CalendarClock, ClipboardList, CopyPlus, Link2 } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/utils/format';
import { finishSummary, SETUP_STEP_NAMES, type SetupIssue } from './setupDraft';
import type { SetupDraftState } from './useSetupDraft';
import type { FinishSetupState } from './useFinishSetup';

const n = (v: number) => v.toLocaleString('vi-VN');


/**
 * Bước 6 Đồng bộ đơn từ thời điểm nào (design v2.html s6, s6err; Documents/21 §18.7.6): mốc kéo đơn không cho chọn, chỉ
 * nói rõ; tóm tắt việc Commerio sẽ làm khi Hoàn tất; lỗi hoàn tất liệt kê từng chỗ sửa kèm nút tới đúng bước, đúng dòng.
 * Nút Hoàn tất do nơi dùng đặt (chân wizard hoặc chân thẻ của trang thiết lập).
 */
export function CutoffStep({
  state,
  finish,
  proposedCutoffAt,
  returnNote,
  onGoTo,
}: {
  state: SetupDraftState;
  finish: FinishSetupState;
  proposedCutoffAt: string | null;
  /** Câu "sàn tự đóng yêu cầu trả hàng" (returnWindowNote), null khi sàn tính theo ngày */
  returnNote: string | null;
  onGoTo: (issue: SetupIssue) => void;
}) {
  const stocktake = state.draft?.openingStock === 'stocktake';
  const sum = finishSummary(state.draft);
  return (
    <div className="grid gap-4">
      {finish.issues.length > 0 && (
        <AlertMessage severity="error">
          <p>
            <b className="font-semibold">Chưa hoàn tất được. Không có gì được tạo.</b> Có {finish.issues.length} chỗ cần sửa:
          </p>
          <ul className="mt-1.5 grid list-disc gap-1 ps-5">
            {finish.issues.map((it, i) => (
              <li key={i}>
                {SETUP_STEP_NAMES[it.step]}: {it.message}{' '}
                <Button size="sm" variant="link" className="h-auto p-0" onClick={() => onGoTo(it)}>
                  {it.rowKey ? 'Tới dòng này' : 'Tới bước này'}
                </Button>
              </li>
            ))}
          </ul>
        </AlertMessage>
      )}
      {finish.error && <AlertMessage severity="error">{finish.error}</AlertMessage>}

      <div className="flex gap-3 rounded-lg border border-success-border bg-success-soft p-4 text-sm" data-testid="proposed-cutoff">
        <CalendarClock className="mt-0.5 size-4 shrink-0 text-success-text" aria-hidden />
        <div className="grid gap-1">
          {stocktake ? (
            <p className="font-semibold">Bắt đầu lấy đơn khi phiếu kiểm kê đầu kỳ ghi sổ.</p>
          ) : (
            <p>
              <span className="font-semibold">Bắt đầu lấy đơn từ lúc bấm Hoàn tất</span>
              {proposedCutoffAt && <span className="text-muted-foreground"> (dự kiến {formatDateTime(proposedCutoffAt)})</span>}.
            </p>
          )}
          <p>
            Đơn đang mở trên sàn (đã đặt, chưa giao) được kéo về để giữ tồn. Đơn đã xử lý xong trên sàn trước mốc không đồng bộ về, tránh
            giữ tồn sai.
          </p>
        </div>
      </div>
      {returnNote && <p className="text-sm text-muted-foreground">{returnNote}</p>}

      <section className="grid gap-2" aria-labelledby="finish-summary-title">
        <h2 id="finish-summary-title" className="text-[15px] font-semibold">
          Bấm Hoàn tất, Commerio sẽ
        </h2>
        <ul className="grid gap-2 text-sm">
          {sum.skusToCreate > 0 && (
            <li className="flex items-start gap-2">
              <CopyPlus className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              Tạo {n(sum.productsToCreate)} sản phẩm, {n(sum.skusToCreate)} SKU kho từ SKU sàn, theo danh mục đã chọn ở bước 4
            </li>
          )}
          <li className="flex items-start gap-2">
            <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            {sum.skusToLink ? `Liên kết ${n(sum.skusToLink)} SKU sàn` : 'Không liên kết SKU sàn nào; liên kết sau ở trang Listing & giá'}
            {sum.unmanaged > 0 && `, ${n(sum.unmanaged)} SKU không quản tồn`}
          </li>
          {stocktake && (
            <li className="flex items-start gap-2">
              <ClipboardList className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              Tạo phiếu kiểm kê đầu kỳ nháp cho {n(sum.skusToLink)} SKU, mở ở bước 7
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
