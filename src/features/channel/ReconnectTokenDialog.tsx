import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { tokenSourcePhrase } from '@/api/problemMessages';
import { ROUTES } from '@/router/routes';
import type { Shop, ShopCallbackResult } from '@/types/shop';
import { platformLabel } from './shopSchemas';
import { ShopTokenForm } from './ShopTokenForm';
import { ConnectedScreen } from './ConnectedScreen';
import { ResultScreen } from './ConnectOutcome';
import { failureScreen, type ConnectFailure } from './connectFailure';

interface ReconnectTokenDialogProps {
  /** Gian hàng đang kết nối lại; null là hộp đóng */
  shop: Shop | null;
  /** Tên sàn theo GET /channel/shops/platforms */
  platformName?: string;
  companyId: string;
  onClose: () => void;
}

/**
 * Kết nối lại một gian hàng bằng token (shop thử không đi OAuth được, commerio-backend#398). Gửi `shopId` nên BE chỉ nối lại
 * đúng gian hàng này; token của seller khác thì hiện màn so sánh hai gian hàng, không gian hàng nào đổi.
 */
export function ReconnectTokenDialog({ shop, platformName, companyId, onClose }: ReconnectTokenDialogProps) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ShopCallbackResult | null>(null);
  const [failure, setFailure] = useState<ConnectFailure | null>(null);

  const close = () => {
    setResult(null);
    setFailure(null);
    onClose();
  };
  const go = (to: string) => {
    close();
    navigate(to);
  };
  const name = shop ? platformLabel(shop.platform, platformName ?? shop.platformName) : '';

  return (
    <Dialog open={shop !== null} onOpenChange={(v) => !v && !busy && close()}>
      <DialogContent className="sm:max-w-2xl" data-testid="reconnect-token">
        {shop &&
          (result ? (
            <>
              <DialogHeader className="sr-only">
                <DialogTitle>Kết quả kết nối lại</DialogTitle>
                <DialogDescription>Gian hàng vừa nối lại qua token</DialogDescription>
              </DialogHeader>
              <ConnectedScreen
                result={result}
                platformName={platformName}
                onSetup={(id) => go(ROUTES.company.shopSetup(companyId, id))}
                onView={(id) => go(ROUTES.company.shop(companyId, id))}
                onLater={close}
              />
            </>
          ) : failure ? (
            <>
              <DialogHeader className="sr-only">
                <DialogTitle>Kết quả kết nối lại</DialogTitle>
                <DialogDescription>Chưa nối lại được gian hàng qua token</DialogDescription>
              </DialogHeader>
              <ResultScreen
                {...failureScreen(failure, platformName)}
                actions={
                  <>
                    <Button variant="outline" onClick={close}>
                      Đóng
                    </Button>
                    <Button onClick={() => setFailure(null)}>Dán token khác</Button>
                  </>
                }
              />
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Kết nối lại {shop.shopName}</DialogTitle>
                <DialogDescription>
                  Dán mã truy cập (access token) của đúng gian hàng này, lấy {tokenSourcePhrase(shop.platform)}. Token của
                  gian hàng khác sẽ bị từ chối, không gian hàng nào bị đổi.
                </DialogDescription>
              </DialogHeader>
              <ShopTokenForm
                platform={shop.platform}
                name={name}
                shopId={shop.id}
                backLabel="Huỷ"
                onBack={close}
                onBusyChange={setBusy}
                onDone={setResult}
                onFailure={setFailure}
              />
            </>
          ))}
      </DialogContent>
    </Dialog>
  );
}
