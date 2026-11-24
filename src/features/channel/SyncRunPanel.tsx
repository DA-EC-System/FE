import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SyncRun } from '@/types/shop';
import { syncErrorFix, syncErrorTitle, syncRunActive, syncRunErrorFix, syncRunHeadline } from './syncRun';

const SHOWN_ERRORS = 20;

/**
 * Hộp kết quả lượt đồng bộ ở trang gian hàng (bản phác `trang-san-pham-tab/design/v2.html` màn 2, chốt v2 câu 6;
 * Documents/21 §18.5 `SyncRun`): đang chạy thì tiến độ; xong thì số thành công, số lỗi, mỗi dòng lỗi kèm lý do và nút tới
 * chỗ sửa. Lượt vừa xong thì báo `onFinished` để tải lại danh sách.
 */
export function SyncRunPanel({
  run,
  companyId,
  onFinished,
  onClose,
}: {
  run: SyncRun;
  companyId: string;
  onFinished: () => void;
  onClose: () => void;
}) {
  const active = syncRunActive(run);
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active) onFinished();
    wasActive.current = active;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ khi lượt đổi từ đang chạy sang xong
  }, [active]);

  const tone = active ? 'info' : run.status === 'failed' || run.failed ? 'warning' : 'success';
  const Icon = active ? Loader2 : tone === 'success' ? CheckCircle2 : AlertTriangle;
  const shown = run.errors.slice(0, SHOWN_ERRORS);
  const runFix = syncRunErrorFix(run, companyId);

  return (
    <section
      className={cn(
        'mb-4 flex gap-3 rounded-lg border p-3',
        tone === 'info' && 'border-info-border bg-info-soft',
        tone === 'warning' && 'border-warning-border bg-warning-soft',
        tone === 'success' && 'border-success-border bg-success-soft',
      )}
      data-testid="sync-run"
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', active && 'animate-spin motion-reduce:animate-none')} aria-hidden />
      <div className="grid min-w-0 flex-1 gap-1.5 text-sm">
        {/* Chỉ câu chính là vùng thông báo, không đọc lại cả danh sách lỗi mỗi lần hỏi lại */}
        <p role="status" aria-live="polite" className="font-medium">
          {syncRunHeadline(run)}
        </p>
        {runFix && (
          <div>
            <Button asChild variant="outline" size="sm" className="h-7">
              <Link to={runFix.href}>
                {runFix.label}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        )}
        {active && <p className="text-xs text-muted-foreground">Có thể rời trang; quay lại vẫn thấy kết quả.</p>}
        {shown.length > 0 && (
          <ul className="grid gap-1.5">
            {shown.map((e) => {
              const fix = syncErrorFix(e, companyId);
              return (
                <li key={e.listingId} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>
                    <b>{syncErrorTitle(e)}</b>: {e.message}
                    {e.platformMessage && <span className="text-muted-foreground"> (sàn báo: {e.platformMessage})</span>}
                  </span>
                  {fix &&
                    (fix.href ? (
                      <Button asChild variant="outline" size="sm" className="h-7">
                        <Link to={fix.href}>
                          {fix.label}
                          <ArrowRight aria-hidden />
                        </Link>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">{fix.label}</span>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
        {run.failed > shown.length && (
          <p className="text-xs text-muted-foreground">
            Còn {run.failed - shown.length} SKU lỗi khác; xem cột Trạng thái ở bảng dưới.
          </p>
        )}
      </div>
      {!active && (
        <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Đóng kết quả đồng bộ" onClick={onClose}>
          <X />
        </Button>
      )}
    </section>
  );
}
