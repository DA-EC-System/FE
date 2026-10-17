import { useState, type ComponentProps } from 'react';
import { Eye, EyeOff } from 'lucide-react';
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
        className="pe-10"
        {...props}
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={disabled}
        className="absolute end-1 top-1/2 size-7 -translate-y-1/2 text-muted-foreground"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
      >
        {visible ? <EyeOff /> : <Eye />}
      </Button>
    </div>
  );
}
