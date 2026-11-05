import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BlockedReason } from './BlockedReason';

interface RowActionProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
  /** Có lý do thì nút bị khoá và tooltip hiện lý do */
  reason?: string | null;
  destructive?: boolean;
}

/** Nút biểu tượng trên dòng bảng kèm tooltip tên nút; bị khoá thì tooltip hiện lý do (BlockedReason) */
export function RowAction({ label, onClick, children, reason, destructive }: RowActionProps) {
  const button = (
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
  );

  if (reason) {
    // Nút disabled không nhận focus, chuột: bọc span để Tab và rê chuột vẫn tới được lý do
    return (
      <BlockedReason reason={reason}>
        <span tabIndex={0} className="inline-flex">
          {button}
        </span>
      </BlockedReason>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
