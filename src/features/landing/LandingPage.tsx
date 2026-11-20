import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, FileText, ListChecks, Package, Store, TrendingUp, Warehouse, type LucideIcon } from 'lucide-react';
import kienScreenshot from '@/assets/landing-kien.jpg';
import { BrandLogo } from '@/components/common/BrandLogo';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/router/routes';
import { LANDING_FEATURES, LANDING_RULES, LANDING_STEPS, type LandingFeatureIcon } from './landingContent';

const FEATURE_ICONS: Record<LandingFeatureIcon, LucideIcon> = {
  warehouse: Warehouse,
  store: Store,
  package: Package,
  money: Banknote,
};
const RULE_ICONS: LucideIcon[] = [ListChecks, TrendingUp, FileText];

function IconBox({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
      <Icon className="size-5" aria-hidden />
    </span>
  );
}

/** Hai nút dẫn vào luồng đăng ký (commerio-backend#459) và đăng nhập */
function Actions({ className, loginLabel = 'Đăng nhập' }: { className?: string; loginLabel?: string }) {
  return (
    <div className={className ?? 'flex flex-wrap gap-3'}>
      <Button asChild size="lg" className="h-11 px-5 font-semibold">
        <Link to={ROUTES.register}>Đăng ký công ty</Link>
      </Button>
      <Button asChild size="lg" variant="outline" className="h-11 px-5">
        <Link to={ROUTES.login}>{loginLabel}</Link>
      </Button>
    </div>
  );
}

function Section({ id, title, subtitle, children }: { id?: string; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="py-14 sm:py-16">
      <div className="mx-auto max-w-6xl px-4">
        <h2 id={id ? `${id}-title` : undefined} className="text-2xl leading-tight font-semibold sm:text-3xl">
          {title}
        </h2>
        {subtitle && <p className="mt-2 mb-8 max-w-2xl text-base text-muted-foreground">{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}

/**
 * Trang giới thiệu ở `/` cho người chưa đăng nhập (FE#401, Documents/27 US-CT-14, phương án A).
 * Trang tĩnh, không gọi API. Người đã đăng nhập không tới đây (`HomeRedirect`).
 */
export function LandingPage() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <a
        href="#landing-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
      >
        Bỏ qua tới nội dung chính
      </a>
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link to={ROUTES.home} className="flex items-center gap-2.5 rounded-md" aria-label="Commerio, trang đầu">
            <BrandLogo size={30} />
            <span className="text-base font-semibold">Commerio</span>
          </Link>
          <nav aria-label="Mục trên trang" className="ml-4 hidden gap-1 md:flex">
            <a href="#luong" className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground">
              Chức năng
            </a>
            <a href="#kiem-soat" className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground">
              Kiểm soát
            </a>
          </nav>
          <span className="flex-1" />
          <Button asChild variant="outline" className="hidden h-10 px-4 sm:inline-flex">
            <Link to={ROUTES.login}>Đăng nhập</Link>
          </Button>
          <Button asChild className="h-10 px-4 font-semibold">
            <Link to={ROUTES.register}>Đăng ký công ty</Link>
          </Button>
        </div>
      </header>

      <main id="landing-main">
        <section className="border-b bg-card py-12 sm:py-16">
          <div className="mx-auto max-w-6xl px-4">
            <p className="mb-4 inline-flex rounded-full border border-primary-border bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">
              Cho người bán trên Lazada và TikTok Shop
            </p>
            <h1 className="max-w-3xl text-3xl leading-tight font-bold sm:text-5xl sm:leading-tight">
              Một chỗ cho hàng, kho, đơn và tiền của shop đa sàn
            </h1>
            <p className="mt-4 mb-6 max-w-2xl text-lg text-muted-foreground">
              Nhập hàng từ nhà cung cấp, đẩy sản phẩm lên gian hàng, nhận đơn về đóng gói, rồi đối chiếu tiền sàn trả. Tồn
              và giá lấy từ Commerio, nên hai sàn không bán quá số hàng đang có.
            </p>
            <Actions loginLabel="Tôi đã có tài khoản" />
            <p className="mt-3 text-sm text-muted-foreground">
              Đăng ký bằng email và mã số thuế, xác minh bằng mã gửi qua email. Xong là vào thẳng công ty của bạn.
            </p>
            <ul aria-label="Sàn kết nối được" className="mt-5 flex flex-wrap gap-2">
              {['Lazada', 'TikTok Shop'].map((p) => (
                <li key={p} className="rounded-md border bg-card px-3 py-1 text-sm font-semibold text-muted-foreground">
                  {p}
                </li>
              ))}
            </ul>
            <figure className="mt-10">
              <img
                src={kienScreenshot}
                width={1920}
                height={960}
                alt="Màn Kiện hàng của Commerio: các tab chờ đóng gói, đã đóng gói, chờ lấy hàng, đang vận chuyển, và bảng kiện kèm hạn bàn giao"
                className="h-auto w-full rounded-xl border shadow-card"
              />
              <figcaption className="mt-2 text-sm text-muted-foreground">
                Màn Kiện hàng trên bản thử, dữ liệu thử. Tên gian hàng đã làm mờ.
              </figcaption>
            </figure>
          </div>
        </section>

        <Section
          id="luong"
          title="Từ nhà cung cấp tới tiền về tài khoản"
          subtitle="Mỗi bước có người làm và người duyệt rõ ràng. Hàng đi tới đâu thì số tồn đổi theo phiếu tới đó."
        >
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {LANDING_STEPS.map((s, i) => (
              <li key={s.title} className="rounded-lg border bg-card p-4 shadow-card">
                <span
                  aria-hidden
                  className="mb-3 grid size-7 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                >
                  {i + 1}
                </span>
                <h3 className="text-base font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
                <p className="mt-2 text-xs text-muted-foreground">{s.who}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section
          title="Làm được gì trong Commerio"
          subtitle="Chức năng dưới đây đều đang chạy trên bản thử của Commerio."
        >
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {LANDING_FEATURES.map((f) => (
              <li key={f.title} className="rounded-lg border bg-card p-5 shadow-card">
                <IconBox icon={FEATURE_ICONS[f.icon]} />
                <h3 className="mt-3 text-base font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
              </li>
            ))}
          </ul>
        </Section>

        <section id="kiem-soat" aria-labelledby="kiem-soat-title" className="py-14 sm:py-16">
          <div className="mx-auto grid max-w-6xl items-center gap-6 px-4 lg:grid-cols-2">
            <div>
              <h2 id="kiem-soat-title" className="text-2xl leading-tight font-semibold sm:text-3xl">
                Số tồn và số tiền không ai sửa tay
              </h2>
              <p className="mt-2 max-w-xl text-base text-muted-foreground">
                Tồn chỉ đổi qua phiếu. Việc quan trọng cần người thứ hai duyệt. Mọi thao tác ghi nhật ký.
              </p>
            </div>
            <ul className="grid gap-3">
              {LANDING_RULES.map((r, i) => (
                <li key={r.title} className="flex gap-3 rounded-lg border bg-card p-4 shadow-card">
                  <IconBox icon={RULE_ICONS[i] ?? FileText} />
                  <p className="text-sm text-muted-foreground">
                    <strong className="font-semibold text-foreground">{r.title}</strong> {r.text}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="pb-16">
          <div className="mx-auto max-w-6xl px-4">
            <div className="rounded-xl bg-primary px-6 py-10 text-center text-primary-foreground">
              <h2 className="text-2xl leading-tight font-semibold sm:text-3xl">Bắt đầu với công ty của bạn</h2>
              <p className="mx-auto mt-2 mb-6 max-w-xl text-base opacity-90">
                Đăng ký bằng email và mã số thuế, nhập mã OTP gửi qua email, rồi vào thẳng công ty của bạn.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button asChild size="lg" variant="outline" className="h-11 border-transparent bg-card px-5 font-semibold text-primary hover:bg-accent">
                  <Link to={ROUTES.register}>Đăng ký công ty</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-11 border-white/60 bg-transparent px-5 text-primary-foreground hover:border-white hover:bg-white/10 hover:text-primary-foreground"
                >
                  <Link to={ROUTES.login}>Đăng nhập</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        Phần mềm quản lý bán hàng đa kênh · © 2026 Commerio
      </footer>
    </div>
  );
}
