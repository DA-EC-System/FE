import { useState, type ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type PasswordInputProps = Omit<ComponentProps<'input'>, 'type'>;

/**
 * Ô mật khẩu có nút hiện/ẩn (theo password-input của shadcn-admin).
 * Dùng được trong `FormControl` hoặc trực tiếp với `register()` của react-hook-form.
 */
export function PasswordInput({ className, disabled, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={cn('relative', className)}>
      <Input
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        className="pe-14"
        {...props}
      />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        className="absolute end-1 top-1/2 h-7 -translate-y-1/2 px-2 text-xs text-muted-foreground"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
      >
        {visible ? 'Ẩn' : 'Hiện'}
      </Button>
    </div>
  );
}
