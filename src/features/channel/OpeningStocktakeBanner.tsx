import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { RotateCcw } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { useRestartOpeningStocktake } from '@/api/shops.api';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { useCan } from '@/hooks/usePermission';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import type { Shop } from '@/types/shop';
import { canRedoStocktake, STOCKTAKE_STATUS_TEXT } from './shopSchemas';

function restartMessage(error: unknown) {
  // shop_not_active dùng chung câu của đẩy sản phẩm, ở đây nói theo việc lập lại phiếu
  if (problemCode(error) === 'shop_not_active') return 'Gian hàng chưa hoạt động nên chưa lập lại phiếu được.';
  return problemMessage(error);
}

/**
 * Thanh báo gian hàng chờ kiểm kê đầu kỳ (§18.6.2). Phiếu bị từ chối hoặc đã huỷ thì có nút
 * "Lập lại phiếu kiểm kê" cho người có quyền kết nối gian hàng (§18.6.11). Phiếu đã ghi sổ mà gian hàng
 * vẫn chờ là BE đang xử lý hoặc bước chốt lỗi lặp lại: chỉ báo, không có nút.
 */
export function OpeningStocktakeBanner({ shop, companyId }: { shop: Shop; companyId: string }) {
  const can = useCan();
  const navigate = useNavigate();
  const restart = useRestartOpeningStocktake();
  const st = shop.openingStocktake;
  if (!st) return null;

  const docLink = (
    <Link
      className="font-mono font-medium underline underline-offset-2"
      to={ROUTES.company.inventoryDoc(companyId, st.documentId)}
    >
      {st.number}
    </Link>
  );
  const redo = canRedoStocktake(st.status);
  const canRestart = redo && can(PERMISSIONS.shopConnect);

  const onRestart = () =>
    restart.mutate(shop.id, {
      onSuccess: ({ shop: next, stocktakeNumber }) => {
        const docId = next.openingStocktake?.documentId;
        toast.success(`Đã lập phiếu kiểm kê ${stocktakeNumber}`, {
          action: docId
            ? { label: 'Mở phiếu', onClick: () => navigate(ROUTES.company.inventoryDoc(companyId, docId)) }
            : undefined,
        });
      },
      onError: (e) => toast.error(restartMessage(e)),
    });

  return (
    <AlertMessage severity="warning" className="mb-4">
      <span data-testid="opening-stocktake-banner" data-stocktake-status={st.status}>
        {st.status === 'posted' ? (
          <>Đang xử lý phiếu kiểm kê {docLink}, quá lâu thì liên hệ quản trị nền tảng.</>
        ) : (
          <>
            Gian hàng đang chờ kiểm kê đầu kỳ: phiếu {docLink} {STOCKTAKE_STATUS_TEXT[st.status]}.{' '}
            {canRestart && 'Lập lại phiếu kiểm kê để kho đếm lại. '}
            {redo && !canRestart && 'Nhờ người quản lý gian hàng lập lại phiếu kiểm kê. '}
            Đến khi phiếu ghi sổ, Commerio chưa đẩy tồn và chưa đẩy sản phẩm lên sàn; đơn vẫn kéo về.
          </>
        )}
      </span>
      {canRestart && (
        <Button size="sm" variant="outline" className="ms-3" disabled={restart.isPending} onClick={onRestart}>
          <RotateCcw />
          Lập lại phiếu kiểm kê
        </Button>
      )}
    </AlertMessage>
  );
}
