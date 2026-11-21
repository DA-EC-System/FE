import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { MoneyInput } from '@/components/common/MoneyInput';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import type { SuggestConfig } from '@/types/catalog';
import { SUGGEST_KEYS } from './suggest';

// Cách tính theo Documents/21 §5.2 "Cấu hình gợi ý" và mục gợi ý nhập lại (minQty)
const FIELDS: Record<keyof SuggestConfig, { label: string; hint: string }> = {
  marginCoefficient: {
    label: 'Hệ số lãi',
    hint: 'Giá muốn thực nhận gợi ý = giá nhập gần nhất × hệ số. 1,4 là lãi 40%.',
  },
  priceRounding: { label: 'Làm tròn giá gợi ý', hint: 'Giá gợi ý làm tròn lên theo bước này, ví dụ 1.000 đ.' },
  reorderLeadDays: {
    label: 'Số ngày chờ hàng về',
    hint: 'Gợi ý nhập lại = bán trung bình mỗi ngày (30 ngày gần nhất) × số ngày này + tồn an toàn.',
  },
  reorderSafetyQty: { label: 'Tồn an toàn', hint: 'Số lượng cộng thêm vào gợi ý nhập lại để phòng bán nhanh hơn dự kiến.' },
  reorderDefaultQty: {
    label: 'Số lượng nhập khi chưa bán',
    hint: 'SKU chưa bán trong 30 ngày gần nhất thì gợi ý nhập lại số này.',
  },
};

interface SuggestFieldsProps<T extends FieldValues> {
  control: Control<T>;
  /** Tên nhóm ô trong form, vd "suggest" */
  name: string;
  /** Chữ mờ khi ô trống: ở nhóm hàng là giá trị theo công ty, ở công ty là "Không gợi ý" */
  placeholder: (key: keyof SuggestConfig) => string;
  disabled?: boolean;
}

/** Năm ô gợi ý dùng chung cho form nhóm hàng và trang Cài đặt sản phẩm (FE#350) */
export function SuggestFields<T extends FieldValues>({ control, name, placeholder, disabled }: SuggestFieldsProps<T>) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {SUGGEST_KEYS.map((key) => (
        <FormField
          key={key}
          control={control}
          name={`${name}.${key}` as FieldPath<T>}
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel hint={FIELDS[key].hint}>{FIELDS[key].label}</FormLabel>
              <FormControl>
                {key === 'priceRounding' ? (
                  <MoneyInput
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                    placeholder={placeholder(key)}
                    disabled={disabled}
                    aria-invalid={Boolean(fieldState.error)}
                  />
                ) : (
                  <Input
                    {...field}
                    value={field.value ?? ''}
                    inputMode={key === 'marginCoefficient' ? 'decimal' : 'numeric'}
                    placeholder={placeholder(key)}
                    disabled={disabled}
                    aria-invalid={Boolean(fieldState.error)}
                  />
                )}
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ))}
    </div>
  );
}
