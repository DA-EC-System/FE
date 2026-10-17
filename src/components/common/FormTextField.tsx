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
  /** Gợi ý dưới ô; bị thay bằng lỗi khi có lỗi */
  description?: ReactNode;
  /** Ô mật khẩu có nút hiện/ẩn */
  password?: boolean;
}

/** Ô nhập một dòng gắn với react-hook-form: nhãn, ô, gợi ý hoặc lỗi (thay cho TextField của MUI). */
export function FormTextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  password,
  className,
  ...inputProps
}: FormTextFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            {password ? (
              <PasswordInput {...inputProps} {...field} value={field.value ?? ''} />
            ) : (
              <Input {...inputProps} {...field} value={field.value ?? ''} />
            )}
          </FormControl>
          {fieldState.error ? (
            <FormMessage />
          ) : (
            description && <FormDescription>{description}</FormDescription>
          )}
        </FormItem>
      )}
    />
  );
}
