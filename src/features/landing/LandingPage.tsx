import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Boxes,
  Package,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import kienScreenshot from '@/assets/landing-kien.jpg';
import { BrandLogo } from '@/components/common/BrandLogo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/routes';
import {
  LANDING_FEATURES,
  LANDING_ROLES,
  LANDING_STEPS,
  type LandingFeatureIcon,
  type LandingRoleIcon,
  type LandingTint,
} from './landingContent';

/**
 * Trang giới thiệu ở `/` cho người chưa đăng nhập (FE#401, Documents/27 US-CT-14).
 * Bố cục, nhịp chữ, khoảng trắng theo bản Thành duyệt 27/10/2026 (Test_UI site/onboarding.html, site/commerio.css):
 * thanh trên dính, hero hai cột kèm ảnh màn thật, #feat, #how, #who, khối CTA. Màu lấy token của FE (theme.css).
 * Trang tĩnh, không gọi API. Người đã đăng nhập không tới đây (`HomeRedirect`).
 */

const FEATURE_ICONS: Record<LandingFeatureIcon, LucideIcon> = {
  variants: Boxes,
  warehouse: Warehouse,
  store: Store,
  package: Package,
  money: Wallet,
  shield: ShieldCheck,
};
const ROLE_ICONS: Record<LandingRoleIcon, LucideIcon> = {
  ceo: ShieldCheck,
  admin: Settings,
  sale: ShoppingCart,
  warehouse: Warehouse,
};
const TINTS: Record<LandingTint, string> = {
  primary: 'bg-accent text-accent-foreground',
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  purple: 'bg-purple-soft text-purple-text',
  destructive: 'bg-destructive-soft text-destructive-text',
};

const CONTAINER = 'mx-auto w-full max-w-[1160px] px-4 sm:px-5';

function Tinted({ icon: Icon, tint }: { icon: LucideIcon; tint: LandingTint }) {
  return (
    <span className={cn('grid size-10 shrink-0 place-items-center rounded-[10px]', TINTS[tint])}>
      <Icon className="size-5" aria-hidden />
    </span>
  );
}

function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-16 border-t py-14">
      <h2 id={`${id}-title`} className="text-2xl leading-tight font-bold tracking-[-0.01em] sm:text-[28px]">
        {title}
      </h2>
      {lead && <p className="mt-2 max-w-2xl text-[15px] text-muted-foreground">{lead}</p>}
      {children}
    </section>
  );
}

const NAV = [
  { href: '#feat', label: 'Tính năng' },
  { href: '#how', label: 'Cách làm việc' },
  { href: '#who', label: 'Vai trò' },
];

export function LandingPage() {
  return (
    <div className="min-h-dvh bg-card text-foreground">
      <a
        href="#landing-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
      >
        Bỏ qua tới nội dung chính
      </a>

      <header className="sticky top-0 z-20 border-b bg-card/90 backdrop-blur-md">
        <div className={cn(CONTAINER, 'flex h-16 items-center gap-3')}>
          <Link to={ROUTES.home} className="mr-3 flex items-center gap-2 rounded-md" aria-label="Commerio, trang đầu">
            <BrandLogo size={28} />
            <span className="hidden text-base font-bold min-[400px]:inline">Commerio</span>
          </Link>
          <nav aria-label="Mục trên trang" className="hidden flex-1 gap-0.5 md:flex">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="rounded-md px-2.5 py-2 text-sm font-medium text-foreground-2 transition-colors hover:bg-muted hover:text-foreground"
              >
                {n.label}
              </a>
            ))}
          </nav>
          <span className="flex-1 md:hidden" />
          <Button asChild variant="outline" className="h-10 px-3 font-medium sm:px-4">
            <Link to={ROUTES.login}>Đăng nhập</Link>
          </Button>
          <Button asChild className="h-10 px-3 font-semibold sm:px-4">
            <Link to={ROUTES.register}>Đăng ký công ty</Link>
          </Button>
        </div>
      </header>

      <main id="landing-main" className={CONTAINER}>
        <section className="grid items-center gap-10 pt-10 pb-14 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:pt-16">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-[13px] font-semibold text-accent-foreground">
              <Store className="size-3.5" aria-hidden />
              Cho người bán trên Lazada và TikTok Shop
            </span>
            <h1 className="mt-3.5 mb-4 text-[32px] leading-[1.15] font-bold tracking-[-0.015em] sm:text-[44px]">
              Hàng hoá, kho, đơn và thu chi trong một phần mềm
            </h1>
            <p className="mb-6 max-w-[540px] text-[17px] leading-relaxed text-foreground-2">
              Nhập hàng, đăng lên sàn, đóng gói đơn và đối soát tiền sàn trả. Một số tồn dùng chung cho mọi gian hàng.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <Button asChild size="lg" className="h-11 px-5 font-semibold">
                <Link to={ROUTES.register}>
                  Đăng ký công ty
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 px-5 font-medium">
                <Link to={ROUTES.login}>Đăng nhập</Link>
              </Button>
            </div>
          </div>
          <figure className="rounded-2xl border border-primary-border/60 bg-linear-to-br from-accent to-card p-3 sm:p-[18px]">
            <img
              src={kienScreenshot}
              width={2096}
              height={1090}
              alt="Màn Kiện hàng của Commerio: các tab chờ đóng gói, đã đóng gói, chờ lấy hàng, đang vận chuyển và bảng kiện kèm hạn bàn giao"
              className="h-auto w-full rounded-lg border shadow-card"
            />
            <figcaption className="mt-2.5 px-1 text-[13px] text-muted-foreground">
              Màn Kiện hàng trên bản thử, dữ liệu thử, tên gian hàng đã làm mờ.
            </figcaption>
          </figure>
        </section>

        <Section
          id="feat"
          title="Đủ cho chuỗi bán hàng đa sàn"
          lead="Từ lúc nhập hàng tới lúc tiền sàn trả về tài khoản."
        >
          <ul className="mt-6 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {LANDING_FEATURES.map((f) => (
              <li key={f.title} className="rounded-lg border bg-card p-[18px] shadow-card">
                <Tinted icon={FEATURE_ICONS[f.icon]} tint={f.tint} />
                <h3 className="mt-2.5 mb-1 text-base font-semibold">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.text}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          id="how"
          title="Bảy bước của một món hàng"
          lead="Mỗi bước có người làm rõ ràng. Hàng đi tới đâu, số tồn đổi theo phiếu tới đó."
        >
          <ol className="mt-6 grid gap-x-3.5 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
            {LANDING_STEPS.map((s, i) => (
              <li key={s.title} className="border-l-2 border-accent py-0.5 pl-4">
                <span
                  aria-hidden
                  className="mb-2.5 grid size-7 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                >
                  {i + 1}
                </span>
                <h3 className="text-base font-semibold">{s.title}</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">{s.text}</p>
                <p className="mt-1.5 text-[13px] font-medium text-foreground-2">{s.who}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section
          id="who"
          title="Mỗi vai trò một phạm vi"
          lead="Bốn vai trò có sẵn. CEO tạo thêm vai trò tuỳ biến bằng cách chọn quyền."
        >
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {LANDING_ROLES.map((r) => (
              <li key={r.title} className="flex items-start gap-3 rounded-[10px] border bg-card p-4 shadow-card">
                <Tinted icon={ROLE_ICONS[r.icon]} tint={r.tint} />
                <div>
                  <h3 className="text-base font-semibold">{r.title}</h3>
                  <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{r.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <section aria-labelledby="cta-title" className="pb-14">
          <div className="flex flex-wrap items-center justify-between gap-5 rounded-2xl bg-linear-to-br from-primary to-primary-active p-7 text-primary-foreground sm:p-9">
            <div>
              <h2 id="cta-title" className="text-2xl leading-tight font-bold sm:text-[28px]">
                Thử với dữ liệu của cửa hàng bạn
              </h2>
              <p className="mt-1 max-w-xl text-[15px] opacity-90">
                Đăng ký bằng email và mã số thuế, nhập mã OTP gửi qua email, rồi vào thẳng công ty của bạn.
              </p>
            </div>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-11 border-transparent bg-card px-5 font-semibold text-primary hover:bg-accent"
            >
              <Link to={ROUTES.register}>
                Đăng ký công ty
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className={CONTAINER}>
        <div className="flex flex-wrap justify-between gap-2 border-t py-6 text-[13px] text-muted-foreground">
          <span>Commerio · Đồ án chuyên ngành, Trường Đại học Bách khoa</span>
          <span>© 2026 Commerio</span>
        </div>
      </footer>
    </div>
  );
}
