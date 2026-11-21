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

interface RowTextActionProps {
  /** Chữ trên nút (UI không dùng icon, Thành chốt 22/11/2026) */
  children: string;
  onClick: () => void;
  /** Có lý do thì nút bị khoá và tooltip hiện lý do */
  reason?: string | null;
  destructive?: boolean;
  /** Tên đầy đủ cho trình đọc màn hình khi chữ trên nút ngắn, vd "Xoá Áo thun" */
  label?: string;
}

/** Nút chữ trên dòng bảng; bị khoá thì tooltip hiện lý do (BlockedReason) */
export function RowTextAction({ children, onClick, reason, destructive, label }: RowTextActionProps) {
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={destructive ? 'h-8 px-2 text-destructive hover:text-destructive' : 'h-8 px-2'}
      aria-label={label}
      disabled={Boolean(reason)}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </Button>
  );
  if (!reason) return button;
  return (
    <BlockedReason reason={reason}>
      <span tabIndex={0} className="inline-flex">
        {button}
      </span>
    </BlockedReason>
  );
}
