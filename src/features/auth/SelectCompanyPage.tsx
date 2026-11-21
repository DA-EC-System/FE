import { useEffect, useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth, useLogout, useMe } from '@/hooks/useAuth';
import { getErrorMessage } from '@/api/client';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/routes';
import { blockedReason, companyEntry } from './companyEntry';

/** Một tài khoản có thể thuộc nhiều công ty; mỗi công ty là một phiên làm việc riêng. */
export function SelectCompanyPage() {
  const { account, memberships } = useAuth();
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();

  const entry = useMemo(() => companyEntry(memberships), [memberships]);

  // Chỉ còn một công ty vào được thì đi thẳng, sau khi đã tải lại trạng thái mới nhất.
  // Toast đặt trước navigate, Toaster ở App nên giữ qua đổi trang; id cố định để StrictMode không hiện hai lần.
  useEffect(() => {
    if (!me.isSuccess || entry.kind !== 'auto') return;
    if (entry.lockedNotice) toast.warning(entry.lockedNotice, { id: 'locked-companies' });
    navigate(ROUTES.company.root(entry.companyId), { replace: true });
  }, [me.isSuccess, entry, navigate]);

  if (account?.isPlatformAdmin) return <Navigate to={ROUTES.platform.root} replace />;

  return (
    <div className="flex min-h-svh justify-center bg-background p-4 md:p-12">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Chọn công ty</h1>
            <p className="text-muted-foreground">
              Xin chào {account?.fullName}. Chọn công ty bạn muốn làm việc.
            </p>
          </div>
          <Button variant="ghost" onClick={() => void logout()}>
            Đăng xuất
          </Button>
        </div>

        {me.isError && (
          <AlertMessage severity="warning" className="mb-4">
            Không tải lại được danh sách công ty: {getErrorMessage(me.error)}
          </AlertMessage>
        )}

        {me.isPending && memberships.length === 0 ? (
          <div className="grid place-items-center py-12">
            <span className="text-sm text-muted-foreground" role="status">Đang tải…</span>
          </div>
        ) : memberships.length === 0 ? (
          <AlertMessage severity="info">
            Tài khoản chưa thuộc công ty nào. Liên hệ CEO hoặc Admin của công ty để được mời.
          </AlertMessage>
        ) : (
          <div className="grid gap-3">
            {entry.kind === 'all_locked' && (
              <AlertMessage severity="warning">
                Không công ty nào vào được lúc này. Dữ liệu vẫn giữ nguyên; liên hệ CEO công ty hoặc quản trị nền tảng.
              </AlertMessage>
            )}
            {memberships.map((m) => {
              const reason = blockedReason(m);
              return (
                <button
                  key={m.companyId}
                  type="button"
                  disabled={Boolean(reason)}
                  onClick={() => navigate(ROUTES.company.root(m.companyId))}
                  className={cn(
                    'flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-start transition-colors',
                    reason
                      ? 'cursor-not-allowed opacity-60'
                      : 'hover:border-primary hover:bg-accent',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{m.companyName}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {m.roles.map((r) => (
                        <Badge key={r} variant="outline">
                          {r}
                        </Badge>
                      ))}
                    </div>
                    {reason && <div className="mt-1 text-xs text-destructive">{reason}</div>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
