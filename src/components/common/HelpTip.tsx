import type { MouseEvent, ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsTouch } from '@/hooks/useIsTouch';
import { cn } from '@/lib/utils';
import { helpTipLabel, helpTipMode, type HelpTipMode } from './helpTipMode';

export interface HelpTipProps {
  /** Phần giải thích; chuỗi ngắn (≤ 2 câu) hiện thành Tooltip, dài hơn hoặc có link thì thành Popover */
  content: ReactNode;
  /** Chủ đề được giải thích (nhãn ô, tên cột…), ghép vào `aria-label` để phân biệt nhiều nút "?" */
  topic?: ReactNode;
  /** Mở hướng dẫn từng bước của trang; có thì hiện link "Xem hướng dẫn từng bước" và luôn dùng Popover */
  onTour?: () => void;
  /** Ép cách hiện thay vì chọn theo độ dài */
  mode?: HelpTipMode;
  className?: string;
}

/**
 * Nút "?" cạnh tiêu đề, nhãn ô nhập hoặc đầu cột (FE#131). Thay cho đoạn hướng dẫn dài luôn hiện:
 * người dùng quen rồi không phải đọc lại, người mới rê chuột, Tab tới hoặc chạm để xem.
 */
export function HelpTip({ content, topic, onTour, mode, className }: HelpTipProps) {
  const touch = useIsTouch();
  const resolved = mode && !(touch && mode === 'tooltip') ? mode : helpTipMode(content, { touch, hasLink: Boolean(onTour) });
  const label = helpTipLabel(topic);

  const trigger = (
    <button
      type="button"
      aria-label={label}
      data-help-mode={resolved}
      // Nằm trong dòng bảng hay nhãn ô nhập: bấm "?" không được mở dòng, không focus ô
      onClick={(e: MouseEvent) => e.stopPropagation()}
      className={cn(
        'relative inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full align-middle text-muted-foreground transition-colors',
        'hover:text-foreground-2 focus-visible:text-foreground-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        // Vùng chạm rộng hơn biểu tượng 14px
        'after:absolute after:-inset-1.5 after:content-[""]',
        className,
      )}
    >
      <CircleHelp className="size-3.5" aria-hidden />
    </button>
  );

  if (resolved === 'tooltip') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent className="max-w-64 font-normal">{content}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto max-w-80 p-3 text-sm leading-relaxed font-normal whitespace-normal"
        // Popover trong dòng bảng bấm được: bấm bên trong không mở dòng
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid gap-2">
          <div className="text-foreground-2">{content}</div>
          {onTour && (
            <button
              type="button"
              className="justify-self-start text-primary-text hover:text-primary-hover hover:underline"
              onClick={onTour}
            >
              Xem hướng dẫn từng bước
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
