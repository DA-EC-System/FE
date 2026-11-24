import { Info, ShieldCheck, TriangleAlert, UserRound } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { StockDocPage } from '@/features/inventory/StockDocPage';
import type { WizardStep } from '../wizardState';
import { InviteWarehouseButton } from './InviteWarehouseButton';

/**
 * Bước 7 Tồn đầu kỳ (design v2.html s7, s7kho; Documents/21 §18.6.2): phiếu kiểm kê đầu kỳ nhúng thẳng trong wizard.
 * `countOnly`: người xem chỉ có bước này (Nhân viên kho được mời, BE lọc bước theo quyền, mục 23) thì hiện câu cho người
 * đếm, không có nút mời. Câu ai đếm, ai duyệt theo `canSelfApprove` (CEO hoặc công ty một thành viên).
 */
export function OpeningStockStep({ step, companyName, countOnly }: { step: WizardStep; companyName: string; countOnly: boolean }) {
  const canSelfApprove = useAuthStore((s) => Boolean(s.companyContext?.canSelfApprove));
  const docId = step.ref?.type === 'stock_document' ? step.ref.id : null;

  if (!docId) {
    return (
      <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm" role="status">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        {step.done
          ? 'Phiếu kiểm kê đầu kỳ đã ghi sổ.'
          : 'Phiếu kiểm kê đầu kỳ được tạo khi hoàn tất thiết lập gian hàng ở bước 6, với kiểm kho trước khi đồng bộ.'}
      </div>
    );
  }

  const intro = (
    <div className="grid gap-3">
      {countOnly ? (
        <Note icon={<UserRound className="text-primary" />}>
          <b className="font-semibold">Bạn được mời để đếm tồn đầu kỳ cho {companyName}.</b> Nhập số đếm từng dòng rồi Gửi duyệt. CEO duyệt
          thì tồn mới ghi sổ và Commerio bắt đầu bán. Các bước trước CEO đã làm xong.
        </Note>
      ) : (
        <>
          <Note icon={<TriangleAlert className="text-warning" />} tone="warning">
            Trong lúc chờ phiếu ghi sổ, Commerio chưa cập nhật tồn lên sàn và chưa giữ hàng cho đơn. Sàn giữ số đang có.
          </Note>
          <Note icon={<ShieldCheck className="text-primary" />}>
            {canSelfApprove ? (
              <>
                <b className="font-semibold">Bạn đếm và gửi duyệt: bạn là CEO nên tự duyệt được, phiếu ghi là tự duyệt.</b> Nhân viên kho
                đếm và gửi duyệt: bạn duyệt.
              </>
            ) : (
              <>
                <b className="font-semibold">Bạn hoặc nhân viên kho đếm và gửi duyệt, CEO duyệt.</b> Người duyệt khác người gửi.
              </>
            )}{' '}
            Tồn kho chỉ đổi khi phiếu được duyệt và ghi sổ.
          </Note>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Nhờ người khác đếm?</span>
            <InviteWarehouseButton />
          </div>
        </>
      )}
    </div>
  );

  return <StockDocPage embedded={{ docId, intro }} />;
}

function Note({ icon, tone, children }: { icon: React.ReactNode; tone?: 'warning'; children: React.ReactNode }) {
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
      <div>{children}</div>
    </div>
  );
}
