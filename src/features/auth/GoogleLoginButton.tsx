import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  Tooltip,
} from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import { useGoogleLogin } from '@/hooks/useAuth';
import { getErrorMessage } from '@/api/client';
import { USE_MOCKS } from '@/utils/env';

interface GoogleLoginButtonProps {
  onError: (message: string) => void;
}

/**
 * Nút "Đăng nhập bằng Google" (UC-PI-03, nhánh mở rộng). Google chỉ xác thực email;
 * BE tìm tài khoản theo email, không tự tạo tài khoản mới (BE#7).
 *
 * Khi chạy mock: hộp thoại giả lập bước chọn tài khoản Google, credential chính là email.
 * Với backend thật: chờ chốt với BE#7 (Google Identity Services gửi ID token lên POST /auth/google,
 * hay BE tự làm luồng chuyển hướng OAuth2), nên tạm khoá nút.
 */
export function GoogleLoginButton({ onError }: GoogleLoginButtonProps) {
  const google = useGoogleLogin();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');

  const submit = () => {
    setOpen(false);
    google.mutate(email.trim().toLowerCase(), { onError: (e) => onError(getErrorMessage(e)) });
  };

  const button = (
    <Button
      variant="outlined"
      color="inherit"
      size="large"
      fullWidth
      startIcon={<GoogleIcon />}
      disabled={!USE_MOCKS || google.isPending}
      onClick={() => setOpen(true)}
      sx={{ borderColor: 'divider' }}
    >
      {google.isPending ? 'Đang đăng nhập...' : 'Đăng nhập bằng Google'}
    </Button>
  );

  if (!USE_MOCKS) {
    return (
      <Tooltip title="Chưa kết nối đăng nhập Google với máy chủ">
        <span>{button}</span>
      </Tooltip>
    );
  }

  return (
    <>
      {button}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Giả lập Google</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Nhập email Google trả về. Thử email chưa có tài khoản để xem trường hợp bị từ chối.
          </DialogContentText>
          <TextField
            label="Email Google"
            type="email"
            fullWidth
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && email.trim()) submit();
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)}>Huỷ</Button>
          <Button variant="contained" disabled={!email.trim()} onClick={submit}>
            Tiếp tục
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
