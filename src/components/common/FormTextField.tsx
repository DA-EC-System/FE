import type { ComponentProps, ReactNode } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PasswordInput } from './PasswordInput';

interface FormTextFieldProps<T extends FieldValues> extends Omit<
  ComponentProps<'input'>,
  'name' | 'defaultValue' | 'value' | 'onChange'
> {
  control: Control<T>;
  name: FieldPath<T>;
  label: ReactNode;
  /** Gợi ý dưới ô; bị thay bằng lỗi khi có lỗi. Gợi ý cách điền thì dùng `hint` */
  description?: ReactNode;
  /** Gợi ý cách điền sau nút "?" cạnh nhãn; lỗi kiểm dữ liệu vẫn hiện dưới ô */
  hint?: ReactNode;
  /** Ô mật khẩu có nút hiện/ẩn */
  password?: boolean;
  /** Bộ đếm ký tự dưới ô, bên phải, hiện cả khi có lỗi (vd "24/200 · tối thiểu 25") */
  counter?: ReactNode;
}

/** Ô nhập một dòng gắn với react-hook-form: nhãn, ô, gợi ý hoặc lỗi (thay cho TextField của MUI). */
export function FormTextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  hint,
  password,
  counter,
  className,
  ...inputProps
}: FormTextFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem className={className}>
          <FormLabel hint={hint}>{label}</FormLabel>
          <FormControl>
            {password ? (
              <PasswordInput {...inputProps} {...field} value={field.value ?? ''} />
            ) : (
              <Input {...inputProps} {...field} value={field.value ?? ''} />
            )}
          </FormControl>
          {counter ? (
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                {fieldState.error ? <FormMessage /> : description && <FormDescription>{description}</FormDescription>}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{counter}</span>
            </div>
          ) : fieldState.error ? (
            <FormMessage />
          ) : (
            description && <FormDescription>{description}</FormDescription>
          )}
        </FormItem>
      )}
    />
  );
}
