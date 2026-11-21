import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Panel } from '@/components/common/Panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useOnboarding } from '@/api/onboarding.api';
import { ROUTES } from '@/router/routes';
import { cn } from '@/lib/utils';
import { onboardingSteps, optionalSteps, requiredSteps, showOnboarding, type OnboardingStep } from './onboardingSteps';

const collapsedKey = (companyId: string) => `commerio_onboarding_collapsed:${companyId}`;

function readCollapsed(companyId: string): boolean {
  try {
    return localStorage.getItem(collapsedKey(companyId)) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(companyId: string, collapsed: boolean) {
  try {
    if (collapsed) localStorage.setItem(collapsedKey(companyId), '1');
    else localStorage.removeItem(collapsedKey(companyId));
  } catch {
    // Trình duyệt chặn bộ nhớ (cửa sổ ẩn danh): chỉ không nhớ được, bảng vẫn dùng được
  }
}

/**
 * Ở Tổng quan (US-CT-13, Documents/21 mục 23): dải "Còn n việc trước khi bắt đầu bán" khi còn mục bắt buộc, và bảng
 * "Việc nên làm thêm" cho mục tuỳ chọn. Mục và trạng thái do BE tính từ dữ liệu thật, đã lọc theo quyền. Đang tải
 * hay lỗi thì không hiện gì để không chặn Tổng quan.
 */
export function OnboardingCard({ companyId }: { companyId: string }) {
  const onboarding = useOnboarding();
  const data = onboarding.data;
  if (!data) return null;
  const steps = onboardingSteps(data, companyId);
  const optional = optionalSteps(steps);
  return (
    <>
      {showOnboarding(data) && <ResumeBand companyId={companyId} done={data.done} total={data.total} steps={requiredSteps(steps)} />}
      {optional.some((s) => !s.done) && <OptionalBoard companyId={companyId} steps={optional} />}
    </>
  );
}

function ResumeBand({ companyId, done, total, steps }: { companyId: string; done: number; total: number; steps: OnboardingStep[] }) {
  const next = steps.find((s) => !s.done);
  const left = total - done;
  return (
    <section
      data-guide="home-onboarding"
      data-testid="onboarding-band"
      aria-labelledby="onboarding-band-title"
      className="grid items-center gap-4 rounded-xl border border-primary/30 bg-accent px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
    >
      <span
        role="progressbar"
        aria-label="Tiến độ thiết lập"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="grid size-14 place-items-center rounded-full"
        style={{ background: `conic-gradient(var(--primary) ${(done / total) * 360}deg, var(--fill) 0)` }}
      >
        <span className="grid size-11 place-items-center rounded-full bg-card text-sm font-semibold tabular-nums">
          {done}/{total}
        </span>
      </span>
      <div className="min-w-0">
        <h2 id="onboarding-band-title" className="text-base font-semibold">
          Còn {left} việc trước khi bắt đầu bán
        </h2>
        <p className="text-sm text-muted-foreground">
          Commerio chưa lấy đơn và chưa cập nhật tồn lên sàn cho tới khi xong các việc bắt buộc.
        </p>
        {next && (
          <p className="mt-1 text-sm">
            Việc kế tiếp: <b className="font-semibold">{next.label}</b>
          </p>
        )}
      </div>
      <Button asChild className="justify-self-start sm:justify-self-end">
        <Link to={ROUTES.company.welcome(companyId)}>
          Tiếp tục thiết lập
        </Link>
      </Button>
    </section>
  );
}

function OptionalBoard({ companyId, steps }: { companyId: string; steps: OnboardingStep[] }) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(companyId));
  const toggle = () => {
    writeCollapsed(companyId, !collapsed);
    setCollapsed(!collapsed);
  };
  return (
    <Panel
      data-testid="onboarding-optional"
      title="Việc nên làm thêm"
      flush
      extra={
        <>
          <Badge variant="outline" className="font-normal">
            Tuỳ chọn
          </Badge>
          <Button variant="ghost" size="sm" onClick={toggle} aria-expanded={!collapsed}>
            {collapsed ? 'Mở rộng' : 'Thu gọn'}
          </Button>
        </>
      }
    >
      {!collapsed && <OptionalTodoList steps={steps} />}
    </Panel>
  );
}

/** Danh sách việc tuỳ chọn: dùng ở bảng Tổng quan và trang "Sẵn sàng bán" của wizard */
export function OptionalTodoList({ steps, className }: { steps: OnboardingStep[]; className?: string }) {
  return (
    <ul className={cn('divide-y', className)} data-testid="onboarding-list">
      {steps.map((s) => {
        return (
          <li
            key={s.key}
            data-key={s.key}
            data-done={s.done}
            className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3"
          >
            <div className="min-w-0">
              <b className="text-[13.5px] font-semibold">{s.label}</b>
              <span className="block text-[12.5px] text-muted-foreground">{s.hint}</span>
            </div>
            {s.done ? (
              <Badge variant="outline" className="border-success/30 bg-success/10 font-normal text-success-text">
                Xong
              </Badge>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link to={s.to}>
                  {s.action}
                </Link>
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
