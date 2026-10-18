import type { ReactNode } from 'react';

/** Một ô thông tin: nhãn nhỏ ở trên, giá trị ở dưới */
export function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}
