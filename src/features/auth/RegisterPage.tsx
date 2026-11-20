import { useState } from 'react';
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

const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Mã gồm 6 chữ số') });
type CodeForm = z.infer<typeof codeSchema>;

type Step = { kind: 'form' } | { kind: 'code'; email: string; status: RegistrationStatus };

const sentNotice = (email: string) =>
  `Đã gửi mã xác minh tới ${email}. Mã có hạn 5 phút, kiểm tra cả thư rác.`;

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
          setNotice(sentNotice(v.email));
        },
        onError: showFormErrors,
      },
    );
  });

  const onVerify = (current: Extract<Step, { kind: 'code' }>, code: string, setFieldError: UseFormSetError<CodeForm>) => {
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
        setNotice(sentNotice(current.email));
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
          : 'Nhập mã 6 số để tạo công ty và vào làm việc ngay.'
      }
    >
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
              <h2 className="font-bold">Thông tin công ty</h2>
              <FormTextField control={form.control} name="companyName" label="Tên công ty" autoFocus />
              <FormTextField control={form.control} name="taxCode" label="Mã số thuế" inputMode="numeric" />
            </section>

            <section className="grid gap-4">
              <h2 className="font-bold">Tài khoản CEO</h2>
              <FormTextField control={form.control} name="fullName" label="Họ tên" autoComplete="name" />
              <FormTextField
                control={form.control}
                name="email"
                label="Email"
                type="email"
                autoComplete="email"
                description="Dùng để đăng nhập. Mã xác minh gửi tới email này."
              />
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <FormTextField
                  control={form.control}
                  name="password"
                  label="Mật khẩu"
                  password
                  autoComplete="new-password"
                  description="Tối thiểu 8 ký tự, có chữ và số."
                />
                <FormTextField
                  control={form.control}
                  name="confirmPassword"
                  label="Nhập lại mật khẩu"
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
          email={step.email}
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
  email,
  busy,
  verifying,
  cooldown,
  onSubmit,
  onResend,
  onEdit,
}: {
  email: string;
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
          label={`Mã xác minh đã gửi tới ${email}`}
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
