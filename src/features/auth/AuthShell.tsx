import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/common/BrandLogo';
import { cn } from '@/lib/utils';
import { brandGradient } from '@/theme/tokens';

interface AuthShellProps {
  title: string;
  subtitle?: ReactNode;
  /** Form rộng hơn (trang đăng ký) */
  wide?: boolean;
  children: ReactNode;
}

/** Khung chung cho đăng nhập, đăng ký công ty, đổi mật khẩu: panel thương hiệu bên trái, form bên phải. */
export function AuthShell({ title, subtitle, wide, children }: AuthShellProps) {
  return (
    <div className="flex min-h-svh items-stretch bg-background">
      <aside
        style={{ background: brandGradient }}
        className={cn(
          'sticky top-0 hidden h-svh flex-col justify-between p-12 text-white md:flex',
          wide ? 'flex-[0.8]' : 'flex-1',
        )}
      >
        <div className="flex items-center gap-3">
          <BrandLogo size={40} onDark />
          <span className="text-2xl font-extrabold">Commerio</span>
        </div>

        <div>
          <h2 className="mb-4 text-4xl leading-tight font-extrabold lg:text-5xl">
            Hệ thống quản lý
            <br />
            đa kênh cho doanh nghiệp
          </h2>
          <p className="max-w-[480px] opacity-85">
            Một trang quản lý vận hành bán hàng cho nhiều công ty, đồng bộ sản phẩm, tồn kho và đơn
            hàng từ Shopee, Lazada, TikTok Shop và kênh tin nhắn về một nơi duy nhất.
          </p>
        </div>

        <p className="text-xs opacity-60">© 2026 Commerio · Đồ án chuyên ngành — HCMUT</p>
      </aside>

      <main className="flex flex-1 items-center justify-center p-4 sm:p-6 md:p-12">
        <div
          className={cn(
            'w-full rounded-xl border bg-card p-6 text-card-foreground md:p-10',
            wide ? 'max-w-2xl' : 'max-w-md',
          )}
        >
          <div className="mb-6 flex items-center gap-3 md:hidden">
            <BrandLogo size={32} />
            <span className="text-lg font-extrabold">Commerio</span>
          </div>
          <div className="mb-6 space-y-1.5">
            <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
            {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
        </div>
      </main>
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
