import type { ComponentProps, MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ActionButtonProps extends ComponentProps<typeof Button> {
  /** Lý do không làm được: nút hiện mờ, rê chuột hoặc focus thấy lý do (Test_UI) */
  blockedReason?: string | null;
}

/**
 * Nút thao tác chuyển trạng thái. Người dùng có quyền nhưng bị luật chặn (cần người thứ hai, thiếu dữ liệu…)
 * thì vẫn thấy nút, mờ đi kèm lý do, thay vì nút biến mất. Thiếu quyền thì nơi gọi không vẽ nút.
 * Dùng `aria-disabled` chứ không `disabled` để nút còn nhận focus và hiện tooltip.
 */
export function ActionButton({ blockedReason, onClick, className, ...props }: ActionButtonProps) {
  if (!blockedReason) return <Button onClick={onClick} className={className} {...props} />;

  const stop = (e: MouseEvent<HTMLButtonElement>) => e.preventDefault();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          {...props}
          aria-disabled="true"
          data-blocked-reason={blockedReason}
          onClick={stop}
          className={cn('cursor-not-allowed opacity-45 hover:opacity-45', className)}
        />
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{blockedReason}</TooltipContent>
    </Tooltip>
  );
}
