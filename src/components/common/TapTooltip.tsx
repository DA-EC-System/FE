import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface TapTooltipProps {
  content: ReactNode;
  /** Phần tử nhận focus được (nút, span có tabIndex); Tooltip gắn thẳng vào nó */
  children: ReactElement;
  className?: string;
}

/**
 * Tooltip một câu, mở khi rê chuột, khi focus bằng bàn phím và khi chạm (Radix Tooltip tự nó không mở khi chạm).
 * Esc hoặc rời focus thì đóng. Dùng cho lý do nút bị khoá và giải thích trạng thái.
 */
export function TapTooltip({ content, children, className }: TapTooltipProps) {
  const [open, setOpen] = useState(false);
  // Radix đóng tooltip ngay khi nhấn xuống, nên nhớ trạng thái trước cú chạm để chạm lần hai thì đóng
  const tap = useRef({ touch: false, wasOpen: false });

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        asChild
        onPointerDown={(e) => {
          tap.current = { touch: e.pointerType === 'touch', wasOpen: open };
        }}
        onClick={(e) => {
          if (!tap.current.touch) return;
          // Chặn Radix đóng tooltip sau cú chạm, và chặn cú chạm lan lên dòng bảng bấm được
          e.preventDefault();
          e.stopPropagation();
          setOpen(!tap.current.wasOpen);
        }}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent className={cn('max-w-64', className)}>{content}</TooltipContent>
    </Tooltip>
  );
}
