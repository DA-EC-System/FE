import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface RowActionProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
  /** Có lý do thì nút bị khoá và tooltip hiện lý do */
  reason?: string | null;
  destructive?: boolean;
}

/** Nút biểu tượng trên dòng bảng kèm tooltip; bọc span để tooltip vẫn hiện khi nút bị khoá */
export function RowAction({ label, onClick, children, reason, destructive }: RowActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={reason ? 0 : undefined}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={destructive ? 'size-8 text-destructive hover:text-destructive' : 'size-8'}
            aria-label={label}
            disabled={Boolean(reason)}
            onClick={(e) => {
              // Dòng bảng có thể bấm để mở chi tiết
              e.stopPropagation();
              onClick();
            }}
          >
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason ?? label}</TooltipContent>
    </Tooltip>
  );
}
