import { useState, type ReactNode } from 'react';
import { useForm, type UseFormSetError } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { AlertMessage } from '@/components/common/AlertMessage';
import { FormTextField } from '@/components/common/FormTextField';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { AuthShell } from './AuthShell';
import { registerSchema, type RegisterForm } from './schemas';
import { useCooldown } from './useCooldown';
import { useRegisterCompany, useResendRegistration, useVerifyRegistration } from '@/hooks/useAuth';
import { getErrorMessage, getProblem, retryAfterSeconds } from '@/api/client';
import { ROUTES } from '@/router/routes';
import type { RegistrationStatus } from '@/types/auth';

/** Lỗi theo ô từ BE dùng tên trường của request; đổi về tên ô trên form. */
const SERVER_FIELD: Record<string, keyof RegisterForm> = {
  'company.name': 'companyName',
  'company.taxCode': 'taxCode',
  'ceo.fullName': 'fullName',
  'ceo.email': 'email',
  'ceo.password': 'password',
};

/** Lỗi bắt đăng ký lại từ đầu (Documents/21 mục 2.1): quay về form, giữ nguyên chữ đã nhập. */
const RESTART: Record<string, string> = {
  registration_expired: 'Lần đăng ký đã quá 30 phút. Bấm Đăng ký để nhận mã mới.',
  otp_send_limit: 'Đã gửi đủ 5 mã cho lần đăng ký này. Bấm Đăng ký để bắt đầu lại.',
};

const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Mã gồm 6 chữ số'),
});
type CodeForm = z.infer<typeof codeSchema>;

type Step = { kind: 'form' } | { kind: 'code'; email: string; status: RegistrationStatus };

const SENT_NOTICE = 'Đã gửi mã. Không thấy thư thì kiểm tra cả thư rác.';
const RESENT_NOTICE = 'Đã gửi mã mới, mã cũ không dùng được nữa.';

/** Giờ hết hạn của mã, dạng 14:05 */
const clock = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

/** Nhãn ô bắt buộc: thêm dấu * (màn đọc đã biết qua `required` của ô) */
const req = (label: string): ReactNode => (
  <>
    {label}{' '}
    <span aria-hidden className="text-destructive">
      *
    </span>
  </>
);

/** Chỉ báo hai bước: thanh hai đoạn + chữ "Bước n/2" */
function StepIndicator({ current }: { current: 1 | 2 }) {
  return (
    <div className="mb-5">
      <p className="text-sm font-medium text-muted-foreground">
        Bước {current}/2 · {current === 1 ? 'Thông tin đăng ký' : 'Xác minh email'}
      </p>
      <div aria-hidden className="mt-2 grid grid-cols-2 gap-1.5">
        <span className="h-1 rounded-full bg-primary" />
        <span className={current === 2 ? 'h-1 rounded-full bg-primary' : 'h-1 rounded-full bg-muted'} />
      </div>
    </div>
  );
}

/**
 * UC-PI-01 — Đăng ký công ty (commerio-backend#459): gửi form, nhập mã 6 số gửi qua email, rồi vào thẳng công ty mới.
 * Người đăng ký là CEO; phân hệ lõi (kể cả Kênh bán) và Nhập hàng bật sẵn, phân hệ khác bật sau ở Cài đặt.
 * Ba API này không trả 401.
 */
export function RegisterPage() {
  const navigate = useNavigate();
  const register = useRegisterCompany();
  const resend = useResendRegistration();
  const verify = useVerifyRegistration();
  const cooldown = useCooldown();
  const [step, setStep] = useState<Step>({ kind: 'form' });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { companyName: '', taxCode: '', fullName: '', email: '', password: '', confirmPassword: '' },
  });

  /** Lỗi gắn được với ô thì hiện dưới ô của form; còn lại gom lên đầu trang. */
  const showFormErrors = (e: unknown) => {
    const problem = getProblem(e);
    const errors = { ...problem?.errors };
    if (problem?.code === 'email_taken') errors['ceo.email'] ??= 'Email này đã có tài khoản';
    const unmapped: string[] = [];
    for (const [key, message] of Object.entries(errors)) {
      const name = SERVER_FIELD[key];
      if (name) form.setError(name, { message });
      else unmapped.push(message);
    }
    if (unmapped.length > 0) setError(unmapped.join(' '));
    else if (Object.keys(errors).length === 0) setError(getErrorMessage(e));
  };

  const backToForm = (message: string | null) => {
    setStep({ kind: 'form' });
    setNotice(null);
    setError(message);
  };

  const onSubmit = form.handleSubmit((v) => {
    setError(null);
    register.mutate(
      {
        company: { name: v.companyName, taxCode: v.taxCode },
        ceo: { fullName: v.fullName, email: v.email, password: v.password },
      },
      {
        onSuccess: (status) => {
          setStep({ kind: 'code', email: v.email, status });
          cooldown.start(status.resendAfterSeconds);
          setNotice(SENT_NOTICE);
        },
        onError: showFormErrors,
      },
    );
  });

  const onVerify = (
    current: Extract<Step, { kind: 'code' }>,
    code: string,
    setFieldError: UseFormSetError<CodeForm>,
  ) => {
    setError(null);
    verify.mutate(
      { registrationId: current.status.registrationId, code },
      {
        onSuccess: (res) => navigate(ROUTES.company.root(res.context.companyId), { replace: true }),
        onError: (e) => {
          const problem = getProblem(e);
          const restart = problem?.code ? RESTART[problem.code] : undefined;
          if (restart) return backToForm(restart);
          // Email hay mã số thuế vừa bị người khác dùng trong lúc chờ mã: sửa trên form rồi đăng ký lại
          if (problem?.code === 'email_taken' || problem?.code === 'tax_code_taken') {
            backToForm(null);
            return showFormErrors(e);
          }
          if (problem?.errors?.code) return setFieldError('code', { message: problem.errors.code });
          setError(getErrorMessage(e));
        },
      },
    );
  };

  const onResend = (current: Extract<Step, { kind: 'code' }>) => {
    setError(null);
    resend.mutate(current.status.registrationId, {
      onSuccess: (status) => {
        setStep({ ...current, status });
        cooldown.start(status.resendAfterSeconds);
        setNotice(RESENT_NOTICE);
      },
      onError: (e) => {
        const problem = getProblem(e);
        const restart = problem?.code ? RESTART[problem.code] : undefined;
        if (restart) return backToForm(restart);
        const seconds = retryAfterSeconds(e);
        if (seconds) cooldown.start(seconds);
        setError(getErrorMessage(e));
      },
    });
  };

  const busy = register.isPending || resend.isPending || verify.isPending;

  return (
    <AuthShell
      wide={step.kind === 'form'}
      title={step.kind === 'form' ? 'Đăng ký công ty' : 'Xác minh email'}
      subtitle={
        step.kind === 'form'
          ? 'Người đăng ký sẽ là CEO của công ty trên Commerio.'
          : `Nhập mã 6 số gửi tới ${step.email} để tạo công ty và vào làm việc ngay.`
      }
    >
      <StepIndicator current={step.kind === 'form' ? 1 : 2} />
      {error && (
        <AlertMessage severity="error" className="mb-4" onClose={() => setError(null)}>
          {error}
        </AlertMessage>
      )}
      {notice && step.kind === 'code' && (
        <AlertMessage severity="info" className="mb-4" onClose={() => setNotice(null)}>
          {notice}
        </AlertMessage>
      )}

      {step.kind === 'form' && (
        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="grid gap-6">
            <section className="grid gap-4">
              <h2 className="text-lg font-semibold">Thông tin công ty</h2>
              <FormTextField control={form.control} name="companyName" label={req('Tên công ty')} required autoFocus />
              <FormTextField
                control={form.control}
                name="taxCode"
                label={req('Mã số thuế')}
                required
                inputMode="numeric"
                description="10 số, 12 số (hộ kinh doanh) hoặc 13 số dạng 0123456789-001"
              />
            </section>

            <section className="grid gap-4">
              <h2 className="text-lg font-semibold">Tài khoản CEO</h2>
              <FormTextField
                control={form.control}
                name="fullName"
                label={req('Họ tên')}
                required
                autoComplete="name"
              />
              <FormTextField
                control={form.control}
                name="email"
                label={req('Email')}
                required
                type="email"
                autoComplete="email"
                description="Dùng để đăng nhập. Mã xác minh gửi tới email này."
              />
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <FormTextField
                  control={form.control}
                  name="password"
                  label={req('Mật khẩu')}
                  required
                  password
                  autoComplete="new-password"
                  description="Tối thiểu 8 ký tự, có chữ và số."
                />
                <FormTextField
                  control={form.control}
                  name="confirmPassword"
                  label={req('Nhập lại mật khẩu')}
                  required
                  password
                  autoComplete="new-password"
                />
              </div>
            </section>

            <Button type="submit" size="lg" disabled={busy}>
              {register.isPending ? 'Đang gửi mã...' : 'Đăng ký'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Đã có tài khoản?{' '}
              <Link to={ROUTES.login} className="font-semibold text-primary hover:underline">
                Đăng nhập
              </Link>
            </p>
          </form>
        </Form>
      )}

      {step.kind === 'code' && (
        <CodeStep
          key={step.status.registrationId}
          codeExpiresAt={step.status.codeExpiresAt}
          busy={busy}
          verifying={verify.isPending}
          cooldown={cooldown.left}
          onSubmit={(code, setFieldError) => onVerify(step, code, setFieldError)}
          onResend={() => onResend(step)}
          onEdit={() => backToForm(null)}
        />
      )}
    </AuthShell>
  );
}

function CodeStep({
  codeExpiresAt,
  busy,
  verifying,
  cooldown,
  onSubmit,
  onResend,
  onEdit,
}: {
  codeExpiresAt: string;
  busy: boolean;
  verifying: boolean;
  cooldown: number;
  onSubmit: (code: string, setFieldError: UseFormSetError<CodeForm>) => void;
  onResend: () => void;
  onEdit: () => void;
}) {
  const form = useForm<CodeForm>({ resolver: zodResolver(codeSchema), defaultValues: { code: '' } });
  const submit = form.handleSubmit((v) => onSubmit(v.code.trim(), form.setError));
  return (
    <Form {...form}>
      <form onSubmit={submit} noValidate className="grid gap-4">
        <FormTextField
          control={form.control}
          name="code"
          label={req('Mã xác minh')}
          required
          description={`Mã có hạn 5 phút, dùng được tới ${clock(codeExpiresAt)}.`}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
        />
        <Button type="submit" size="lg" className="mt-2" disabled={busy}>
          {verifying ? 'Đang tạo công ty...' : 'Xác minh và vào công ty'}
        </Button>
        <div className="flex flex-wrap justify-between gap-2">
          <Button type="button" variant="link" className="px-0" onClick={onEdit} disabled={busy}>
            Sửa thông tin đăng ký
          </Button>
          <Button type="button" variant="link" className="px-0" onClick={onResend} disabled={busy || cooldown > 0}>
            {cooldown > 0 ? `Gửi lại mã sau ${cooldown} giây` : 'Gửi lại mã'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
