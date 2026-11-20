import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Banknote,
  Boxes,
  Check,
  PackageCheck,
  Store,
  Undo2,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import heroShot from '@/assets/landing/hero-kien.jpg';
import heroShotMobile from '@/assets/landing/hero-kien-mobile.jpg';
import { BrandLogo } from '@/components/common/BrandLogo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/routes';
import { LANDING_MODULES, LANDING_STEPS, type LandingModuleIcon, type LandingTint } from './landingContent';

/**
 * Trang giới thiệu ở `/` cho người chưa đăng nhập (FE#401, Documents/27 US-CT-14), bản v3.
 * Ngôn ngữ thiết kế tham khảo odoo.com: hero căn giữa chữ rất lớn, một cụm từ tô kiểu bút dạ, dải nền cong chứa lưới
 * phân hệ (bấm cuộn tới phần giải thích), khối chữ và ảnh màn thật xen kẽ, CTA cuối căn giữa.
 * Màu, chữ, icon là của Commerio (theme.css, lucide). Trang tĩnh, không gọi API; người đã đăng nhập không tới đây.
 */

const MODULE_ICONS: Record<LandingModuleIcon, LucideIcon> = {
  catalog: Boxes,
  inventory: Warehouse,
  shops: Store,
  packages: PackageCheck,
  returns: Undo2,
  money: Banknote,
};
const TINTS: Record<LandingTint, string> = {
  primary: 'bg-accent text-accent-foreground',
  info: 'bg-info-soft text-info-text',
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  purple: 'bg-purple-soft text-purple-text',
  destructive: 'bg-destructive-soft text-destructive-text',
};
const TINT_TEXT: Record<LandingTint, string> = {
  primary: 'text-accent-foreground',
  info: 'text-info-text',
  success: 'text-success-text',
  warning: 'text-warning-text',
  purple: 'text-purple-text',
  destructive: 'text-destructive-text',
};

const CONTAINER = 'mx-auto w-full max-w-[1160px] px-4 sm:px-6';
const SHOT_SHADOW = 'shadow-[0_12px_40px_-12px_rgba(15,23,42,0.25)]';
/** Dải nền cong kiểu mái vòm ở đầu khối lưới phân hệ */
const DOME = { borderTopLeftRadius: '50% 72px', borderTopRightRadius: '50% 72px' };

/** Cụm từ tô nổi kiểu bút dạ: một mảng màu nghiêng nhẹ nằm sau chữ */
function Marker({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      <span
        aria-hidden
        className="absolute inset-x-[-0.12em] top-[0.2em] bottom-[0.06em] -z-10 -rotate-[1.5deg] rounded-[0.3em_0.5em_0.35em_0.6em] bg-warning/60 dark:bg-warning/35"
      />
      {children}
    </span>
  );
}

/** Gạch chân nét tay dưới một cụm từ */
function Scribble({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      {children}
      <svg
        aria-hidden
        viewBox="0 0 200 12"
        preserveAspectRatio="none"
        className="absolute inset-x-0 -bottom-[0.2em] h-[0.32em] w-full text-primary"
      >
        <path d="M2 8 C 50 2, 120 2, 198 6" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function ModuleIcon({ icon, className }: { icon: LandingModuleIcon; className?: string }) {
  const Icon = MODULE_ICONS[icon];
  return <Icon className={className} strokeWidth={1.75} aria-hidden />;
}

export function LandingPage() {
  return (
    <div className="min-h-dvh bg-card text-foreground">
      <a
        href="#landing-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
      >
        Bỏ qua tới nội dung chính
      </a>

      <header className="sticky top-0 z-20 bg-card/90 backdrop-blur-md">
        <div className={cn(CONTAINER, 'flex h-16 items-center gap-2')}>
          <Link
            to={ROUTES.home}
            className="mr-auto flex items-center gap-2 rounded-md"
            aria-label="Commerio, trang đầu"
          >
            <BrandLogo size={28} />
            <span className="hidden text-lg font-bold min-[400px]:inline">Commerio</span>
          </Link>
          <nav aria-label="Mục trên trang" className="mr-2 hidden gap-1 md:flex">
            <a
              href="#phan-he"
              className="rounded-md px-3 py-2 text-[15px] font-medium text-foreground-2 hover:text-foreground"
            >
              Phân hệ
            </a>
            <a
              href="#bay-buoc"
              className="rounded-md px-3 py-2 text-[15px] font-medium text-foreground-2 hover:text-foreground"
            >
              Bảy bước
            </a>
          </nav>
          <Button asChild variant="ghost" className="h-10 px-3 text-[15px] font-medium">
            <Link to={ROUTES.login}>Đăng nhập</Link>
          </Button>
          <Button asChild className="h-10 px-4 font-semibold">
            <Link to={ROUTES.register}>Đăng ký công ty</Link>
          </Button>
        </div>
      </header>

      <main id="landing-main">
        <section className={cn(CONTAINER, 'isolate pt-12 pb-16 text-center sm:pt-20 sm:pb-20')}>
          <h1 className="mx-auto max-w-4xl text-balance text-[40px] leading-[1.12] font-bold tracking-[-0.025em] sm:text-6xl lg:text-7xl">
            <Marker>Một số tồn</Marker> cho mọi gian hàng trên sàn
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-xl leading-snug font-semibold text-foreground-2 sm:text-3xl">
            Hàng, kho, đơn và tiền trong <Scribble>một phần mềm</Scribble>
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-6 text-base font-semibold">
              <Link to={ROUTES.register}>
                Đăng ký công ty
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="h-12 px-6 text-base font-medium">
              <Link to={ROUTES.login}>Đăng nhập</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Cho người bán trên Lazada và TikTok Shop</p>
        </section>

        <section
          id="phan-he"
          aria-labelledby="phan-he-title"
          className="scroll-mt-16 bg-background pt-12 pb-20 sm:pt-16"
          style={DOME}
        >
          <div className={CONTAINER}>
            <figure className="mx-auto max-w-4xl">
              <picture>
                <source media="(min-width: 640px)" srcSet={heroShot} width={1640} height={584} />
                <img
                  src={heroShotMobile}
                  width={1080}
                  height={584}
                  alt="Màn Kiện hàng của Commerio: các tab chờ đóng gói, đã đóng gói, chờ lấy hàng và bảng kiện kèm hạn bàn giao"
                  fetchPriority="high"
                  className={cn('h-auto w-full rounded-xl border bg-card', SHOT_SHADOW)}
                />
              </picture>
              <figcaption className="mt-3 text-center text-[13px] text-muted-foreground">
                Màn Kiện hàng trên bản thử, dữ liệu thử.
              </figcaption>
            </figure>

            <h2
              id="phan-he-title"
              className="mt-16 text-center text-3xl leading-tight font-bold tracking-[-0.015em] sm:text-4xl"
            >
              Sáu phân hệ, một luồng hàng
            </h2>
            <ul className="mx-auto mt-10 grid max-w-3xl grid-cols-3 gap-x-4 gap-y-8 sm:grid-cols-6">
              {LANDING_MODULES.map((m) => (
                <li key={m.id}>
                  <a href={`#${m.id}`} className="group flex flex-col items-center gap-2.5 rounded-xl p-1 text-center">
                    <span
                      className={cn(
                        'grid size-16 place-items-center rounded-2xl shadow-sm ring-1 ring-black/5 transition-transform duration-200 group-hover:-translate-y-1 motion-reduce:transition-none sm:size-[72px]',
                        TINTS[m.tint],
                      )}
                    >
                      <ModuleIcon icon={m.icon} className="size-8" />
                    </span>
                    <span className="text-sm font-medium">{m.name}</span>
                  </a>
                </li>
              ))}
            </ul>
            <p className="mx-auto mt-10 max-w-2xl text-center text-lg leading-relaxed text-foreground-2">
              Sản phẩm, tồn và giá nằm ở Commerio. Sàn lo giao vận. Mỗi thay đổi về tồn đều có phiếu, có người duyệt.
            </p>
          </div>
        </section>

        <div className={cn(CONTAINER, 'py-8')}>
          {LANDING_MODULES.map((m, i) => (
            <section
              key={m.id}
              id={m.id}
              aria-labelledby={`${m.id}-title`}
              className={cn(
                'grid scroll-mt-20 items-center gap-8 py-12 sm:py-16 lg:gap-14',
                i % 2 === 1 ? 'lg:grid-cols-[7fr_5fr]' : 'lg:grid-cols-[5fr_7fr]',
              )}
            >
              <div className={cn(i % 2 === 1 && 'lg:order-2')}>
                <p className={cn('flex items-center gap-2 text-sm font-semibold', TINT_TEXT[m.tint])}>
                  <ModuleIcon icon={m.icon} className="size-4" />
                  {m.name}
                </p>
                <h2
                  id={`${m.id}-title`}
                  className="mt-3 text-balance text-[28px] leading-tight font-bold tracking-[-0.015em] sm:text-4xl"
                >
                  {m.title}
                </h2>
                <p className="mt-4 text-[17px] leading-relaxed text-foreground-2">{m.text}</p>
                <ul className="mt-5 space-y-2.5">
                  {m.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-base">
                      <Check className="mt-1 size-4 shrink-0 text-success" aria-hidden />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <img
                src={m.shot.src}
                width={m.shot.width}
                height={m.shot.height}
                alt={m.shot.alt}
                loading="lazy"
                decoding="async"
                className={cn('h-auto w-full rounded-xl border bg-card', SHOT_SHADOW, i % 2 === 1 && 'lg:order-1')}
              />
            </section>
          ))}
        </div>

        <section id="bay-buoc" aria-labelledby="bay-buoc-title" className="scroll-mt-16 bg-background py-20">
          <div className={CONTAINER}>
            <h2
              id="bay-buoc-title"
              className="isolate text-center text-3xl leading-tight font-bold tracking-[-0.015em] sm:text-4xl"
            >
              <Marker>Bảy bước</Marker> của một món hàng
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-center text-lg text-foreground-2">
              Từ đề nghị nhập tới tiền sàn trả về, bước nào cũng có người làm rõ ràng.
            </p>
            <ol className="mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {LANDING_STEPS.map((s, i) => (
                <li
                  key={s.title}
                  className="flex items-center gap-4 rounded-xl bg-card p-4 shadow-sm ring-1 ring-black/5"
                >
                  <span
                    aria-hidden
                    className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-base font-bold text-primary-foreground"
                  >
                    {i + 1}
                  </span>
                  <span>
                    <span className="block text-base font-semibold">{s.title}</span>
                    <span className="block text-sm text-muted-foreground">{s.who}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="cta-title" className={cn(CONTAINER, 'py-24 text-center')}>
          <h2
            id="cta-title"
            className="mx-auto max-w-3xl text-4xl leading-[1.15] font-bold tracking-[-0.02em] sm:text-6xl"
          >
            Bắt đầu với công ty của bạn
            <span className="mt-1 block text-primary">trên Lazada và TikTok Shop</span>
          </h2>
          <div className="mt-10">
            <Button asChild size="lg" className="h-12 px-7 text-base font-semibold">
              <Link to={ROUTES.register}>
                Đăng ký công ty
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
          <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">
            Đăng ký bằng email và mã số thuế, nhập mã OTP gửi qua email, rồi vào thẳng công ty của bạn.
          </p>
        </section>
      </main>

      <footer className="border-t">
        <div className={cn(CONTAINER, 'flex flex-wrap justify-between gap-2 py-6 text-[13px] text-muted-foreground')}>
          <span>Commerio · Đồ án chuyên ngành, Trường Đại học Bách khoa</span>
          <span>© 2026 Commerio</span>
        </div>
      </footer>
    </div>
  );
}
