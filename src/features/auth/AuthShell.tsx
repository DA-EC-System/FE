import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/common/BrandLogo';
import { cn } from '@/lib/utils';

interface AuthShellProps {
  title: string;
  subtitle?: ReactNode;
  /** Form rộng hơn (trang đăng ký) */
  wide?: boolean;
  children: ReactNode;
}

/** Khung chung cho đăng nhập, đăng ký công ty, đổi mật khẩu: nền --background, thẻ trắng giữa trang (FE#130). */
export function AuthShell({ title, subtitle, wide, children }: AuthShellProps) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-8 sm:py-12">
      <main
        className={cn(
          'w-full rounded-xl border bg-card p-6 text-card-foreground shadow-card sm:p-8',
          wide ? 'max-w-2xl' : 'max-w-md',
        )}
      >
        <div className="mb-6 flex items-center gap-2.5">
          <BrandLogo size={30} />
          <span className="text-base font-semibold">Commerio</span>
        </div>
        <div className="mb-6 space-y-1">
          <h1 className="text-2xl leading-tight font-semibold">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
      </main>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Hệ thống quản lý đa kênh cho doanh nghiệp · © 2026 Commerio
      </p>
    </div>
  );
}

/** Đường kẻ ngang có chữ ở giữa ("hoặc", "Tài khoản demo") */
export function DividerText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 text-xs text-muted-foreground', className)}>
      <span className="h-px flex-1 bg-border" />
      {children}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
