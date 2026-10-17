import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useGoogleLogin } from '@/hooks/useAuth';
import { authErrorMessage } from './authErrors';
import { GOOGLE_CLIENT_ID, USE_MOCKS } from '@/utils/env';

interface GoogleLoginButtonProps {
  onError: (message: string) => void;
}

/** Chữ G của Google (lucide không có icon thương hiệu) */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

interface GoogleIdApi {
  initialize: (config: {
    client_id: string;
    callback: (res: { credential: string }) => void;
    ux_mode?: 'popup';
  }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, string | number>) => void;
}

type GoogleWindow = Window & { google?: { accounts: { id: GoogleIdApi } } };

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let gisLoading: Promise<GoogleIdApi> | null = null;

/** Tải thư viện Google Identity Services một lần cho cả trang */
function loadGis(): Promise<GoogleIdApi> {
  gisLoading ??= new Promise<GoogleIdApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => {
      const api = (window as GoogleWindow).google?.accounts.id;
      if (api) resolve(api);
      else reject(new Error('Không tải được Google Identity Services'));
    };
    script.onerror = () => {
      gisLoading = null;
      reject(new Error('Không tải được Google Identity Services'));
    };
    document.head.appendChild(script);
  });
  return gisLoading;
}

/**
 * Nút "Đăng nhập bằng Google" (UC-PI-03, nhánh mở rộng). Google chỉ xác thực email;
 * BE tìm tài khoản theo email, không tự tạo tài khoản mới (docs/21 A6, V4, V11).
 *
 * - Chạy mock: hộp thoại giả lập bước chọn tài khoản Google, credential chính là email.
 * - Backend thật: nút của Google Identity Services trả ID token, gửi lên `POST /identity/google`.
 *   Chưa đặt `VITE_GOOGLE_CLIENT_ID` thì khoá nút.
 */
export function GoogleLoginButton({ onError }: GoogleLoginButtonProps) {
  if (!USE_MOCKS && GOOGLE_CLIENT_ID) return <GisButton onError={onError} />;
  return <MockGoogleButton onError={onError} />;
}

function GisButton({ onError }: GoogleLoginButtonProps) {
  const google = useGoogleLogin();
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  // Callback của Google giữ tham chiếu lúc initialize; đọc hàm mới nhất qua ref
  const handlers = useRef({ mutate: google.mutate, onError });
  useEffect(() => {
    handlers.current = { mutate: google.mutate, onError };
  });

  useEffect(() => {
    let cancelled = false;
    loadGis()
      .then((api) => {
        const el = container.current;
        if (cancelled || !el) return;
        api.initialize({
          client_id: GOOGLE_CLIENT_ID,
          ux_mode: 'popup',
          callback: ({ credential }) =>
            handlers.current.mutate(credential, {
              onError: (e) => handlers.current.onError(authErrorMessage(e)),
            }),
        });
        api.renderButton(el, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          locale: 'vi',
          width: Math.min(el.offsetWidth || 400, 400),
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <Button type="button" variant="outline" size="lg" className="w-full" disabled>
        <GoogleIcon />
        Không tải được đăng nhập Google
      </Button>
    );
  }
  return (
    <div className="flex min-h-10 justify-center" aria-busy={google.isPending}>
      <div ref={container} className="w-full max-w-[400px]" />
    </div>
  );
}

function MockGoogleButton({ onError }: GoogleLoginButtonProps) {
  const google = useGoogleLogin();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');

  const submit = () => {
    setOpen(false);
    google.mutate(email.trim().toLowerCase(), { onError: (e) => onError(authErrorMessage(e)) });
  };

  const button = (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full"
      disabled={!USE_MOCKS || google.isPending}
      onClick={() => setOpen(true)}
    >
      <GoogleIcon />
      {google.isPending ? 'Đang đăng nhập...' : 'Đăng nhập bằng Google'}
    </Button>
  );

  if (!USE_MOCKS) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="block">{button}</span>
        </TooltipTrigger>
        <TooltipContent>Chưa cấu hình VITE_GOOGLE_CLIENT_ID</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <>
      {button}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Giả lập Google</DialogTitle>
            <DialogDescription>
              Nhập email Google trả về. Thử email chưa có tài khoản để xem trường hợp bị từ chối.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="google-email">Email Google</Label>
            <Input
              id="google-email"
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && email.trim()) submit();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button disabled={!email.trim()} onClick={submit}>
              Tiếp tục
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
