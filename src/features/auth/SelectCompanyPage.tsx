import { useEffect, useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Building2, Loader2, Lock } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth, useLogout, useMe } from '@/hooks/useAuth';
import { getErrorMessage } from '@/api/client';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/routes';
import type { Membership } from '@/types/auth';

function blockedReason(m: Membership): string | null {
  if (m.companyStatus === 'locked') return 'Công ty đang bị khoá';
  if (m.status === 'locked') return 'Tài khoản của bạn bị khoá trong công ty này';
  return null;
}

/** Một tài khoản có thể thuộc nhiều công ty; mỗi công ty là một phiên làm việc riêng. */
export function SelectCompanyPage() {
  const { account, memberships } = useAuth();
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();

  const usable = useMemo(() => memberships.filter((m) => !blockedReason(m)), [memberships]);

  // Chỉ có một công ty vào được thì đi thẳng, sau khi đã tải lại trạng thái mới nhất
  useEffect(() => {
    if (me.isSuccess && usable.length === 1 && memberships.length === 1) {
      navigate(ROUTES.company.root(usable[0].companyId), { replace: true });
    }
  }, [me.isSuccess, usable, memberships.length, navigate]);

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
          <Button variant="ghost" onClick={logout}>
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
            <Loader2 className="size-8 animate-spin text-primary" aria-label="Đang tải" />
          </div>
        ) : memberships.length === 0 ? (
          <AlertMessage severity="info">
            Tài khoản chưa thuộc công ty nào. Liên hệ CEO hoặc Admin của công ty để được mời.
          </AlertMessage>
        ) : (
          <div className="grid gap-3">
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
                  {reason ? (
                    <Lock className="size-6 shrink-0 text-muted-foreground" />
                  ) : (
                    <Building2 className="size-6 shrink-0 text-primary" />
                  )}
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
