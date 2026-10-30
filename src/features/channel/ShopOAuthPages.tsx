import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, ShieldCheck, X } from 'lucide-react';
import { PageSpinner } from '@/components/common/PageSpinner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useShopCallback } from '@/api/shops.api';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/router/routes';
import type { Marketplace } from '@/types/shop';
import { platformLabel } from './shopSchemas';
import { OAUTH_COMPANY_KEY } from './useStartConnect';
import { connectedToast } from './connectResult';

/**
 * redirect_uri cố định của sàn (/channel/:platform/callback): chuyển vào khu của công ty đã bắt đầu
 * kết nối để có token của đúng công ty, rồi mới gửi code lên BE.
 */
export function ShopOAuthRedirect() {
  const [params] = useSearchParams();
  const { platform = '' } = useParams();
  const { companyContext, memberships } = useAuth();
  let saved = '';
  try {
    saved = sessionStorage.getItem(OAUTH_COMPANY_KEY) ?? '';
  } catch {
    // Không đọc được thì dùng công ty đang chọn
  }
  const companyId =
    [saved, companyContext?.companyId].find((id) => id && memberships.some((m) => m.companyId === id)) ??
    (memberships.length === 1 ? memberships[0].companyId : '');

  useEffect(() => {
    if (!companyId) toast.error('Không xác định được công ty đang kết nối gian hàng. Chọn công ty rồi kết nối lại.');
  }, [companyId]);

  if (!companyId) return <Navigate to={ROUTES.selectCompany} replace />;
  return <Navigate to={`${ROUTES.company.shopOAuthCallback(companyId, platform)}?${params}`} replace />;
}

/** UC-CH-01 bước 6–8: sàn đã cấp code, BE đổi lấy token và lưu gian hàng */
export function ShopOAuthCallbackPage() {
  const [params] = useSearchParams();
  const { platform } = useParams();
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const callback = useShopCallback();
  // StrictMode chạy effect hai lần; code chỉ dùng được một lần
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current || !companyId) return;
    sent.current = true;
    try {
      sessionStorage.removeItem(OAUTH_COMPANY_KEY);
    } catch {
      // bỏ qua
    }
    const back = () => navigate(ROUTES.company.shops(companyId), { replace: true });
    const state = params.get('state');
    if (params.get('error')) {
      toast.info('Bạn đã từ chối uỷ quyền, chưa kết nối gian hàng nào.');
      back();
      return;
    }
    if (!state || !platform) {
      toast.error('Phiên kết nối đã hết hạn hoặc không hợp lệ. Hãy bấm Kết nối lại từ đầu.');
      back();
      return;
    }
    callback
      .mutateAsync({ platform, state, params: Object.fromEntries([...params].filter(([key]) => key !== 'state')) })
      .then((result) => {
        toast.success(connectedToast(result));
        if (result.shops.length === 1 && result.shop.status === 'connecting') {
          navigate(ROUTES.company.shopSetup(companyId, result.shop.id), { replace: true });
          return;
        }
        back();
      })
      .catch((e) => {
        toast.error(problemMessage(e));
        back();
      });
  }, [companyId, platform, params, navigate, callback]);

  return <PageSpinner />;
}

/**
 * Trang uỷ quyền của sàn giả lập: đóng vai trang đăng nhập và đồng ý cấp quyền của sàn.
 * Đồng ý thì gửi về redirect_uri kèm code (gói mã và tên gian hàng), từ chối thì kèm error.
 */
export function MockOAuthPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const platform = (params.get('platform') ?? 'mock') as Marketplace;
  const state = params.get('state') ?? '';
  const reconnect = params.get('shop_id');
  const [externalShopId, setExternalShopId] = useState(
    () => reconnect ?? `${platform}-shop-${Math.random().toString(36).slice(2, 6)}`,
  );
  const [shopName, setShopName] = useState(
    () => params.get('shop_name') ?? `Gian hàng thử ${platformLabel(platform) ?? platform}`,
  );
  const [errors, setErrors] = useState<{ externalShopId?: string; shopName?: string }>({});

  // Chỉ quay về chính app: tránh biến trang này thành nơi chuyển hướng tuỳ ý
  let target: URL | null = null;
  try {
    target = new URL(params.get('redirect_uri') ?? '', window.location.origin);
    if (target.origin !== window.location.origin) target = null;
  } catch {
    target = null;
  }

  const finish = (extra: Record<string, string>) => {
    if (!target) return;
    const search = new URLSearchParams({ ...extra, state });
    navigate(`${target.pathname}?${search}`);
  };

  const approve = () => {
    const next = {
      externalShopId: externalShopId.trim() ? undefined : 'Nhập mã gian hàng',
      shopName: shopName.trim() ? undefined : 'Nhập tên gian hàng',
    };
    setErrors(next);
    if (next.externalShopId || next.shopName) return;
    const code = btoa(encodeURIComponent(JSON.stringify({ externalShopId: externalShopId.trim(), shopName: shopName.trim() })));
    finish({ code });
  };

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            {platformLabel(platform) ?? platform} · Uỷ quyền ứng dụng
          </CardTitle>
          <CardDescription>
            Đây là sàn giả lập. Commerio xin quyền đọc đơn hàng, cập nhật sản phẩm, giá và tồn kho của gian hàng.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!target && <AlertMessage severity="error">Địa chỉ quay về không hợp lệ.</AlertMessage>}
          <div className="grid gap-2">
            <Label htmlFor="mock-shop-id">Mã gian hàng trên sàn</Label>
            <Input
              id="mock-shop-id"
              value={externalShopId}
              aria-invalid={Boolean(errors.externalShopId)}
              onChange={(e) => setExternalShopId(e.target.value)}
            />
            {errors.externalShopId && <p className="text-sm text-destructive">{errors.externalShopId}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="mock-shop-name">Tên gian hàng</Label>
            <Input
              id="mock-shop-name"
              value={shopName}
              aria-invalid={Boolean(errors.shopName)}
              onChange={(e) => setShopName(e.target.value)}
            />
            {errors.shopName && <p className="text-sm text-destructive">{errors.shopName}</p>}
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="outline" disabled={!target} onClick={() => finish({ error: 'access_denied' })}>
            <X />
            Từ chối
          </Button>
          <Button disabled={!target} onClick={approve}>
            <Check />
            Đồng ý
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
