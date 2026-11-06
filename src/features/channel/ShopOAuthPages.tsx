import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, ShieldCheck, X } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useShopCallback } from '@/api/shops.api';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/router/routes';
import type { Marketplace, ShopCallbackResult } from '@/types/shop';
import { useCan } from '@/hooks/usePermission';
import { PERMISSIONS } from '@/utils/permissions';
import { platformLabel } from './shopSchemas';
import { OAUTH_COMPANY_KEY, OAUTH_TARGET_KEY, readConnectTarget, useStartConnect } from './useStartConnect';
import { ConnectSteps, ResultScreen } from './ConnectOutcome';
import { NO_COMPANY_SCREEN, failureFromError, failureScreen, type ConnectFailure } from './connectFailure';
import { ConnectedScreen } from './ConnectedScreen';

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

  if (!companyId) {
    return (
      <div className="flex min-h-svh items-start justify-center bg-background p-4 sm:pt-16">
        <ResultScreen
          {...NO_COMPANY_SCREEN}
          actions={
            <Button asChild>
              <Link to={ROUTES.selectCompany}>Chọn công ty</Link>
            </Button>
          }
        />
      </div>
    );
  }
  return <Navigate to={`${ROUTES.company.shopOAuthCallback(companyId, platform)}?${params}`} replace />;
}

/** Bước của luồng uỷ quyền khi sàn đã trả người dùng về Commerio */
const CALLBACK_STEPS = ['Nhận mã uỷ quyền từ sàn', 'Đổi mã lấy token, mã hoá rồi lưu', 'Đọc thông tin gian hàng'];

/** UC-CH-01 bước 6–8: sàn đã cấp code, BE đổi lấy token và lưu gian hàng (Documents/21 §18.4) */
export function ShopOAuthCallbackPage() {
  const [params] = useSearchParams();
  const { platform = '' } = useParams();
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const callback = useShopCallback();
  const connector = useStartConnect();
  const [failure, setFailure] = useState<ConnectFailure | null>(null);
  const [connected, setConnected] = useState<ShopCallbackResult | null>(null);
  const can = useCan();
  const [target] = useState(readConnectTarget);
  // StrictMode chạy effect hai lần; code chỉ dùng được một lần
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current || !companyId) return;
    sent.current = true;
    try {
      sessionStorage.removeItem(OAUTH_COMPANY_KEY);
      sessionStorage.removeItem(OAUTH_TARGET_KEY);
    } catch {
      // bỏ qua
    }
    const state = params.get('state');
    // Từ chối trên sàn (`error=access_denied`, TikTok `auth_denied`): không gọi BE
    if (params.get('error')) {
      setFailure({ kind: 'declined', platform });
      return;
    }
    // Không có state của Commerio (uỷ quyền bấm từ trang của sàn): không gọi BE (§18.6.3)
    if (!state) {
      setFailure({ kind: 'no_state', platform });
      return;
    }
    callback
      .mutateAsync({ platform, state, params: Object.fromEntries([...params].filter(([key]) => key !== 'state')) })
      // Hiện màn kết quả, người dùng chọn thiết lập ngay hay để sau (§18.4)
      .then(setConnected)
      .catch((e) => setFailure(failureFromError(e)));
  }, [companyId, platform, params, callback]);

  const shops = ROUTES.company.shops(companyId);

  if (connected) {
    return (
      <ConnectedScreen
        result={connected}
        onSetup={can(PERMISSIONS.shopConnect) ? (id) => navigate(ROUTES.company.shopSetup(companyId, id), { replace: true }) : undefined}
        onView={(id) => navigate(ROUTES.company.shop(companyId, id), { replace: true })}
        onLater={() => navigate(shops, { replace: true })}
        onAddAnother={() => navigate(shops, { replace: true, state: { addShop: true } })}
      />
    );
  }

  if (!failure) {
    return (
      <Card className="mx-auto mt-2 w-full max-w-md gap-3 px-6 py-6" aria-busy="true">
        <div className="grid gap-1">
          <h1 className="text-lg font-semibold">Đang nối gian hàng {platformLabel(platform)}</h1>
          <p className="text-sm text-muted-foreground">Giữ trang này mở, việc này mất vài giây.</p>
        </div>
        <ConnectSteps steps={CALLBACK_STEPS} current={1} />
      </Card>
    );
  }

  // Thử lại đúng sàn và gian hàng vừa bắt đầu; không biết thì mở lại hộp thêm gian hàng
  const retryTarget = target ?? (platform ? { platform } : null);
  // §18.7.4: không cho nối lại ngay trong công ty sai, chỉ cho chuyển sang công ty đã bắt đầu kết nối
  if (failure.kind === 'company_mismatch') {
    const { expected } = failure;
    return (
      <ResultScreen
        {...failureScreen(failure)}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(shops, { replace: true })}>
              Về danh sách gian hàng
            </Button>
            {expected ? (
              <Button asChild>
                <Link to={ROUTES.company.shops(expected.id)} replace state={{ addShop: true }}>
                  Chuyển sang {expected.name}
                </Link>
              </Button>
            ) : (
              <Button asChild>
                <Link to={ROUTES.selectCompany}>Chọn công ty</Link>
              </Button>
            )}
          </>
        }
      />
    );
  }
  const retryLabel =
    failure.kind === 'mismatch' && failure.expected
      ? `Kết nối lại ${failure.expected.name ?? failure.expected.externalShopId}`
      : failure.kind === 'state_invalid' || failure.kind === 'no_state'
        ? 'Bắt đầu lại'
        : failure.kind === 'elsewhere'
          ? 'Thử tài khoản khác'
          : 'Thử lại';
  return (
    <ResultScreen
      {...failureScreen(failure)}
      actions={
        <>
          <Button variant="outline" onClick={() => navigate(shops, { replace: true })}>
            Về danh sách gian hàng
          </Button>
          {retryTarget && (
            <Button disabled={connector.pending} onClick={() => connector.start(retryTarget)}>
              {retryLabel}
            </Button>
          )}
        </>
      }
    />
  );
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
