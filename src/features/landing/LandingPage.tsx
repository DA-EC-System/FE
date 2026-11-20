import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Percent, Scale, ShieldCheck, X } from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import { BrandLogo } from '@/components/common/BrandLogo';
import { Button } from '@/components/ui/button';
import { FanCards, type FanCardItem } from '@/components/ui/fan-cards';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/routes';
import {
  LANDING_DIFFS,
  LANDING_FACTS,
  LANDING_GROUPS,
  LANDING_MARKET_NOTE,
  LANDING_ONBOARDING,
  LANDING_PAINS,
  LANDING_SCREENS,
} from './landingContent';
import './landing.css';

/**
 * Trang giới thiệu ở `/` cho người chưa đăng nhập (FE#401, Documents/27 US-CT-14), bản v4.
 * Bố cục theo trang mẫu Thành chọn: thanh trên cố định, hero nền tối có khói trôi và tiêu đề hiện từng chữ, hàng ba
 * con số, khối phân hệ dạng thẻ quạt (Spider UI Fan Cards), lưới ba ảnh màn thật, footer xanh đậm.
 * Màu lấy token của Commerio; nền tối của hero và footer pha từ `--primary`. Trang được lazy-load (router/guards.tsx).
 */

const CONTAINER = 'mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8';
/** Xanh đậm pha từ màu chính, dùng cho hero và footer ở cả hai chế độ màu */
const DEEP = 'bg-[color-mix(in_oklab,var(--primary)_22%,#070b14)]';
const ACCENT_ON_DARK = 'text-[color-mix(in_oklab,var(--primary)_55%,white)]';
const EASE = [0.22, 1, 0.36, 1] as const;

/** Tiêu đề hiện dần từng chữ; trình đọc màn hình đọc câu nguyên vẹn */
function RevealWords({ text }: { text: string }) {
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.split(' ').map((word, i) => (
          <motion.span
            key={`${word}-${i}`}
            className="inline-block whitespace-pre"
            initial={{ opacity: 0, y: '0.35em', filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.55, delay: 0.1 + i * 0.045, ease: EASE }}
          >
            {word}{' '}
          </motion.span>
        ))}
      </span>
    </>
  );
}

/** Khối hiện lên khi cuộn tới */
function FadeUp({
  children,
  className,
  delay = 0,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'li';
}) {
  const Comp = as === 'li' ? motion.li : motion.div;
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: EASE }}
    >
      {children}
    </Comp>
  );
}

const FAN_CARDS: FanCardItem[] = LANDING_GROUPS.map((g, i) => ({
  id: g.id,
  title: g.title,
  subtitle: g.text,
  bg: g.bg,
  textColor: g.textColor,
  subtitleColor: g.subtitleColor,
  defaultRotation: g.rotation,
  stackIndex: i + 1,
  content: (
    <img
      src={g.shot.src}
      width={g.shot.width}
      height={g.shot.height}
      alt={g.shot.alt}
      loading="lazy"
      decoding="async"
      className="h-full max-h-56 w-full rounded-xl object-cover object-left-top shadow-md ring-1 ring-black/10"
    />
  ),
}));

const NAV = [
  { href: '#van-de', label: 'Vấn đề' },
  { href: '#phan-he', label: 'Phân hệ' },
  { href: '#doanh-nghiep', label: 'Doanh nghiệp' },
  { href: '#man-hinh', label: 'Màn hình' },
];

const DIFF_ICONS = { scale: Scale, shield: ShieldCheck, percent: Percent };

/** Nhãn nhỏ + tiêu đề + phụ đề của một khối */
function SectionHead({
  id,
  eyebrow,
  title,
  lead,
  center = true,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  center?: boolean;
}) {
  return (
    <FadeUp className={cn('max-w-3xl', center && 'mx-auto text-center')}>
      <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">{eyebrow}</p>
      <h2 id={id} className="mt-3 text-3xl leading-tight font-bold tracking-[-0.02em] text-balance sm:text-[40px]">
        {title}
      </h2>
      {lead && <p className="mt-4 text-[17px] leading-relaxed text-foreground-2">{lead}</p>}
    </FadeUp>
  );
}

/** Đã cuộn qua phần đầu hero chưa: thanh trên trong suốt trên nền tối, có nền sáng khi cuộn xuống */
function useScrolled(offset = 24) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > offset);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [offset]);
  return scrolled;
}

export function LandingPage() {
  const scrolled = useScrolled();
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-dvh bg-background text-foreground">
        <a
          href="#landing-main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
        >
          Bỏ qua tới nội dung chính
        </a>

        <header
          className={cn(
            'fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300',
            scrolled ? 'bg-card/90 text-foreground backdrop-blur-md' : 'border-transparent bg-transparent text-white',
          )}
        >
          <div className={cn(CONTAINER, 'flex h-16 items-center gap-2 md:h-[72px]')}>
            <Link
              to={ROUTES.home}
              className="mr-auto flex items-center gap-2 rounded-md"
              aria-label="Commerio, trang đầu"
            >
              <BrandLogo size={30} />
              <span className="hidden text-lg font-bold tracking-tight min-[400px]:inline">Commerio</span>
            </Link>
            <nav aria-label="Mục trên trang" className="absolute left-1/2 hidden -translate-x-1/2 gap-1 md:flex">
              {NAV.map((n) => (
                <a
                  key={n.href}
                  href={n.href}
                  className={cn(
                    'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    scrolled ? 'text-foreground-2 hover:text-primary' : 'text-white/80 hover:text-white',
                  )}
                >
                  {n.label}
                </a>
              ))}
            </nav>
            <Button
              asChild
              variant="ghost"
              className={cn('h-10 px-3 font-medium', !scrolled && 'text-white hover:bg-white/10 hover:text-white')}
            >
              <Link to={ROUTES.login}>Đăng nhập</Link>
            </Button>
            <Button asChild className="h-10 px-4 font-semibold">
              <Link to={ROUTES.register}>Đăng ký công ty</Link>
            </Button>
          </div>
        </header>

        <main id="landing-main">
          <section className={cn('relative isolate overflow-hidden pt-28 pb-20 text-white md:pt-40 md:pb-28', DEEP)}>
            <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
              <div className="landing-smoke" />
              <div className="landing-smoke landing-smoke--slow" />
              <div className="absolute inset-0 bg-linear-to-r from-[#070b14]/80 via-[#070b14]/30 to-transparent" />
            </div>
            <div className={CONTAINER}>
              <div className="max-w-[720px]">
                <h1 className="text-[40px] leading-[1.05] font-extrabold tracking-[-0.03em] text-balance sm:text-6xl">
                  <RevealWords text="Quản lý bán hàng đa sàn cho doanh nghiệp" />
                </h1>
                <motion.p
                  className="mt-6 max-w-[600px] text-lg leading-relaxed text-white/80"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.7, ease: EASE }}
                >
                  Mỗi sàn một trang quản lý riêng nên tồn, đơn và tiền nằm rải rác. Commerio gom về một chỗ: một số tồn
                  cho mọi gian hàng, một danh sách đơn, tồn tổng để nhập hàng có căn cứ và lãi thực theo từng đơn.
                </motion.p>
                <motion.div
                  className="mt-9 flex flex-wrap gap-3"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.85, ease: EASE }}
                >
                  <Button asChild size="lg" className="h-12 px-6 text-base font-semibold">
                    <Link to={ROUTES.register}>
                      Đăng ký công ty
                      <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="h-12 border-white/25 bg-white/10 px-6 text-base font-semibold text-white hover:bg-white/20 hover:text-white"
                  >
                    <Link to={ROUTES.login}>Đăng nhập</Link>
                  </Button>
                </motion.div>
                <motion.dl
                  className="mt-12 grid grid-cols-3 gap-4 border-t border-white/15 pt-7"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.8, delay: 1.05 }}
                >
                  {LANDING_FACTS.map((f, i) => (
                    <div key={f.value}>
                      <dt className="sr-only">{f.label}</dt>
                      <dd>
                        <span
                          className={cn(
                            'block text-lg leading-tight font-bold sm:text-3xl',
                            i === 1 ? 'text-white' : ACCENT_ON_DARK,
                          )}
                        >
                          {f.value}
                        </span>
                        <span aria-hidden className="mt-1 block text-[13px] text-white/65">
                          {f.label}
                        </span>
                      </dd>
                    </div>
                  ))}
                </motion.dl>
              </div>
            </div>
          </section>

          <section id="van-de" aria-labelledby="van-de-title" className="scroll-mt-20 py-24">
            <div className={CONTAINER}>
              <SectionHead
                id="van-de-title"
                eyebrow="Vấn đề"
                title="Bán trên nhiều sàn, dữ liệu nằm ở nhiều nơi"
                lead={LANDING_MARKET_NOTE}
              />
              <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {LANDING_PAINS.map((p, i) => (
                  <FadeUp
                    key={p.title}
                    as="li"
                    delay={i * 0.08}
                    className="flex flex-col rounded-2xl bg-card p-6 shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                  >
                    <span className="text-sm font-bold text-primary">0{i + 1}</span>
                    <h3 className="mt-2 text-lg leading-snug font-semibold">{p.title}</h3>
                    <p className="mt-3 flex gap-2 text-sm leading-relaxed text-muted-foreground">
                      <X className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                      <span>
                        <span className="sr-only">Vấn đề: </span>
                        {p.pain}
                      </span>
                    </p>
                    <p className="mt-auto flex gap-2 border-t pt-4 text-sm leading-relaxed font-medium">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                      <span>
                        <span className="sr-only">Commerio: </span>
                        {p.fix}
                      </span>
                    </p>
                  </FadeUp>
                ))}
              </ul>
            </div>
          </section>

          <section id="phan-he" aria-labelledby="phan-he-title" className="scroll-mt-20 bg-card py-24">
            <div className={CONTAINER}>
              <SectionHead
                id="phan-he-title"
                eyebrow="Phân hệ"
                title="Từ kho tới tiền, mỗi phân hệ một việc rõ ràng"
                lead="Sáu phân hệ gom thành ba nhóm. Bấm vào một thẻ để xem nhóm đó làm gì."
              />
            </div>
            <div className="mx-auto h-[340px] w-full max-w-6xl overflow-x-clip sm:h-[530px] lg:h-[720px]">
              <div className="relative left-1/2 w-[900px] origin-top -translate-x-1/2 scale-[0.42] sm:scale-[0.66] lg:scale-100">
                <FanCards cards={FAN_CARDS} spread={150} className="min-h-[720px] pt-32 pb-8" />
              </div>
            </div>
            <ul className={cn(CONTAINER, 'mt-4 grid max-w-5xl gap-6 sm:grid-cols-3')}>
              {LANDING_GROUPS.map((g, i) => (
                <FadeUp key={g.id} as="li" delay={i * 0.08}>
                  <h3 className="text-base font-semibold">{g.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{g.text}</p>
                </FadeUp>
              ))}
            </ul>
          </section>

          <section id="doanh-nghiep" aria-labelledby="doanh-nghiep-title" className="scroll-mt-20 py-24">
            <div className={CONTAINER}>
              <SectionHead
                id="doanh-nghiep-title"
                eyebrow="Dành cho doanh nghiệp"
                title="Mỗi công ty một không gian riêng"
                lead="Nhiều doanh nghiệp dùng chung Commerio. Sản phẩm, kho, đơn, tiền và nhân viên của công ty nào chỉ công ty đó thấy."
              />
              <ol className="relative mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
                <span aria-hidden className="absolute top-5 right-[12%] left-[12%] hidden h-px bg-border lg:block" />
                {LANDING_ONBOARDING.map((step, i) => (
                  <FadeUp key={step.title} as="li" delay={i * 0.08} className="relative">
                    <span
                      aria-hidden
                      className="relative grid size-10 place-items-center rounded-full bg-primary text-base font-bold text-primary-foreground ring-8 ring-background"
                    >
                      {i + 1}
                    </span>
                    <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
                  </FadeUp>
                ))}
              </ol>
              <div className="mt-12 flex justify-center">
                <Button asChild size="lg" className="h-12 px-6 text-base font-semibold">
                  <Link to={ROUTES.register}>
                    Đăng ký công ty
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </div>

              <ul className="mt-20 grid gap-4 md:grid-cols-3">
                {LANDING_DIFFS.map((d, i) => {
                  const Icon = DIFF_ICONS[d.icon];
                  return (
                    <FadeUp
                      key={d.title}
                      as="li"
                      delay={i * 0.08}
                      className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                    >
                      <span className="grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <h3 className="mt-4 text-lg font-semibold">{d.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{d.text}</p>
                    </FadeUp>
                  );
                })}
              </ul>
            </div>
          </section>

          <section id="man-hinh" aria-labelledby="man-hinh-title" className="scroll-mt-20 bg-card py-20">
            <div className={CONTAINER}>
              <FadeUp className="flex flex-wrap items-end justify-between gap-6">
                <div className="max-w-2xl">
                  <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">Màn hình</p>
                  <h2
                    id="man-hinh-title"
                    className="mt-3 text-3xl leading-tight font-bold tracking-[-0.02em] sm:text-[40px]"
                  >
                    Màn hình trên bản chạy thử
                  </h2>
                  <p className="mt-3 text-[17px] leading-relaxed text-foreground-2">
                    Chụp từ bản chạy thử với dữ liệu thử. Tên gian hàng đã làm mờ.
                  </p>
                </div>
                <Link
                  to={ROUTES.register}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-active"
                >
                  Đăng ký công ty
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </FadeUp>
              <ul className="mt-12 grid gap-4 md:grid-cols-3">
                {LANDING_SCREENS.map((s, i) => (
                  <FadeUp key={s.name} as="li" delay={i * 0.08}>
                    <figure className="group">
                      <div className="relative aspect-[2/1] overflow-hidden rounded-xl border bg-background">
                        <img
                          src={s.src}
                          width={s.width}
                          height={s.height}
                          alt={s.alt}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover object-left-top transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none"
                        />
                      </div>
                      <figcaption className="mt-3 text-sm font-medium">{s.name}</figcaption>
                    </figure>
                  </FadeUp>
                ))}
              </ul>
            </div>
          </section>
        </main>

        <footer className={cn(DEEP, 'pt-16 pb-10 text-white/70')}>
          <div className={cn(CONTAINER, 'grid gap-10 sm:grid-cols-2 lg:grid-cols-4')}>
            <div>
              <span className="flex items-center gap-2 text-white">
                <BrandLogo size={30} />
                <span className="text-lg font-bold">Commerio</span>
              </span>
              <p className="mt-4 max-w-xs text-sm leading-relaxed">
                Nền tảng quản lý bán hàng đa sàn cho doanh nghiệp bán lẻ: hàng, kho, đơn và tiền của mỗi công ty ở một
                chỗ.
              </p>
            </div>
            <FooterCol title="Trên trang">
              {NAV.map((n) => (
                <a key={n.href} href={n.href} className="hover:text-white">
                  {n.label}
                </a>
              ))}
            </FooterCol>
            <FooterCol title="Tài khoản">
              <Link to={ROUTES.login} className="hover:text-white">
                Đăng nhập
              </Link>
              <Link to={ROUTES.register} className="hover:text-white">
                Đăng ký công ty
              </Link>
            </FooterCol>
            <FooterCol title="Sàn đang hỗ trợ">
              <span>Lazada</span>
              <span>TikTok Shop</span>
            </FooterCol>
          </div>
          <div
            className={cn(
              CONTAINER,
              'mt-12 flex flex-wrap justify-between gap-2 border-t border-white/10 pt-6 text-xs',
            )}
          >
            <span>© 2026 Commerio</span>
            <span>Đồ án chuyên ngành, Trường Đại học Bách khoa</span>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}

function FooterCol({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold tracking-[0.12em] text-white uppercase">{title}</p>
      <div className="mt-4 flex flex-col gap-2.5 text-sm">{children}</div>
    </div>
  );
}
