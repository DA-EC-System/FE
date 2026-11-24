import { useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CircleCheck, ExternalLink, LogOut, RefreshCw } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { BrandLogo } from '@/components/common/BrandLogo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompleteOnboarding, useOnboarding } from '@/api/onboarding.api';
import { useCompanyProfile } from '@/api/companySettings.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useAuth, useLogout } from '@/hooks/useAuth';
import { ROUTES } from '@/router/routes';
import type { Onboarding } from '@/types/onboarding';
import { ProfileForm } from '@/features/company/CompanyProfilePage';
import { OptionalTodoList } from '@/features/company/OnboardingCard';
import { onboardingSteps, optionalSteps } from '@/features/company/onboardingSteps';
import { clearWelcome, markWelcome } from '@/features/company/welcomeFlow';
import { ConnectStep } from './steps/ConnectStep';
import { OpeningStockStep } from './steps/OpeningStockStep';
import { WizardStepper } from './WizardStepper';
import {
  SHOP_SETUP_KEYS,
  WIZARD_STEP_LABELS,
  resolveView,
  viewAfter,
  viewBefore,
  wizardSteps,
  type WizardKey,
  type WizardStep,
  type WizardView,
} from './wizardState';

/** Câu dẫn dưới tiêu đề và lý do cạnh nút Tiếp khi bước chưa xong (design v2.html; WelcomePage FE#419) */
const STEP_TEXT: Record<WizardKey, { lead: string; why: string }> = {
  company_profile: {
    lead: 'Địa chỉ và tên tổ chức in trên phiếu nhận, phiếu trả NCC và các chứng từ khác.',
    why: 'Nhập địa chỉ đăng ký để sang bước tiếp.',
  },
  connect_shop: {
    lead: 'Chọn sàn rồi đăng nhập tài khoản người bán trên trang của sàn để cho phép Commerio đọc sản phẩm, đơn, cập nhật tồn và giá.',
    why: 'Kết nối một gian hàng để sang bước tiếp.',
  },
  link_skus: {
    lead: 'Nối từng SKU đang bán trên sàn với biến thể (SKU kho) trong Commerio.',
    why: 'Hoàn tất thiết lập gian hàng để sang bước tiếp.',
  },
  assign_groups: {
    lead: 'Chọn danh mục cho các sản phẩm sẽ tạo từ SKU sàn.',
    why: 'Hoàn tất thiết lập gian hàng để sang bước tiếp.',
  },
  stock_sync: {
    lead: 'Chọn cách đưa tồn của Commerio lên sàn lần đầu.',
    why: 'Hoàn tất thiết lập gian hàng để sang bước tiếp.',
  },
  order_cutoff: {
    lead: 'Commerio chưa lấy đơn và chưa cập nhật tồn lên sàn cho tới khi xong.',
    why: 'Hoàn tất thiết lập gian hàng để sang bước tiếp.',
  },
  opening_stock: {
    lead: 'Đếm số hàng đang có trong kho. Thời điểm đếm là mốc Commerio bắt đầu tính tồn và lấy đơn cho gian hàng đầu tiên.',
    why: 'Ghi sổ phiếu kiểm kê đầu kỳ để hoàn tất.',
  },
};

const PROFILE_FORM_ID = 'wizard-profile-form';

/**
 * Wizard thiết lập ban đầu `/c/:id/welcome?step=<key>` (US-CT-12, FE#468, Documents/21 mục 23). Khung riêng: logo,
 * tên công ty, Đăng xuất; không menu, không lối ra khi `mustWizard`. Bước và dấu tích đọc từ `GET /onboarding`; bước
 * đứng trên URL để tải lại vẫn ở đúng chỗ. Hết bước thì trang "Sẵn sàng bán" gọi `POST /onboarding/complete`.
 */
export function WelcomePage() {
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const onboarding = useOnboarding({ refetchOnWindowFocus: true });
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const home = ROUTES.company.root(companyId);

  if (!companyContext) return null;
  const data = onboarding.data;

  if (onboarding.isPending) {
    return (
      <Frame companyName={companyContext.companyName}>
        <div className="grid gap-3" aria-busy="true">
          <span className="sr-only">Đang tải các bước thiết lập...</span>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      </Frame>
    );
  }
  if (!data) {
    return (
      <Frame companyName={companyContext.companyName}>
        <div className="grid gap-3" data-testid="welcome-load-error">
          <AlertMessage severity="error">
            <b className="font-semibold">Chưa tải được các bước thiết lập.</b> {problemMessage(onboarding.error)}
          </AlertMessage>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void onboarding.refetch()} disabled={onboarding.isFetching}>
              <RefreshCw />
              Thử lại
            </Button>
            <LogoutButton variant="outline" />
          </div>
        </div>
      </Frame>
    );
  }

  const steps = wizardSteps(data);
  // Người không có bước bắt buộc nào và không bị ép (Sale): không có wizard (US-CT-12 ca 6)
  if (!steps.length && !data.mustWizard) return <Navigate to={home} replace />;

  const view = resolveView(data, params.get('step'));
  const go = (next: WizardView) => setParams({ step: next });
  const step = steps.find((s) => s.key === view);
  const back = viewBefore(data, view);
  /** Xong bước: đọc lại tiến độ rồi sang bước kế (đọc trước để bước kế đã mở được) */
  const advance = async (key: WizardKey) => {
    const fresh = (await onboarding.refetch()).data ?? data;
    go(viewAfter(fresh, key));
  };

  return (
    <Frame
      companyName={companyContext.companyName}
      exitTo={data.mustWizard ? undefined : home}
      onExit={() => clearWelcome(companyId)}
      stepper={<WizardStepper steps={steps} view={view} onPick={go} />}
      footer={
        <>
          <Button variant="outline" disabled={!back || busy} onClick={() => back && go(back)}>
            <ArrowLeft />
            Quay lại
          </Button>
          <span className="ms-auto text-sm text-muted-foreground" data-testid="welcome-why" aria-live="polite">
            {step && !step.done ? STEP_TEXT[step.key].why : ''}
          </span>
          {view === 'ready' ? (
            <CompleteButton
              data={data}
              onMissing={go}
              onDone={() => {
                clearWelcome(companyId);
                navigate(home, { replace: true });
              }}
            />
          ) : view === 'company_profile' ? (
            <Button type="submit" form={PROFILE_FORM_ID} disabled={busy}>
              {busy ? 'Đang lưu…' : 'Lưu và tiếp'}
              <ArrowRight />
            </Button>
          ) : (
            <Button disabled={!step?.done} onClick={() => step && go(viewAfter(data, step.key))}>
              Tiếp
              <ArrowRight />
            </Button>
          )}
        </>
      }
    >
      <div data-testid="welcome-step" data-step={view}>
        {view === 'ready' || !step ? (
          <ReadyScreen data={data} companyId={companyId} total={steps.length} />
        ) : (
          <StepBody step={step} total={steps.length}>
            {step.key === 'company_profile' && (
              <ProfileStep onBusyChange={setBusy} onSaved={() => void advance('company_profile')} />
            )}
            {step.key === 'connect_shop' && (
              <ConnectStep
                companyId={companyId}
                shopId={steps.find((s) => s.key === 'link_skus')?.ref?.id ?? null}
                onConnected={() => void advance('connect_shop')}
              />
            )}
            {SHOP_SETUP_KEYS.includes(step.key) && <ShopSetupLink step={step} companyId={companyId} />}
            {step.key === 'opening_stock' && (
              <OpeningStockStep
                step={step}
                companyName={companyContext.companyName}
                countOnly={steps.every((s) => s.key === 'opening_stock')}
              />
            )}
          </StepBody>
        )}
      </div>
    </Frame>
  );
}

/** Khung wizard: thanh trên (logo, tên công ty, Đăng xuất), thanh bước, thân, chân dính đáy */
function Frame({
  companyName,
  exitTo,
  onExit,
  stepper,
  footer,
  children,
}: {
  companyName: string;
  /** Chỉ khi không bị ép (`mustWizard = false`): lối về Tổng quan */
  exitTo?: string;
  onExit?: () => void;
  stepper?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center gap-3 border-b bg-card px-4 py-3 sm:px-6">
        <BrandLogo size={28} />
        <span className="font-semibold">Commerio</span>
        <span className="hidden truncate text-sm text-muted-foreground sm:inline">{companyName}</span>
        <span className="ms-auto flex gap-2">
          {exitTo && (
            <Button variant="ghost" size="sm" asChild>
              <Link to={exitTo} onClick={onExit}>
                Về Tổng quan
              </Link>
            </Button>
          )}
          <LogoutButton variant="ghost" size="sm" />
        </span>
      </header>
      {stepper}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <div className="rounded-xl border bg-card p-5 sm:p-6">{children}</div>
      </main>
      {footer && (
        <footer className="sticky bottom-0 border-t bg-card">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">{footer}</div>
        </footer>
      )}
    </div>
  );
}

/** Lối duy nhất rời wizard trước khi xong; đăng nhập lại thì về đúng bước */
function LogoutButton(props: { variant: 'ghost' | 'outline'; size?: 'sm' }) {
  const logout = useLogout();
  return (
    <Button {...props} onClick={() => void logout()}>
      <LogOut />
      Đăng xuất
    </Button>
  );
}

function StepBody({ step, total, children }: { step: WizardStep; total: number; children: ReactNode }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Bước {step.index} trên {total}
        </span>
        <h1 className="text-xl font-semibold">{step.label}</h1>
        <p className="max-w-prose text-sm text-muted-foreground">{STEP_TEXT[step.key].lead}</p>
      </div>
      {step.done && (
        <AlertMessage severity="success">Bước này đã xong. Bấm Tiếp để sang bước sau, hoặc sửa lại nếu cần.</AlertMessage>
      )}
      {children}
    </div>
  );
}

function ProfileStep({ onSaved, onBusyChange }: { onSaved: () => void; onBusyChange: (busy: boolean) => void }) {
  const profile = useCompanyProfile();
  if (profile.isPending) return <Skeleton className="h-64 w-full" />;
  if (profile.isError) return <AlertMessage severity="error">{problemMessage(profile.error)}</AlertMessage>;
  return <ProfileForm profile={profile.data} onSaved={onSaved} formId={PROFILE_FORM_ID} hideActions onBusyChange={onBusyChange} />;
}

/**
 * Bước 3 tới 6 (tạm, FE#468 PR A): còn làm ở trang Thiết lập gian hàng; trang đó hiện thanh "Thiết lập ban đầu" và
 * tự về wizard khi hoàn tất. PR sau nhúng từng bước vào đây.
 */
function ShopSetupLink({ step, companyId }: { step: WizardStep; companyId: string }) {
  const to = step.ref?.type === 'shop' ? ROUTES.company.shopSetup(companyId, step.ref.id) : ROUTES.company.shops(companyId);
  const range = `${WIZARD_STEP_LABELS.link_skus}, ${WIZARD_STEP_LABELS.assign_groups.toLowerCase()}, ${WIZARD_STEP_LABELS.stock_sync.toLowerCase()}, chọn mốc lấy đơn`;
  return (
    <LinkOut
      companyId={companyId}
      title="Thiết lập gian hàng"
      detail={`${range}: làm ở trang Thiết lập gian hàng, hoàn tất thì tự về đây.`}
      to={to}
      action={step.done ? 'Xem thiết lập' : 'Mở thiết lập'}
    />
  );
}

function LinkOut({ companyId, title, detail, to, action }: { companyId: string; title: string; detail: string; to: string; action: string }) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/40 p-4">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <b className="font-semibold">{title}</b>
        <span className="text-sm text-muted-foreground">{detail}</span>
      </div>
      <Button asChild>
        {/* Dấu "đến từ wizard": trang đích hiện thanh quay lại và tự về khi xong */}
        <Link to={to} onClick={() => markWelcome(companyId)}>
          {action}
          <ExternalLink />
        </Link>
      </Button>
    </div>
  );
}

/** Xong hết bước bắt buộc của người xem: việc tuỳ chọn (chỉ nhãn, không lối ra) */
function ReadyScreen({ data, companyId, total }: { data: Onboarding; companyId: string; total: number }) {
  const optional = optionalSteps(onboardingSteps(data, companyId));
  // Không bị ép mà công ty chưa hoàn tất: phần còn lại (bước của người khác, hoặc nút hoàn tất) không phải của người xem
  const waiting = !data.mustWizard && data.completedAt === null;
  return (
    <div className="grid gap-4">
      <div className="grid justify-items-start gap-2">
        <Badge variant="success">
          <CircleCheck className="size-3.5" aria-hidden />
          Đã xong {total}/{total} bước bắt buộc
        </Badge>
        <h1 className="text-xl font-semibold">Sẵn sàng bán</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          {waiting
            ? data.next
              ? `Bạn đã xong phần của mình. Bước "${WIZARD_STEP_LABELS[data.next.key as WizardKey] ?? data.next.key}" do người có quyền trong công ty làm.`
              : 'Bạn đã xong phần của mình. Chờ CEO bấm hoàn tất thiết lập, sau đó Commerio bắt đầu lấy đơn và cập nhật tồn.'
            : 'Commerio đang lấy đơn và cập nhật tồn của gian hàng. Các việc dưới đây không bắt buộc, làm lúc nào cũng được ở Tổng quan.'}
        </p>
      </div>
      {optional.length > 0 && <OptionalTodoList steps={optional} className="rounded-lg border" readOnly />}
    </div>
  );
}

/**
 * "Vào Tổng quan": gọi `POST /onboarding/complete`. 409 `onboarding_incomplete` thì báo bước còn thiếu kèm nút tới
 * bước đó (luật "lỗi phải chỉ chỗ sửa"). Công ty còn bước của người khác (`next` khác null) thì không có nút.
 */
function CompleteButton({ data, onMissing, onDone }: { data: Onboarding; onMissing: (view: WizardView) => void; onDone: () => void }) {
  const complete = useCompleteOnboarding();
  const visible = new Set<WizardKey>(wizardSteps(data).map((s) => s.key));
  const [missing, setMissing] = useState<WizardKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Chỉ người được gọi POST /onboarding/complete: BE ép ở trang này (`mustWizard`), hoặc công ty đã hoàn tất (gọi lại trả 200)
  if (!data.mustWizard && data.completedAt === null) return null;
  const submit = async () => {
    setMissing(null);
    setError(null);
    // Công ty đã hoàn tất: không gọi lại (người thiếu quyền sẽ nhận 403), vào thẳng Tổng quan
    if (data.completedAt !== null) return onDone();
    try {
      await complete.mutateAsync();
      onDone();
    } catch (e) {
      const problem = getProblem(e);
      if (problem?.code === 'onboarding_incomplete' && problem.missing?.length) {
        setMissing(problem.missing.filter((k): k is WizardKey => k in WIZARD_STEP_LABELS));
        // Bước người xem không thấy (thiếu quyền) thì không có nút tới bước
      } else {
        setError(problemMessage(e));
      }
    }
  };
  return (
    <>
      {(missing || error) && (
        <div className="basis-full" role="alert" data-testid="complete-error">
          <AlertMessage severity="error">
            {error ?? (
              <>
                <b className="font-semibold">Còn bước chưa xong nên chưa vào Tổng quan được.</b>
                <ul className="mt-1 grid gap-1">
                  {missing!.map((k) => (
                    <li key={k}>
                      {WIZARD_STEP_LABELS[k]}.{' '}
                      {visible.has(k) ? (
                        <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => onMissing(k)}>
                          Tới bước này
                        </button>
                      ) : (
                        'Bước này do người có quyền trong công ty làm.'
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </AlertMessage>
        </div>
      )}
      <Button onClick={() => void submit()} disabled={complete.isPending}>
        {complete.isPending ? 'Đang hoàn tất…' : 'Vào Tổng quan'}
        <ArrowRight />
      </Button>
    </>
  );
}
