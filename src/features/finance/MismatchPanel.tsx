import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Panel } from '@/components/common/Panel';
import { Money } from '@/components/common/Money';
import { FlagChips } from '@/components/common/FlagChips';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrderPayments } from '@/api/financeLifecycle.api';
import { problemMessage } from '@/api/problemMessages';
import { useTransitionActor } from '@/hooks/usePermission';
import { resolveBlock } from '@/lib/machines/settlement';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS as P } from '@/utils/permissions';
import { cn } from '@/lib/utils';
import type { OrderPayment } from '@/types/settlement';
import { PAYMENT_FLAGS } from './lifecycleShared';
import { LifecycleActionDialog } from './LifecycleActionDialog';

/** Dòng đã chốt nền xanh nhạt bao lâu rồi ẩn */
const SOLVED_MS = 1500;
const GRID = 'grid gap-x-4 gap-y-2 px-4 py-3 grid-cols-2 md:grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)_110px_200px] md:items-center';

type Action = { payment: OrderPayment; kind: 'resolve' | 'ceo-approve' };

/**
 * Dòng lệch theo `.rc` của Test_UI (FE#140): mỗi đơn lệch tiền một dòng, nút xử lý ngay trên dòng.
 * Chốt xong dòng nền xanh nhạt rồi ẩn; CEO duyệt xong dòng ở lại để người chốt làm tiếp.
 */
export function MismatchPanel({ companyId, shopId }: { companyId: string; shopId?: string }) {
  const navigate = useNavigate();
  const actor = useTransitionActor();
  const query = useOrderPayments({ page: 1, pageSize: 50, shopId, status: 'mismatch' });
  const [action, setAction] = useState<Action | null>(null);
  const [solved, setSolved] = useState<Record<string, OrderPayment>>({});
  const solvedIds = Object.keys(solved).join(',');

  useEffect(() => {
    if (!solvedIds) return;
    const t = window.setTimeout(() => setSolved({}), SOLVED_MS);
    return () => window.clearTimeout(t);
  }, [solvedIds]);

  const items = query.data?.items ?? [];
  const rows = [...items, ...Object.values(solved).filter((s) => !items.some((i) => i.orderId === s.orderId))];
  const canApprove = actor.permissions.includes(P.settlementApprove);
  const open = (p: OrderPayment) => navigate(ROUTES.company.settlement(companyId, p.orderId));

  return (
    <Panel
      title="Dòng lệch"
      extra={<span className="text-[12.5px] text-muted-foreground tabular-nums">{query.data?.total ?? 0}</span>}
      flush
      className="mt-4"
      data-guide="settlement-mismatch"
      data-testid="mismatch-panel"
    >
      {query.isError && <AlertMessage severity="error">{problemMessage(query.error)}</AlertMessage>}
      <div className={cn(GRID, 'hidden py-2.5 text-xs text-muted-foreground md:grid')}>
        <div>Đơn</div>
        <div>Sàn quyết toán</div>
        <div>Commerio ước tính</div>
        <div className="text-end">Lệch</div>
        <div />
      </div>
      {query.isLoading && <Skeleton className="m-4 h-10" />}
      {!query.isLoading && rows.length === 0 && (
        <p className="border-t px-4 py-6 text-center text-sm text-muted-foreground">Không còn đơn lệch tiền.</p>
      )}
      {rows.map((p) => {
        const isSolved = Boolean(solved[p.orderId]);
        const block = resolveBlock(p, actor);
        const needCeo = p.needsCeoApproval && !p.ceoApproval;
        return (
          <div
            key={p.orderId}
            data-row-id={p.orderCode ?? p.orderId}
            data-solved={isSolved || undefined}
            className={cn(GRID, 'border-t text-sm transition-colors duration-300', isSolved && 'bg-success-soft')}
          >
            <div className="grid gap-1">
              <button type="button" className="text-start font-mono text-primary hover:underline" onClick={() => open(p)}>
                {p.orderCode ?? p.orderId}
              </button>
              <FlagChips flags={p.flags} meta={PAYMENT_FLAGS} />
            </div>
            <div>
              {p.settledTotal === null ? <span className="text-muted-foreground">Chưa có trong quyết toán</span> : <Money value={p.settledTotal} />}
            </div>
            <div>
              <Money value={p.estimatedTotal} />
            </div>
            <div className="text-end font-medium">{p.diff === null ? '—' : <Money value={p.diff} />}</div>
            <div className="col-span-2 flex flex-wrap items-center justify-start gap-1.5 md:col-span-1 md:justify-end">
              {isSolved ? (
                <Badge variant="success">Đã chốt</Badge>
              ) : (
                <>
                  {needCeo && canApprove && (
                    <Button size="sm" variant="outline" onClick={() => setAction({ payment: p, kind: 'ceo-approve' })}>
                      CEO duyệt lệch
                    </Button>
                  )}
                  {!block && (
                    <Button size="sm" onClick={() => setAction({ payment: p, kind: 'resolve' })}>
                      Chốt lệch
                    </Button>
                  )}
                  {block && !(needCeo && canApprove) && (
                    <span className="text-xs text-muted-foreground">
                      {block === 'ceo_approval_required' ? 'Cần CEO duyệt' : block === 'second_person_required' ? 'Cần người khác chốt' : ''}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
      {action && (
        <LifecycleActionDialog
          path={`/finance/payments/${action.payment.orderId}/${action.kind}`}
          version={action.payment.version}
          field={action.kind === 'resolve' ? 'reason' : undefined}
          title={action.kind === 'resolve' ? 'Chốt lệch' : 'CEO duyệt lệch'}
          onDone={() => action.kind === 'resolve' && setSolved((s) => ({ ...s, [action.payment.orderId]: action.payment }))}
          onClose={() => setAction(null)}
        />
      )}
    </Panel>
  );
}
