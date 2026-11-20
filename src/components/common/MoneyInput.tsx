import { type ComponentProps, type ReactNode, useId, useLayoutEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { editMoneyInput } from './moneyInputEdit';

type MoneyInputProps = Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  /** Chữ trong ô ("1.500.000"); đọc ra số bằng `parseMoney` hoặc `moneySchema` */
  value: string;
  onChange: (text: string) => void;
  /** Đơn vị bên phải ô, mặc định "đ" */
  suffix?: ReactNode;
};

/**
 * Ô nhập số tiền dùng chung (FE#385): phân cách nghìn kiểu vi-VN khi gõ, giữ vị trí con trỏ khi chèn hoặc xoá giữa
 * chuỗi, chỉ số nguyên đồng. Chữ dán vào mà mơ hồ ("150.5") thì giữ nguyên để báo lỗi khi lưu. Props giống `UnitInput`
 * (FE#381): `className` là của `input`, đơn vị nối vào `aria-describedby`.
 */
export function MoneyInput({
  value,
  onChange,
  suffix = 'đ',
  className,
  ref,
  'aria-describedby': describedBy,
  ...props
}: MoneyInputProps) {
  const suffixId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingCaret = useRef<number | null>(null);

  // Đặt con trỏ sau khi React ghi chữ đã định dạng vào ô
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (pendingCaret.current === null || !el || document.activeElement !== el) return;
    el.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  });

  return (
    <div className="relative w-full">
      <Input
        {...props}
        ref={(el) => {
          inputRef.current = el;
          if (typeof ref === 'function') ref(el);
          else if (ref) ref.current = el;
        }}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        className={cn('pr-8 text-right tabular-nums', className)}
        aria-describedby={describedBy ? `${describedBy} ${suffixId}` : suffixId}
        onChange={(e) => {
          const el = e.target;
          const inputType = (e.nativeEvent as InputEvent).inputType;
          const next = editMoneyInput(value, el.value, el.selectionStart ?? el.value.length, inputType);
          pendingCaret.current = next.caret;
          onChange(next.text);
        }}
      />
      <span
        id={suffixId}
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
      >
        {suffix}
      </span>
    </div>
  );
}
