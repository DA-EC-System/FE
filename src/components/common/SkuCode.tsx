import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface SkuCodeProps {
  code: string;
  /** Gợi ý khi rê chuột hoặc Tab tới, vd "Xem thẻ kho" */
  hint?: string;
  /** Có thì mã là nút bấm (mở thẻ kho, chi tiết biến thể) */
  onClick?: () => void;
  className?: string;
}

/**
 * Mã SKU kiểu `.sku` của Test_UI v4 (FE#136): chữ đơn cách 12.5px, gạch chân chấm. Có `onClick` thì là nút,
 * rê chuột hiện gợi ý; bấm không mở dòng của bảng.
 */
export function SkuCode({ code, hint, onClick, className }: SkuCodeProps) {
  const cls = cn(
    'font-mono text-[12.5px] font-medium text-foreground underline decoration-input decoration-dotted underline-offset-4',
    onClick &&
      'cursor-pointer rounded-sm hover:text-primary-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
    className,
  );
  if (!onClick) return <span className={cls}>{code}</span>;

  const button = (
    <button
      type="button"
      className={cls}
      aria-label={hint ? `${hint} ${code}` : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {code}
    </button>
  );
  if (!hint) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}
