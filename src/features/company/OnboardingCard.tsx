import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { Panel } from '@/components/common/Panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useOnboarding } from '@/api/onboarding.api';
import { cn } from '@/lib/utils';
import { onboardingSteps, showOnboarding } from './onboardingSteps';

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
    // Trình duyệt chặn bộ nhớ (cửa sổ ẩn danh): chỉ không nhớ được, thẻ vẫn dùng được
  }
}

/**
 * Checklist thiết lập ban đầu ở Tổng quan (US-CT-13, Documents/21 mục 23). Mục và trạng thái do BE tính từ dữ liệu
 * thật, đã lọc theo quyền; FE chỉ hiện và dẫn tới màn làm việc. Đang tải, lỗi, hay đã xong hết mục bắt buộc thì
 * không hiện gì để không chặn Tổng quan.
 */
export function OnboardingCard({ companyId }: { companyId: string }) {
  const onboarding = useOnboarding();
  const [collapsed, setCollapsed] = useState(() => readCollapsed(companyId));
  const data = onboarding.data;
  if (!showOnboarding(data)) return null;

  const steps = onboardingSteps(data, companyId);
  const toggle = () => {
    writeCollapsed(companyId, !collapsed);
    setCollapsed(!collapsed);
  };

  return (
    <Panel
      data-guide="home-onboarding"
      title="Thiết lập ban đầu"
      flush
      extra={
        <>
          <span className="text-muted-foreground">
            {data.done}/{data.total} việc
          </span>
          <span
            role="progressbar"
            aria-label="Tiến độ thiết lập"
            aria-valuemin={0}
            aria-valuemax={data.total}
            aria-valuenow={data.done}
            className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-fill sm:block"
          >
            <span className="block h-full bg-primary" style={{ width: `${(data.done / data.total) * 100}%` }} />
          </span>
          <Button variant="ghost" size="sm" onClick={toggle} aria-expanded={!collapsed}>
            {collapsed ? 'Mở rộng' : 'Thu gọn'}
          </Button>
        </>
      }
    >
      {!collapsed && (
        <ol className="divide-y" data-testid="onboarding-list">
          {steps.map((s, i) => (
            <li
              key={s.key}
              data-key={s.key}
              data-done={s.done}
              className="group grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3"
            >
              <span
                className={cn(
                  'grid size-[30px] place-items-center rounded-md bg-fill text-xs font-semibold text-muted-foreground',
                  s.done && 'bg-success/15 text-success-text',
                )}
              >
                {s.done ? <Check className="size-4" aria-label="Đã xong" /> : i + 1}
              </span>
              <div className="min-w-0">
                <b className="text-[13.5px] font-semibold">{s.label}</b>
                {s.optional && (
                  <Badge variant="outline" className="ms-2 align-middle font-normal">
                    Tuỳ chọn
                  </Badge>
                )}
                <span className="block text-[12.5px] text-muted-foreground">{s.hint}</span>
              </div>
              {s.done ? (
                <Badge variant="outline" className="border-success/30 bg-success/10 font-normal text-success-text">
                  <Check className="size-3.5" aria-hidden />
                  Xong
                </Badge>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link to={s.to}>
                    {s.action}
                    <ArrowRight className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0" />
                  </Link>
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
