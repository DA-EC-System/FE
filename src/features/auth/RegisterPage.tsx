import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  FormHelperText,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { AuthShell } from './AuthShell';
import { PasswordField } from './PasswordField';
import { registerSchema, type RegisterForm } from './schemas';
import { useRegisterCompany } from '@/hooks/useAuth';
import { getErrorMessage, getProblem } from '@/api/client';
import { ROUTES } from '@/router/routes';
import { MODULE_LABELS, OPTIONAL_MODULES, type OptionalModuleKey } from '@/utils/modules';

const MODULE_DESCRIPTIONS: Record<OptionalModuleKey, string> = {
  purchasing: 'Nhà cung cấp, đơn mua hàng, nhập kho theo đơn mua.',
  channel: 'Kết nối Shopee, Lazada, TikTok Shop; đồng bộ sản phẩm, tồn kho, đơn hàng.',
  inbox: 'Gom tin nhắn từ sàn và mạng xã hội về một hộp thư chung.',
  assistant: 'Hỏi đáp về dữ liệu bán hàng và tài liệu nội bộ bằng AI.',
  report: 'Bảng tổng quan doanh số, đối soát tiền sàn.',
};

/** Lỗi theo ô từ BE (422) dùng tên trường của request; đổi về tên ô trên form. */
const SERVER_FIELD: Record<string, keyof RegisterForm> = {
  'company.name': 'companyName',
  'company.taxCode': 'taxCode',
  'ceo.fullName': 'fullName',
  'ceo.email': 'email',
  'ceo.password': 'password',
};

/**
 * UC-PI-01 — Đăng ký công ty. Người đăng ký trở thành CEO; mười phân hệ lõi luôn bật,
 * năm phân hệ tuỳ chọn chọn tại đây (bật thêm sau ở cài đặt công ty, UC-PI-02).
 */
export function RegisterPage() {
  const navigate = useNavigate();
  const register = useRegisterCompany();
  const [error, setError] = useState<string | null>(null);
  const [askConsent, setAskConsent] = useState(false);

  const {
    control,
    register: field,
    handleSubmit,
    setError: setFieldError,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      companyName: '',
      taxCode: '',
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
      optionalModules: [],
    },
  });

  const onSubmit = handleSubmit((v) => {
    setError(null);
    register.mutate(
      {
        company: { name: v.companyName, taxCode: v.taxCode },
        ceo: { fullName: v.fullName, email: v.email, password: v.password },
        optionalModules: v.optionalModules,
        // Chỉ chọn được Trợ lý AI sau khi đã bấm Đồng ý
        assistantDataConsent: v.optionalModules.includes('assistant'),
      },
      {
        onSuccess: (res) =>
          navigate(ROUTES.login, { replace: true, state: { registeredEmail: res.email } }),
        onError: (e) => {
          const problem = getProblem(e);
          if (problem?.code === 'email_taken') {
            setFieldError('email', { message: 'Email này đã có tài khoản' });
            return;
          }
          const fieldErrors = Object.entries(problem?.errors ?? {});
          fieldErrors.forEach(([key, message]) => {
            const name = SERVER_FIELD[key];
            if (name) setFieldError(name, { message });
          });
          if (!fieldErrors.some(([key]) => SERVER_FIELD[key])) setError(getErrorMessage(e));
        },
      },
    );
  });

  return (
    <AuthShell
      wide
      title="Đăng ký công ty"
      subtitle="Người đăng ký sẽ là CEO của công ty trên Commerio."
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate>
        <Stack spacing={3}>
          <Stack spacing={2}>
            <Typography variant="subtitle1" fontWeight={700}>
              Thông tin công ty
            </Typography>
            <TextField
              label="Tên công ty"
              fullWidth
              autoFocus
              {...field('companyName')}
              error={Boolean(errors.companyName)}
              helperText={errors.companyName?.message}
            />
            <TextField
              label="Mã số thuế"
              fullWidth
              inputMode="numeric"
              {...field('taxCode')}
              error={Boolean(errors.taxCode)}
              helperText={errors.taxCode?.message}
            />
          </Stack>

          <Stack spacing={2}>
            <Typography variant="subtitle1" fontWeight={700}>
              Tài khoản CEO
            </Typography>
            <TextField
              label="Họ tên"
              fullWidth
              autoComplete="name"
              {...field('fullName')}
              error={Boolean(errors.fullName)}
              helperText={errors.fullName?.message}
            />
            <TextField
              label="Email"
              type="email"
              fullWidth
              autoComplete="email"
              {...field('email')}
              error={Boolean(errors.email)}
              helperText={errors.email?.message ?? 'Dùng để đăng nhập.'}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <PasswordField
                label="Mật khẩu"
                autoComplete="new-password"
                {...field('password')}
                error={Boolean(errors.password)}
                helperText={errors.password?.message ?? 'Tối thiểu 8 ký tự, có chữ và số.'}
              />
              <PasswordField
                label="Nhập lại mật khẩu"
                autoComplete="new-password"
                {...field('confirmPassword')}
                error={Boolean(errors.confirmPassword)}
                helperText={errors.confirmPassword?.message}
              />
            </Stack>
          </Stack>

          <Box>
            <Typography variant="subtitle1" fontWeight={700}>
              Phân hệ tuỳ chọn
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Mười phân hệ lõi (sản phẩm, kho, đơn hàng, tài chính...) luôn bật. Có thể bật thêm sau.
            </Typography>
            <Controller
              control={control}
              name="optionalModules"
              render={({ field: { value, onChange } }) => {
                const toggle = (key: OptionalModuleKey, checked: boolean) => {
                  // Bật Trợ lý AI phải qua bước đồng ý gửi dữ liệu tới OpenAI
                  if (key === 'assistant' && checked) {
                    setAskConsent(true);
                    return;
                  }
                  onChange(checked ? [...value, key] : value.filter((m) => m !== key));
                };
                return (
                  <>
                    <Stack spacing={0.5}>
                      {OPTIONAL_MODULES.map((key) => (
                        <FormControlLabel
                          key={key}
                          sx={{ alignItems: 'flex-start', mr: 0 }}
                          control={
                            <Checkbox
                              checked={value.includes(key)}
                              onChange={(e) => toggle(key, e.target.checked)}
                              sx={{ pt: 0.5 }}
                            />
                          }
                          label={
                            <Box sx={{ py: 0.5 }}>
                              <Typography variant="body2" fontWeight={600}>
                                {MODULE_LABELS[key]}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {MODULE_DESCRIPTIONS[key]}
                              </Typography>
                            </Box>
                          }
                        />
                      ))}
                    </Stack>
                    <AssistantConsentDialog
                      open={askConsent}
                      onAgree={() => {
                        onChange([...value, 'assistant']);
                        setAskConsent(false);
                      }}
                      onDecline={() => setAskConsent(false)}
                    />
                  </>
                );
              }}
            />
            {errors.optionalModules && (
              <FormHelperText error>{errors.optionalModules.message}</FormHelperText>
            )}
          </Box>

          <Button type="submit" variant="contained" size="large" disabled={register.isPending}>
            {register.isPending ? 'Đang đăng ký...' : 'Đăng ký'}
          </Button>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            Đã có tài khoản?{' '}
            <Link component={RouterLink} to={ROUTES.login} fontWeight={600}>
              Đăng nhập
            </Link>
          </Typography>
        </Stack>
      </form>
    </AuthShell>
  );
}

function AssistantConsentDialog({
  open,
  onAgree,
  onDecline,
}: {
  open: boolean;
  onAgree: () => void;
  onDecline: () => void;
}) {
  return (
    <Dialog open={open} onClose={onDecline} maxWidth="sm">
      <DialogTitle>Bật Trợ lý AI?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Khi dùng Trợ lý AI, câu hỏi của nhân viên và dữ liệu liên quan (sản phẩm, đơn hàng, tài
          liệu nội bộ được dùng để trả lời) sẽ được gửi tới OpenAI để xử lý. Bấm Đồng ý nếu công ty
          chấp nhận điều này.
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onDecline}>Không đồng ý</Button>
        <Button variant="contained" onClick={onAgree}>
          Đồng ý
        </Button>
      </DialogActions>
    </Dialog>
  );
}
