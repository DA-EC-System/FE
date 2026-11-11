import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Lock, Store } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { useShopPlatforms } from '@/api/shops.api';
import { getErrorMessage } from '@/api/client';
import { ROUTES } from '@/router/routes';
import { cn } from '@/lib/utils';
import type { ShopCallbackResult, ShopConnectMethod, ShopPlatform } from '@/types/shop';
import { capabilitySummary } from './shopSchemas';
import { useStartConnect } from './useStartConnect';
import { ShopTokenForm } from './ShopTokenForm';
import { ConnectedScreen } from './ConnectedScreen';

const PLATFORM_HINTS: Record<string, string | undefined> = {
  tiktok: 'Đăng nhập TikTok Shop Seller Center để uỷ quyền.',
  shopee: 'Đăng nhập Shopee Open Platform để uỷ quyền.',
  lazada: 'Đăng nhập Lazada Seller Center để uỷ quyền.',
  mock: 'Sàn mô phỏng để thử luồng kết nối, không cần tài khoản sàn.',
};

const lockedReason = (p: ShopPlatform) => p.reason || 'Sàn này chưa mở kết nối.';

interface AddShopDialogProps {
  open: boolean;
  companyId: string;
  onClose: () => void;
}

/** Thêm gian hàng (Test_UI): chọn sàn, chọn cách nối (uỷ quyền hay dán token) rồi tiếp tục */
export function AddShopDialog({ open, companyId, onClose }: AddShopDialogProps) {
  const navigate = useNavigate();
  const platformsQuery = useShopPlatforms({ enabled: open });
  const platforms = platformsQuery.data?.items ?? [];
  const connector = useStartConnect();
  const [picked, setPicked] = useState<string | null>(null);
  const [method, setMethod] = useState<ShopConnectMethod | null>(null);
  const [step, setStep] = useState<'choose' | 'token'>('choose');
  const [tokenBusy, setTokenBusy] = useState(false);
  const [result, setResult] = useState<ShopCallbackResult | null>(null);

  // Mặc định chọn sàn nối được đầu tiên
  const selected =
    platforms.find((p) => p.platform === picked && p.connectable) ?? platforms.find((p) => p.connectable) ?? null;
  const methods: ShopConnectMethod[] = selected?.methods?.length ? selected.methods : ['oauth'];
  const chosenMethod = method && methods.includes(method) ? method : methods[0];

  const reset = () => {
    setPicked(null);
    setMethod(null);
    setStep('choose');
    setResult(null);
  };
  const close = () => {
    reset();
    onClose();
  };
  const go = (to: string) => {
    close();
    navigate(to);
  };

  const pick = (p: ShopPlatform) => {
    if (!p.connectable) {
      toast.info(`${p.name}: ${lockedReason(p)}`);
      return;
    }
    setPicked(p.platform);
    setMethod(null);
  };
  const next = () => {
    if (!selected) return;
    if (chosenMethod === 'token') setStep('token');
    else connector.start({ platform: selected.platform });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !connector.pending && !tokenBusy && close()}>
      <DialogContent className="sm:max-w-2xl" data-testid="connect-section">
        {result ? (
          <>
            <DialogHeader className="sr-only">
              <DialogTitle>Kết quả kết nối</DialogTitle>
              <DialogDescription>Gian hàng vừa nối qua token</DialogDescription>
            </DialogHeader>
            <ConnectedScreen
              result={result}
              platformName={selected?.name}
              onSetup={(id) => go(ROUTES.company.shopSetup(companyId, id))}
              onView={(id) => go(ROUTES.company.shop(companyId, id))}
              onLater={close}
              onAddAnother={reset}
            />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Thêm gian hàng</DialogTitle>
              <DialogDescription>
                Chọn sàn, đăng nhập tài khoản người bán và đồng ý cấp quyền. Commerio không lưu mật khẩu sàn.
              </DialogDescription>
            </DialogHeader>
            {step === 'token' && selected ? (
              <ShopTokenForm
                platform={selected.platform}
                name={selected.name}
                onBack={() => setStep('choose')}
                onBusyChange={setTokenBusy}
                onDone={setResult}
              />
            ) : (
              <>
                <AlertMessage severity="info">
                  Một công ty nối được nhiều gian hàng trên cùng một sàn, mỗi lần uỷ quyền một tài khoản. Muốn thêm gian
                  hàng mới, đăng nhập sàn bằng tài khoản của gian hàng đó; trình duyệt đang nhớ tài khoản cũ thì đăng xuất
                  trước.
                </AlertMessage>
                <div className="grid gap-3 sm:grid-cols-2">
                  {platformsQuery.isLoading ? (
                    <div className="col-span-full grid gap-3 sm:grid-cols-2" role="status" aria-label="Đang tải sàn">
                      <Skeleton className="h-32" />
                      <Skeleton className="h-32" />
                    </div>
                  ) : platformsQuery.isError ? (
                    <AlertMessage severity="error" className="col-span-full">
                      <p>{getErrorMessage(platformsQuery.error)}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={platformsQuery.isFetching}
                        onClick={() => void platformsQuery.refetch()}
                      >
                        Thử lại
                      </Button>
                    </AlertMessage>
                  ) : platforms.length === 0 ? (
                    <p className="col-span-full text-sm text-muted-foreground">
                      Chưa có sàn nào được bật. Liên hệ quản trị nền tảng để kết nối sàn mới.
                    </p>
                  ) : (
                    platforms.map((p) => {
                      const active = selected?.platform === p.platform;
                      const hint = PLATFORM_HINTS[p.platform];
                      return (
                        <button
                          key={p.platform}
                          type="button"
                          data-platform={p.platform}
                          data-locked={!p.connectable || undefined}
                          aria-label={p.name}
                          aria-pressed={p.connectable ? active : undefined}
                          aria-disabled={!p.connectable || undefined}
                          disabled={connector.pending}
                          onClick={() => pick(p)}
                          className={cn(
                            'flex flex-col gap-2 rounded-lg border bg-card p-4 text-start transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                            active && 'border-primary bg-accent',
                            p.connectable ? 'hover:border-primary-hover' : 'cursor-not-allowed opacity-70',
                          )}
                        >
                          <span className="flex items-center gap-2 font-medium">
                            {p.connectable ? (
                              <Store className="size-4 text-primary" />
                            ) : (
                              <Lock className="size-4 text-muted-foreground" />
                            )}
                            {p.name}
                          </span>
                          {!p.connectable ? (
                            <span className="text-sm text-muted-foreground" data-testid="platform-reason">
                              {lockedReason(p)}
                            </span>
                          ) : (
                            hint && <span className="text-sm text-muted-foreground">{hint}</span>
                          )}
                          {p.connectable && p.capabilities && (
                            <ul className="list-disc ps-4 text-xs text-muted-foreground" data-testid="platform-capabilities">
                              {capabilitySummary(p.capabilities).map((line) => (
                                <li key={line}>{line}</li>
                              ))}
                            </ul>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
                {selected && methods.length > 1 && (
                  <RadioGroup
                    aria-label="Cách kết nối"
                    value={chosenMethod}
                    onValueChange={(v) => setMethod(v as ShopConnectMethod)}
                    className="gap-2"
                  >
                    {methods.map((m) => (
                      <Label
                        key={m}
                        htmlFor={`connect-method-${m}`}
                        className="flex items-start gap-2 rounded-lg border px-3 py-2.5 font-normal"
                      >
                        <RadioGroupItem id={`connect-method-${m}`} value={m} className="mt-0.5" />
                        <span className="grid gap-0.5">
                          <span className="font-medium">{m === 'oauth' ? `Uỷ quyền qua ${selected.name}` : 'Dán token'}</span>
                          <span className="text-xs text-muted-foreground">
                            {m === 'oauth'
                              ? 'Đăng nhập tài khoản người bán trên sàn rồi đồng ý cấp quyền.'
                              : 'Dán access token lấy trên console của sàn, dùng cho shop thử.'}
                          </span>
                        </span>
                      </Label>
                    ))}
                  </RadioGroup>
                )}
                <DialogFooter>
                  <Button variant="outline" disabled={connector.pending} onClick={close}>
                    Huỷ
                  </Button>
                  <Button disabled={!selected || connector.pending} onClick={next}>
                    {connector.pending
                      ? 'Đang chuyển...'
                      : chosenMethod === 'token'
                        ? 'Tiếp tục'
                        : `Tiếp tục tới ${selected?.name ?? 'sàn'}`}
                  </Button>
                </DialogFooter>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
