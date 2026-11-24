import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Info } from 'lucide-react';
import { useOnboarding } from '@/api/onboarding.api';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/router/routes';
import type { OnboardingKey } from '@/types/onboarding';
import { cn } from '@/lib/utils';
import { fromWelcome } from './welcomeFlow';

/**
 * Thanh "Thiết lập ban đầu, bước n/4" trên trang có sẵn mở từ wizard `/welcome` (FE#419): thiết lập gian hàng, phiếu
 * kiểm kê đầu kỳ. Chỉ hiện khi người dùng đến từ wizard và còn mục bắt buộc chưa xong. `finished` chuyển từ false sang
 * true (vừa hoàn tất thiết lập, phiếu vừa ghi sổ) thì tự về wizard; mở trang khi việc đã xong sẵn thì không chuyển.
 */
export function WelcomeReturnBar({ stepKey, finished, className }: { stepKey: OnboardingKey; finished: boolean; className?: string }) {
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const active = fromWelcome(companyId);
  const onboarding = useOnboarding();
  const welcome = ROUTES.company.welcome(companyId);
  const wasFinished = useRef(finished);

  // Chỉ khi công ty chưa hoàn tất onboarding: sau đó dấu cũ trong tab không còn kéo về wizard
  const onboardingOpen = onboarding.data?.completedAt === null;
  useEffect(() => {
    if (active && onboardingOpen && finished && !wasFinished.current) navigate(welcome);
    wasFinished.current = finished;
  }, [active, onboardingOpen, finished, navigate, welcome]);

  const data = onboarding.data;
  if (!active || !data || data.completedAt !== null || data.done >= data.total) return null;
  const required = data.items.filter((i) => !i.optional);
  const n = required.findIndex((i) => i.key === stepKey) + 1;
  if (!n) return null;

  return (
    <div
      className={cn('flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-accent px-4 py-2.5 text-sm', className)}
      data-testid="welcome-return-bar"
      role="status"
    >
      <Info className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1">
        Thiết lập ban đầu, bước {n}/{required.length}. Xong việc ở trang này sẽ tự về hướng dẫn.
      </span>
      <Link to={welcome} className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" aria-hidden />
        Quay lại hướng dẫn
      </Link>
    </div>
  );
}
