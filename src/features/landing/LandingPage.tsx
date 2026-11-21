import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Percent, Plus, Scale, ShieldCheck } from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import heroShot from '@/assets/landing/hero-kien.jpg';
import inventoryShot from '@/assets/landing/mod-inventory.jpg';
import { BrandLogo } from '@/components/common/BrandLogo';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FanCards, type FanCardItem } from '@/components/ui/fan-cards';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/routes';
import {
  LANDING_DIFFS,
  LANDING_FAQ,
  LANDING_GROUPS,
  LANDING_HIGHLIGHTS,
  LANDING_MARKET_NOTE,
  LANDING_ONBOARDING,
  LANDING_PAINS,
} from './landingContent';
import { SUPPORTED_PLATFORMS } from '@/lib/platforms';

/**
 * Trang giới thiệu ở `/` cho người chưa đăng nhập (FE#401, Documents/27 US-CT-14).
 * Phương án B Thành chốt 20/11/2026 (bản thiết kế .claude/issues/landing/design/index.html): hero sáng bất đối xứng có
 * hai ảnh màn thật chồng lệch, bốn vấn đề dạng bento (tách vấn đề và giải pháp bằng kiểu chữ, không dùng icon), thẻ
 * quạt phân hệ (Spider UI Fan Cards), khối dành cho doanh nghiệp, hỏi đáp. Màu lấy token của Commerio.
 * Trang được lazy-load (router/guards.tsx) để `motion` không vào bundle chung.
 */

const CONTAINER = 'mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8';
const EASE = [0.22, 1, 0.36, 1] as const;
const SHOT_SHADOW = 'shadow-[0_24px_60px_-20px_rgba(15,23,42,0.4)]';

const NAV = [
  { href: '#van-de', label: 'Vấn đề' },
  { href: '#phan-he', label: 'Phân hệ' },
  { href: '#doanh-nghiep', label: 'Doanh nghiệp' },
  { href: '#hoi-dap', label: 'Hỏi đáp' },
];

const DIFF_ICONS = { scale: Scale, shield: ShieldCheck, percent: Percent };

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
            transition={{ duration: 0.55, delay: 0.1 + i * 0.05, ease: EASE }}
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
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay, ease: EASE }}
    >
      {children}
    </Comp>
  );
}

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

/** Nhãn chữ nhỏ đứng trước dòng giải pháp, thay cho icon */
function SolutionLabel() {
  return <span className="mb-1 block text-[11px] font-bold tracking-[0.12em] text-primary uppercase">Commerio</span>;
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

export function LandingPage() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-dvh bg-background text-foreground">
        <a
          href="#landing-main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
        >
          Bỏ qua tới nội dung chính
        </a>

        <header className="fixed inset-x-0 top-0 z-50 border-b bg-card/90 backdrop-blur-md">
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
                  className="rounded-md px-3 py-2 text-sm font-medium text-foreground-2 transition-colors hover:text-primary"
                >
                  {n.label}
                </a>
              ))}
            </nav>
            <Button asChild variant="ghost" className="h-10 px-3 font-medium">
              <Link to={ROUTES.login}>Đăng nhập</Link>
            </Button>
            <Button asChild className="h-10 px-4 font-semibold">
              <Link to={ROUTES.register}>Đăng ký công ty</Link>
            </Button>
          </div>
        </header>

        <main id="landing-main">
          <section className="relative overflow-hidden bg-card pt-28 pb-16 md:pt-36 md:pb-24">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-40 right-[-20%] size-[720px] rounded-full bg-accent opacity-70 blur-3xl"
            />
            <div className={cn(CONTAINER, 'relative grid items-center gap-12 lg:grid-cols-12')}>
              <div className="lg:col-span-6">
                <p className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-[13px] font-medium text-foreground-2">
                  <span aria-hidden className="size-1.5 rounded-full bg-success" />
                  Nền tảng cho doanh nghiệp bán trên nhiều sàn
                </p>
                <h1 className="mt-5 text-[40px] leading-[1.05] font-extrabold tracking-[-0.03em] text-balance sm:text-6xl">
                  <RevealWords text="Quản lý bán hàng đa sàn cho doanh nghiệp" />
                </h1>
                <motion.p
                  className="mt-6 max-w-[560px] text-lg leading-relaxed text-foreground-2"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.6, ease: EASE }}
                >
                  Tồn, đơn và tiền của mọi gian hàng ở một chỗ. Không bán quá số hàng có, không mở nhiều trang duyệt
                  đơn, nhập hàng theo tồn tổng và biết lãi thực từng đơn.
                </motion.p>
                <motion.div
                  className="mt-9 flex flex-wrap gap-3"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.75, ease: EASE }}
                >
                  <Button asChild size="lg" className="h-12 px-6 text-base font-semibold">
                    <Link to={ROUTES.register}>
                      Đăng ký công ty
                      <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base font-semibold">
                    <a href="#van-de">Xem cách hoạt động</a>
                  </Button>
                </motion.div>
                <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-foreground-2">
                  {LANDING_HIGHLIGHTS.map((h) => (
                    <li key={h} className="flex items-center gap-2">
                      <span aria-hidden className="size-1.5 rounded-full bg-primary" />
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
              <motion.div
                className="relative h-[300px] sm:h-[420px] lg:col-span-6 lg:h-[480px]"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.3, ease: EASE }}
              >
                <img
                  src={inventoryShot}
                  width={1640}
                  height={679}
                  alt="Màn Kho hàng của Commerio: tồn theo từng SKU"
                  fetchPriority="high"
                  className={cn('absolute top-0 right-0 w-[88%] rounded-xl border bg-card', SHOT_SHADOW)}
                />
                <img
                  src={heroShot}
                  width={1640}
                  height={584}
                  alt="Màn Kiện hàng của Commerio: hàng đợi đóng gói của mọi sàn"
                  fetchPriority="high"
                  className={cn('absolute bottom-0 left-0 w-[78%] rounded-xl border bg-card', SHOT_SHADOW)}
                />
                <div className="absolute top-[42%] right-[4%] rounded-xl bg-foreground px-4 py-3 text-background shadow-xl">
                  <p className="text-[11px] tracking-wide uppercase opacity-70">Tồn có thể bán</p>
                  <p className="text-lg font-bold">Đẩy lên mọi gian hàng</p>
                </div>
              </motion.div>
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
              <ul className="mt-14 grid gap-4 lg:grid-cols-2">
                {LANDING_PAINS.map((p, i) => (
                  <FadeUp
                    key={p.title}
                    as="li"
                    delay={(i % 2) * 0.08}
                    className="overflow-hidden rounded-2xl bg-card ring-1 ring-black/5 dark:ring-white/10"
                  >
                    <div className="p-6 sm:p-8">
                      <h3 className="text-2xl leading-snug font-bold">{p.title}</h3>
                      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{p.pain}</p>
                      <p className="mt-5 text-[15px] leading-relaxed font-semibold">
                        <SolutionLabel />
                        {p.fix}
                      </p>
                    </div>
                    {p.shot && (
                      <img
                        src={p.shot.src}
                        width={p.shot.width}
                        height={p.shot.height}
                        alt={p.shot.alt}
                        loading="lazy"
                        decoding="async"
                        className="ml-6 -mb-1 aspect-[2.4/1] w-[calc(100%-1.5rem)] rounded-tl-xl border-t border-l object-cover object-left-top sm:ml-8 sm:w-[calc(100%-2rem)]"
                      />
                    )}
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

          <section id="hoi-dap" aria-labelledby="hoi-dap-title" className="scroll-mt-20 bg-card py-24">
            <div className={cn(CONTAINER, 'grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16')}>
              <FadeUp>
                <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">Hỏi đáp</p>
                <h2
                  id="hoi-dap-title"
                  className="mt-3 text-3xl leading-tight font-bold tracking-[-0.02em] text-balance sm:text-[40px]"
                >
                  Câu hỏi thường gặp
                </h2>
                <p className="mt-4 text-[17px] leading-relaxed text-foreground-2">
                  Chưa thấy câu bạn cần? Đăng ký công ty để dùng thử với dữ liệu của bạn.
                </p>
                <Button asChild size="lg" className="mt-6 h-11 px-5 font-semibold">
                  <Link to={ROUTES.register}>
                    Đăng ký công ty
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </FadeUp>
              <div className="divide-y border-y">
                {LANDING_FAQ.map((f, i) => (
                  <Collapsible key={f.q} defaultOpen={i === 0} className="group py-5">
                    <h3>
                      <CollapsibleTrigger className="flex w-full cursor-pointer items-start justify-between gap-6 rounded-md text-left text-[17px] font-semibold focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none">
                        <span>{f.q}</span>
                        <span
                          aria-hidden
                          className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border transition-transform duration-200 group-data-[state=open]:rotate-45 motion-reduce:transition-none"
                        >
                          <Plus className="size-4" />
                        </span>
                      </CollapsibleTrigger>
                    </h3>
                    <CollapsibleContent className="pr-12 text-[15px] leading-relaxed text-foreground-2">
                      <p className="mt-3">{f.a}</p>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </div>
          </section>
        </main>

        <footer className="border-t bg-card pt-16 pb-10">
          <div className={cn(CONTAINER, 'grid gap-10 sm:grid-cols-2 lg:grid-cols-4')}>
            <div>
              <span className="flex items-center gap-2">
                <BrandLogo size={30} />
                <span className="text-lg font-bold">Commerio</span>
              </span>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
                Nền tảng quản lý bán hàng đa sàn cho doanh nghiệp bán lẻ: hàng, kho, đơn và tiền của mỗi công ty ở một
                chỗ.
              </p>
            </div>
            <FooterCol title="Trên trang">
              {NAV.map((n) => (
                <a key={n.href} href={n.href} className="hover:text-foreground">
                  {n.label}
                </a>
              ))}
            </FooterCol>
            <FooterCol title="Tài khoản">
              <Link to={ROUTES.login} className="hover:text-foreground">
                Đăng nhập
              </Link>
              <Link to={ROUTES.register} className="hover:text-foreground">
                Đăng ký công ty
              </Link>
            </FooterCol>
            <FooterCol title="Sàn đang hỗ trợ">
              {SUPPORTED_PLATFORMS.map((p) => (
                <span key={p.code}>{p.label}</span>
              ))}
            </FooterCol>
          </div>
          <div
            className={cn(
              CONTAINER,
              'mt-12 flex flex-wrap justify-between gap-2 border-t pt-6 text-xs text-muted-foreground',
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
      <p className="text-xs font-bold tracking-[0.12em] uppercase">{title}</p>
      <div className="mt-4 flex flex-col gap-2.5 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
