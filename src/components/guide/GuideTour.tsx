import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { useAuth } from '@/hooks/useAuth';
import { findGuideTarget, visibleSteps } from '@/guides/steps';
import type { PageGuide } from '@/guides/types';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Khoảng sáng chừa quanh phần tử */
const PAD = 6;

interface GuideTourProps {
  guide: PageGuide;
  /** `done`: đi hết các bước (bấm "Xong"); false khi bỏ qua giữa chừng */
  onClose: (done: boolean) => void;
}

/**
 * Tour từng bước: lớp phủ tối khoét sáng quanh phần tử `data-guide`, thẻ gợi ý (Radix Popover) đặt cạnh phần tử.
 * Bước thiếu phần tử (thiếu quyền, phân hệ tắt, danh sách rỗng) bị bỏ. Esc đóng, ←/→ chuyển bước, focus nằm trong thẻ.
 */
export function GuideTour({ guide, onClose }: GuideTourProps) {
  const { companyContext } = useAuth();
  // Lấy danh sách bước một lần lúc mở tour
  const [steps] = useState(() => visibleSteps(guide.steps, companyContext));
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const step = steps[index];
  const last = index === steps.length - 1;
  // Hàm đóng của cha đổi mỗi lần render; giữ trong ref để effect đo vị trí không chạy lại vô hạn
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (steps.length === 0) closeRef.current(false);
  }, [steps.length]);

  useLayoutEffect(() => {
    if (!step) return;
    const el = findGuideTarget(step.target);
    if (!el) {
      // Phần tử biến mất giữa chừng: sang bước sau
      if (last) closeRef.current(true);
      else setIndex((i) => i + 1);
      return;
    }
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    const update = () => setRect(el.getBoundingClientRect());
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      ro.disconnect();
    };
  }, [step, last]);

  if (!step || !rect) return null;

  const go = (delta: number) => {
    const n = index + delta;
    if (n < 0) return;
    if (n >= steps.length) onClose(true);
    else setIndex(n);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(-1);
    }
  };

  return (
    <Popover open modal onOpenChange={(o) => !o && onClose(false)}>
      <PopoverAnchor asChild>
        <div
          aria-hidden
          data-testid="guide-spotlight"
          className="pointer-events-none fixed z-50 rounded-lg ring-2 ring-primary transition-[top,left,width,height] duration-200 motion-reduce:transition-none"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.45)',
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        key={step.target}
        data-testid="guide-tour"
        role="dialog"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        side="bottom"
        align="start"
        sideOffset={PAD + 8}
        collisionPadding={16}
        className="w-80 max-w-[calc(100vw-2rem)] p-4"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          nextRef.current?.focus();
        }}
        // Bấm ra ngoài không đóng tour, tránh mất giữa chừng; đóng bằng "Bỏ qua" hoặc Esc
        onInteractOutside={(e) => e.preventDefault()}
        onKeyDown={onKeyDown}
      >
        <p className="text-xs text-muted-foreground">
          Bước {index + 1}/{steps.length}
        </p>
        <h2 id={titleId} className="mt-1 text-base font-semibold">
          {step.title}
        </h2>
        <p id={bodyId} className="mt-1.5 text-sm leading-relaxed text-foreground-2">
          {step.body}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <Button variant="ghost" className="-ms-3" onClick={() => onClose(false)}>
            Bỏ qua
          </Button>
          <div className="ms-auto flex gap-2">
            <Button variant="outline" disabled={index === 0} onClick={() => go(-1)}>
              Quay lại
            </Button>
            <Button ref={nextRef} onClick={() => go(1)}>
              {last ? 'Xong' : 'Tiếp'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
