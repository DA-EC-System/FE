import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Info, RotateCcw, ShieldCheck, TriangleAlert, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStockDoc } from '@/api/inventory.api';
import { onboardingKey } from '@/api/onboarding.api';
import { useRestartOpeningStocktake, useShops } from '@/api/shops.api';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { useCan } from '@/hooks/usePermission';
import { useAuthStore } from '@/stores/authStore';
import { PERMISSIONS } from '@/utils/permissions';
import { StockDocPage } from '@/features/inventory/StockDocPage';
import { canRedoStocktake, STOCKTAKE_STATUS_TEXT } from '@/features/channel/shopSchemas';
import type { WizardStep } from '../wizardState';
import { InviteWarehouseActions } from './InviteWarehouseButton';

/**
 * Bước 7 Tồn đầu kỳ (design v2.html s7, s7kho; Documents/21 §18.6.2): phiếu kiểm kho đầu kỳ nhúng thẳng trong wizard.
 * `countOnly`: người xem chỉ có bước này (Nhân viên kho được mời, BE lọc bước theo quyền, mục 23) thì hiện câu cho người
 * đếm, không có nút mời. Câu dẫn theo trạng thái phiếu và vai: nháp thì ai đếm, ai duyệt (`canSelfApprove`: CEO hoặc
 * công ty một thành viên); chờ duyệt thì người có quyền duyệt thấy việc duyệt, người khác thấy đang chờ. Phiếu bị từ
 * chối, hoặc đã huỷ (BE thôi trả `ref`) thì lập lại phiếu ngay tại bước (§18.6.11).
 */
export function OpeningStockStep({ step, companyName, countOnly }: { step: WizardStep; companyName: string; countOnly: boolean }) {
  const canSelfApprove = useAuthStore((s) => Boolean(s.companyContext?.canSelfApprove));
  const can = useCan();
  const docId = step.ref?.type === 'stock_document' ? step.ref.id : null;
  // Cùng khoá với StockDocPage nhúng bên dưới nên không gọi thêm
  const status = useStockDoc(docId ?? undefined).data?.status;

  if (!docId) {
    if (step.done) return <Note icon={<Info className="text-primary" />}>Phiếu kiểm kho đầu kỳ đã ghi sổ.</Note>;
    return (
      <Note icon={<Info className="text-primary" />}>
        <div className="grid justify-items-start gap-2">
          <span>
            Chưa có phiếu kiểm kho đầu kỳ đang mở. Phiếu được lập khi hoàn tất thiết lập gian hàng với lựa chọn kiểm kho trước khi đồng
            bộ; phiếu đã huỷ thì lập lại phiếu kiểm kho để đếm.
          </span>
          <RedoStocktake docId={null} />
        </div>
      </Note>
    );
  }

  const approver = can(PERMISSIONS.stockDocApprove);
  let lead: ReactNode;
  if (status === 'rejected' || status === 'cancelled') {
    lead = (
      <Note icon={<TriangleAlert className="text-warning" />} tone="warning">
        <div className="grid justify-items-start gap-2">
          <span>
            Phiếu kiểm kho đầu kỳ {STOCKTAKE_STATUS_TEXT[status]}, không đi tiếp được. Lập lại phiếu kiểm kho để đếm lại; phiếu mới điền
            sẵn tồn hiện tại.
          </span>
          <RedoStocktake docId={docId} />
        </div>
      </Note>
    );
  } else if (status === 'pending') {
    lead = (
      <Note icon={<ShieldCheck className="text-primary" />}>
        {approver ? (
          <>
            <b className="font-semibold">Phiếu đã gửi duyệt.</b> Xem số đếm rồi Duyệt để ghi sổ, hoặc Từ chối để đếm lại.
          </>
        ) : (
          <>
            <b className="font-semibold">Phiếu đã gửi duyệt, chờ CEO duyệt.</b> Tồn kho chỉ đổi khi phiếu được duyệt và ghi sổ.
          </>
        )}
      </Note>
    );
  } else if (countOnly) {
    lead = (
      <Note icon={<UserRound className="text-primary" />}>
        <b className="font-semibold">Bạn được mời để đếm tồn đầu kỳ cho {companyName}.</b> Nhập số đếm từng dòng rồi Gửi duyệt. CEO duyệt
        thì tồn mới ghi sổ và Commerio bắt đầu bán. Các bước trước CEO đã làm xong.
      </Note>
    );
  } else {
    lead = (
      <Note icon={<ShieldCheck className="text-primary" />}>
        {canSelfApprove ? (
          <>
            <b className="font-semibold">Bạn đếm và gửi duyệt: bạn là CEO nên tự duyệt được, phiếu ghi là tự duyệt.</b> Nhân viên kho đếm
            và gửi duyệt: bạn duyệt.
          </>
        ) : (
          <>
            <b className="font-semibold">Bạn hoặc nhân viên kho đếm và gửi duyệt, CEO duyệt.</b> Người duyệt khác người gửi.
          </>
        )}{' '}
        Tồn kho chỉ đổi khi phiếu được duyệt và ghi sổ.
      </Note>
    );
  }

  const intro = (
    <div className="grid gap-3">
      {!countOnly && status !== 'posted' && (
        <Note icon={<TriangleAlert className="text-warning" />} tone="warning">
          Trong lúc chờ phiếu ghi sổ, Commerio chưa cập nhật tồn lên sàn và chưa giữ hàng cho đơn. Sàn giữ số đang có.
        </Note>
      )}
      {lead}
      {!countOnly && status === 'draft' && <InviteWarehouseActions label="Nhờ người khác đếm?" showRequests />}
    </div>
  );

  return <StockDocPage embedded={{ docId, intro }} />;
}

function restartMessage(error: unknown) {
  if (problemCode(error) === 'shop_not_active') return 'Gian hàng chưa hoạt động nên chưa lập lại phiếu được.';
  return problemMessage(error);
}

/**
 * "Lập lại phiếu kiểm kho" ngay trong bước 7 (POST /channel/shops/:id/opening-stocktake, như OpeningStocktakeBanner).
 * Gian hàng lấy từ danh sách: phiếu đúng `docId`, hoặc (`docId` null: phiếu đã huỷ, BE thôi trả ref) gian hàng có phiếu
 * bị từ chối/đã huỷ. Lập xong đọc lại onboarding để bước nhận phiếu mới.
 */
function RedoStocktake({ docId }: { docId: string | null }) {
  const can = useCan();
  const companyId = useAuthStore((s) => s.companyContext?.companyId ?? '');
  const qc = useQueryClient();
  const allowed = can(PERMISSIONS.shopConnect);
  const shops = useShops({ enabled: allowed });
  const restart = useRestartOpeningStocktake();
  if (!allowed) return <span className="text-muted-foreground">Nhờ người quản lý gian hàng lập lại phiếu kiểm kho.</span>;
  const shop = shops.data?.items.find((s) => {
    const st = s.openingStocktake;
    return st && canRedoStocktake(st.status) && (docId === null || st.documentId === docId);
  });
  if (!shop) return null;

  const onRestart = () =>
    restart.mutate(shop.id, {
      onSuccess: ({ stocktakeNumber }) => {
        toast.success(`Đã lập phiếu kiểm kho ${stocktakeNumber}`);
        void qc.invalidateQueries({ queryKey: onboardingKey(companyId) });
      },
      onError: (e) => toast.error(restartMessage(e)),
    });

  return (
    <Button size="sm" variant="outline" disabled={restart.isPending} onClick={onRestart}>
      <RotateCcw />
      Lập lại phiếu kiểm kho
    </Button>
  );
}

function Note({ icon, tone, children }: { icon: ReactNode; tone?: 'warning'; children: ReactNode }) {
  return (
    <div
      className={
        tone === 'warning'
          ? 'flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm'
          : 'flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm'
      }
    >
      <span className="mt-0.5 shrink-0 [&>svg]:size-4" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
