import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, CircleCheck, ExternalLink, Lock, Store, TriangleAlert } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { BrandLogo } from '@/components/common/BrandLogo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useOnboarding } from '@/api/onboarding.api';
import { useCompanyProfile } from '@/api/companySettings.api';
import { useShopPlatforms } from '@/api/shops.api';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/router/routes';
import { cn } from '@/lib/utils';
import type { OnboardingKey } from '@/types/onboarding';
import type { ShopPlatform } from '@/types/shop';
import { AddShopDialog } from '@/features/channel/AddShopDialog';
import { useStartConnect } from '@/features/channel/useStartConnect';
import { ProfileForm } from './CompanyProfilePage';
import { OptionalTodoList } from './OnboardingCard';
import { firstPendingIndex, onboardingSteps, optionalSteps, requiredSteps, type OnboardingStep } from './onboardingSteps';
import { clearWelcome, markWelcome } from './welcomeFlow';

type WizardKey = Extract<OnboardingKey, 'company_profile' | 'connect_shop' | 'setup_shop' | 'opening_stock'>;

/** Chữ của từng bước wizard (bản thiết kế FE#419 W1–W4); `blocked` là lý do cạnh nút Tiếp khi bước chưa xong */
const WIZARD_TEXT: Record<WizardKey, { sub: string; lead: string; blocked: string }> = {
  company_profile: {
    sub: 'Địa chỉ in trên chứng từ',
    lead: 'Địa chỉ và tên tổ chức in trên phiếu nhận, phiếu trả NCC và các chứng từ khác.',
    blocked: 'Lưu địa chỉ đăng ký để sang bước tiếp.',
  },
  connect_shop: {
    sub: 'Lazada hoặc TikTok Shop',
    lead: 'Chọn sàn rồi đăng nhập tài khoản người bán trên trang của sàn để cho phép Commerio đọc sản phẩm, đơn, cập nhật tồn và giá.',
    blocked: 'Kết nối một gian hàng để sang bước tiếp.',
  },
  setup_shop: {
    sub: 'Liên kết hoặc tạo SKU kho, mốc lấy đơn',
    lead: 'Làm một lần sau khi kết nối. Commerio chưa lấy đơn và chưa cập nhật tồn lên sàn cho tới khi xong.',
    blocked: 'Hoàn tất thiết lập gian hàng để sang bước tiếp.',
  },
  opening_stock: {
    sub: 'Kiểm kê số hàng đang có',
    lead: 'Đếm số hàng đang có trong kho. Thời điểm đếm là mốc Commerio bắt đầu tính tồn và lấy đơn cho gian hàng đầu tiên.',
    blocked: 'Ghi sổ phiếu kiểm kê để hoàn tất.',
  },
};

const isWizardKey = (key: OnboardingKey): key is WizardKey => key in WIZARD_TEXT;

/**
 * Hướng dẫn thiết lập ban đầu `/c/:id/welcome` (US-CT-12, Documents/21 mục 23, FE#419). Bước và trạng thái đọc từ
 * `GET /onboarding` (BE tính lại mỗi lần, đã bỏ bước người xem thiếu quyền); FE không lưu cờ. Mở ra thì đứng ở bước
 * bắt buộc đầu tiên chưa xong; nút Tiếp chỉ bật khi bước hiện tại đã xong theo dữ liệu thật.
 */
export function WelcomePage() {
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const onboarding = useOnboarding({ refetchOnWindowFocus: true });
  const [index, setIndex] = useState<number | null>(null);

  const { steps, optional } = useMemo(() => {
    const all = onboarding.data ? onboardingSteps(onboarding.data, companyId) : [];
    return { steps: requiredSteps(all).filter((s) => isWizardKey(s.key)), optional: optionalSteps(all) };
  }, [onboarding.data, companyId]);

  useEffect(() => {
    if (onboarding.data && index === null) setIndex(firstPendingIndex(steps));
  }, [onboarding.data, index, steps]);

  // Trang có sẵn (thiết lập gian hàng, phiếu kiểm kê, uỷ quyền sàn) đọc dấu này để hiện thanh quay lại
  useEffect(() => {
    if (companyId) markWelcome(companyId);
  }, [companyId]);

  if (!companyContext) return null;
  const home = ROUTES.company.root(companyId);
  const later = () => {
    clearWelcome(companyId);
    navigate(home);
  };

  // Không còn bước nào cho người xem (thiếu quyền mọi bước): không có wizard (US-CT-12 ca 6)
  if (onboarding.data && !steps.length) return <Navigate to={home} replace />;

  const cur = index ?? 0;
  const done = steps.filter((s) => s.done).length;
  const finished = steps.length > 0 && cur >= steps.length;
  const step: OnboardingStep | undefined = steps[cur];

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center gap-3 border-b bg-card px-4 py-3 sm:px-6">
        <BrandLogo size={28} />
        <span className="font-semibold">Commerio</span>
        <span className="hidden truncate text-sm text-muted-foreground sm:inline">{companyContext.companyName}</span>
        <Button variant="ghost" size="sm" className="ms-auto" onClick={later}>
          Để sau, vào Tổng quan
        </Button>
      </header>

      <div className="mx-auto grid w-full max-w-5xl flex-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {onboarding.isPending ? (
          <>
            <Skeleton className="hidden h-72 lg:block" />
            <div className="grid content-start gap-3" aria-busy="true">
              <span className="sr-only">Đang tải các bước thiết lập...</span>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-9 w-2/3" />
              <Skeleton className="h-40 w-full" />
            </div>
          </>
        ) : onboarding.isError ? (
          <div className="grid content-start gap-3 lg:col-span-2">
            <AlertMessage severity="error">{problemMessage(onboarding.error)}</AlertMessage>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void onboarding.refetch()}>Thử lại</Button>
              <Button variant="outline" asChild>
                <Link to={home}>Vào Tổng quan</Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Stepper steps={steps} cur={cur} done={done} onPick={setIndex} />
            <main className="grid content-start gap-4">
              <MobileProgress steps={steps} cur={cur} done={done} />
              <div className="rounded-xl border bg-card p-5 sm:p-6" data-testid="welcome-step" data-step={finished ? 'done' : step?.key}>
                {finished ? (
                  <ReadyScreen optional={optional} total={steps.length} />
                ) : (
                  step && (
                    <StepBody
                      step={step}
                      n={cur + 1}
                      total={steps.length}
                      companyId={companyId}
                      onChanged={() => void onboarding.refetch()}
                    />
                  )
                )}
              </div>
            </main>
          </>
        )}
      </div>

      {onboarding.data && steps.length > 0 && (
        <footer className="sticky bottom-0 border-t bg-card">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            <Button variant="outline" disabled={cur === 0} onClick={() => setIndex(cur - 1)}>
              <ArrowLeft />
              Quay lại
            </Button>
            <span className="ms-auto text-sm text-muted-foreground" data-testid="welcome-why" aria-live="polite">
              {!finished && step && !step.done ? WIZARD_TEXT[step.key as WizardKey].blocked : ''}
            </span>
            {finished ? (
              <Button
                onClick={() => {
                  clearWelcome(companyId);
                  navigate(home);
                }}
              >
                Vào Tổng quan
                <ArrowRight />
              </Button>
            ) : (
              <Button disabled={!step?.done} onClick={() => setIndex(cur + 1)}>
                Tiếp
                <ArrowRight />
              </Button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}

/** Danh sách bước bên trái (màn rộng): bước đã xong bấm vào xem lại; bước sau bước đang làm bị khoá */
function Stepper({ steps, cur, done, onPick }: { steps: OnboardingStep[]; cur: number; done: number; onPick: (i: number) => void }) {
  return (
    <nav aria-label="Các bước thiết lập" className="hidden content-start gap-3 lg:grid">
      <p className="text-sm font-medium">
        Đã xong {done}/{steps.length} bước bắt buộc
      </p>
      <ProgressBar done={done} total={steps.length} />
      <ol className="grid gap-1">
        {steps.map((s, i) => {
          const state = s.done ? 'done' : i === cur ? 'cur' : 'lock';
          const locked = state === 'lock' && i > cur;
          return (
            <li key={s.key} aria-current={i === cur ? 'step' : undefined}>
              <button
                type="button"
                disabled={locked}
                onClick={() => onPick(i)}
                className={cn(
                  'grid w-full grid-cols-[28px_minmax(0,1fr)] items-start gap-3 rounded-lg px-2 py-2 text-start transition-colors',
                  i === cur && 'bg-accent',
                  !locked && 'hover:bg-accent',
                  locked && 'cursor-not-allowed opacity-60',
                )}
              >
                <span
                  className={cn(
                    'grid size-7 place-items-center rounded-full border text-xs font-semibold',
                    state === 'done' && 'border-success bg-success/15 text-success-text',
                    state === 'cur' && 'border-primary bg-primary text-primary-foreground',
                  )}
                >
                  {state === 'done' ? <Check className="size-3.5" aria-label="Đã xong" /> : locked ? <Lock className="size-3.5" aria-hidden /> : i + 1}
                </span>
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">{s.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {locked ? `Làm xong bước ${cur + 1} trước` : WIZARD_TEXT[s.key as WizardKey].sub}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function MobileProgress({ steps, cur, done }: { steps: OnboardingStep[]; cur: number; done: number }) {
  return (
    <div className="grid gap-2 rounded-xl border bg-card px-4 py-3 lg:hidden">
      <div className="flex items-center justify-between text-sm">
        <b className="font-semibold">
          Bước {Math.min(cur + 1, steps.length)}/{steps.length}
        </b>
        <span className="text-muted-foreground">Đã xong {done}</span>
      </div>
      <ProgressBar done={done} total={steps.length} />
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Xem mọi bước</summary>
        <ol className="mt-2 grid list-decimal gap-1 ps-5">
          {steps.map((s, i) => (
            <li key={s.key}>
              {s.done ? 'Xong' : i === cur ? 'Đang làm' : 'Chưa tới'}: {s.label}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  return (
    <span
      role="progressbar"
      aria-label="Tiến độ thiết lập"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      className="block h-1.5 overflow-hidden rounded-full bg-fill"
    >
      <span className="block h-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
    </span>
  );
}

function StepBody({
  step,
  n,
  total,
  companyId,
  onChanged,
}: {
  step: OnboardingStep;
  n: number;
  total: number;
  companyId: string;
  onChanged: () => void;
}) {
  const text = WIZARD_TEXT[step.key as WizardKey];
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Bước {n} trên {total}
        </span>
        <h1 className="text-xl font-semibold">{step.label}</h1>
        <p className="max-w-prose text-sm text-muted-foreground">{text.lead}</p>
      </div>
      {step.done && (
        <AlertMessage severity="success">Bước này đã xong. Bấm Tiếp để sang bước sau, hoặc sửa lại nếu cần.</AlertMessage>
      )}
      {step.key === 'company_profile' && <ProfileStep onSaved={onChanged} />}
      {step.key === 'connect_shop' && <ConnectStep companyId={companyId} />}
      {step.key === 'setup_shop' && (
        <LinkOut
          title="Thiết lập gian hàng"
          detail="Liên kết SKU sàn (hoặc tạo SKU kho từ SKU sàn), đồng bộ tồn lần đầu, đồng bộ đơn từ. Gian hàng đầu tiên của công ty luôn kiểm kho trước khi đồng bộ: hoàn tất thì bước sau mở đúng phiếu kiểm kê đầu kỳ."
          to={step.to}
          action={step.done ? 'Xem gian hàng' : 'Mở thiết lập'}
        />
      )}
      {step.key === 'opening_stock' && (
        <>
          {!step.done && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              Trong lúc chờ phiếu ghi sổ, Commerio chưa cập nhật tồn lên sàn và chưa giữ hàng cho đơn. Sàn giữ số đang có.
            </div>
          )}
          {!step.done && (
            <LinkOut title="Phiếu kiểm kê đầu kỳ" detail="Đếm, rồi gửi duyệt và ghi sổ." to={step.to} action="Mở phiếu" />
          )}
        </>
      )}
    </div>
  );
}

function ProfileStep({ onSaved }: { onSaved: () => void }) {
  const profile = useCompanyProfile();
  if (profile.isPending) return <Skeleton className="h-64 w-full" />;
  if (profile.isError) return <AlertMessage severity="error">{problemMessage(profile.error)}</AlertMessage>;
  return <ProfileForm profile={profile.data} onSaved={onSaved} />;
}

/** Một nút mỗi sàn nối được; sàn chỉ nối bằng token (shop thử) thì mở hộp Thêm gian hàng như trang danh sách */
function ConnectStep({ companyId }: { companyId: string }) {
  const platforms = useShopPlatforms();
  const connector = useStartConnect();
  const [dialog, setDialog] = useState(false);
  const list = (platforms.data?.items ?? []).filter((p) => p.connectable);
  const connect = (p: ShopPlatform) => {
    markWelcome(companyId);
    const methods = p.methods?.length ? p.methods : ['oauth'];
    if (methods.includes('oauth')) void connector.start({ platform: p.platform });
    else setDialog(true);
  };
  return (
    <div className="grid gap-3">
      {platforms.isPending && <Skeleton className="h-20 w-full" />}
      {platforms.isError && <AlertMessage severity="error">{problemMessage(platforms.error)}</AlertMessage>}
      {list.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((p) => (
            <button
              key={p.platform}
              type="button"
              disabled={connector.pending}
              onClick={() => connect(p)}
              className="flex items-center gap-3 rounded-lg border p-4 text-start transition-colors hover:border-primary hover:bg-accent disabled:cursor-wait disabled:opacity-60"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-fill">
                <Store className="size-5" aria-hidden />
              </span>
              <span className="grid gap-0.5">
                <b className="font-semibold">{p.name}</b>
                <span className="text-sm text-muted-foreground">
                  {connector.pending && connector.variables?.platform === p.platform ? 'Đang mở trang của sàn...' : `Mở trang uỷ quyền của ${p.name}`}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      {platforms.data && !list.length && <AlertMessage severity="warning">Chưa có sàn nào kết nối được.</AlertMessage>}
      <p className="text-sm text-muted-foreground">
        Uỷ quyền xong sẽ về thẳng bước Thiết lập gian hàng. Chưa có sản phẩm trong Commerio cũng được: bước sau tạo SKU kho từ sản
        phẩm đang bán trên sàn.{' '}
        <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={() => setDialog(true)}>
          Cách kết nối khác
        </button>
      </p>
      <AddShopDialog open={dialog} companyId={companyId} onClose={() => setDialog(false)} />
    </div>
  );
}

function LinkOut({ title, detail, to, action }: { title: string; detail: ReactNode; to: string; action: string }) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/40 p-4">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <b className="font-semibold">{title}</b>
        <span className="text-sm text-muted-foreground">{detail}</span>
      </div>
      <Button asChild>
        <Link to={to}>
          {action}
          <ExternalLink />
        </Link>
      </Button>
    </div>
  );
}

/** Xong hết bước bắt buộc (Documents/21 mục 23: `done = total`): liệt kê việc tuỳ chọn */
function ReadyScreen({ optional, total }: { optional: OnboardingStep[]; total: number }) {
  return (
    <div className="grid gap-4">
      <div className="grid justify-items-start gap-2">
        <Badge variant="success">
          <CircleCheck className="size-3.5" aria-hidden />
          Đã xong {total}/{total} bước bắt buộc
        </Badge>
        <h1 className="text-xl font-semibold">Sẵn sàng bán</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Commerio đang lấy đơn và cập nhật tồn của gian hàng. Các việc dưới đây không bắt buộc, làm lúc nào cũng được ở Tổng quan.
        </p>
      </div>
      {optional.length > 0 && <OptionalTodoList steps={optional} className="rounded-lg border" />}
    </div>
  );
}
