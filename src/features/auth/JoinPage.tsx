import { useEffect, useState } from 'react';
import { useForm, type FieldValues, type Path, type UseFormSetError } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { z } from 'zod';
import { AlertMessage } from '@/components/common/AlertMessage';
import { FormTextField } from '@/components/common/FormTextField';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { authApi } from '@/api/auth.api';
import { joinApi } from '@/api/identity.api';
import { getErrorMessage, getProblem, retryAfterSeconds } from '@/api/client';
import { codeMessage, problemMessage } from '@/api/problemMessages';
import { ROUTES } from '@/router/routes';
import { useAuthStore } from '@/stores/authStore';
import { formatDateTime } from '@/utils/format';
import type { JoinCheck, JoinVerifyResult } from '@/types/identity';
import { AuthShell } from './AuthShell';
import { emailSchema, newPasswordSchema } from './schemas';

const infoSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(2, 'Họ tên tối thiểu 2 ký tự').max(100, 'Họ tên tối đa 100 ký tự'),
});
const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Mã gồm 6 chữ số') });
const setPasswordSchema = z
  .object({ password: newPasswordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Mật khẩu nhập lại không khớp',
  });
const signInSchema = z.object({ password: z.string().min(1, 'Nhập mật khẩu') });

type InfoForm = z.infer<typeof infoSchema>;
type CodeForm = z.infer<typeof codeSchema>;
type PasswordForm = { password: string; confirmPassword?: string };

type Step =
  | { kind: 'checking' }
  | { kind: 'fatal'; message: string; signIn?: boolean }
  | { kind: 'info'; email?: string; fullName?: string }
  | { kind: 'code'; email: string; fullName: string }
  | { kind: 'password'; email: string; fullName: string; verified: JoinVerifyResult }
  | { kind: 'done'; email: string; next: JoinVerifyResult['next'] };

/** Lỗi làm link không dùng tiếp được: dừng luồng, chỉ còn câu báo */
const FATAL = ['invitation_invalid', 'invitation_used'];

/** Token sau `#`. Link bị sửa tay thành `%` sai thì giữ nguyên chuỗi để BE trả `invitation_invalid`, không làm trắng trang */
function readToken(hash: string): string {
  const raw = hash.replace(/^#/, '');
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Đếm ngược theo `Retry-After` của lỗi 429 */
function useCooldown() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= now) return;
    const t = window.setTimeout(() => setNow(Date.now()), 1000);
    return () => window.clearTimeout(t);
  }, [until, now]);
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  return {
    left,
    start: (seconds: number) => {
      const t = Date.now();
      setNow(t);
      setUntil(t + seconds * 1000);
    },
  };
}

/**
 * US-CT-06: người được mời mở `/tham-gia#<token>`, xác minh email bằng mã, đặt mật khẩu (email mới)
 * hoặc nhập mật khẩu hiện có (email đã có tài khoản), rồi chờ Admin duyệt.
 * Token chỉ nằm sau `#` nên không tới server qua URL; FE gửi trong body. API công khai, không bao giờ về /login vì 401.
 */
export function JoinPage() {
  const { hash } = useLocation();
  const token = readToken(hash);
  const [invite, setInvite] = useState<JoinCheck | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'checking' });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cooldown = useCooldown();
  const sessionStatus = useAuthStore((s) => s.status);
  const signedInEmail = useAuthStore((s) => s.account?.email ?? null);
  const clearSession = useAuthStore((s) => s.clear);
  const qc = useQueryClient();
  const [signedOutEmail, setSignedOutEmail] = useState<string | null>(null);

  // Trình duyệt đang đăng nhập tài khoản khác (vd Admin mở thử link mình tạo): đăng xuất hẳn (BE huỷ cookie refresh)
  // trước khi tham gia, để "Về trang đăng nhập" không tự vào lại tài khoản cũ.
  useEffect(() => {
    if (sessionStatus !== 'ready' || !signedInEmail) return;
    const email = signedInEmail;
    void authApi
      .logout()
      .catch(() => {
        // Phiên ở BE đã hết thì vẫn xoá phiên ở FE
      })
      .finally(() => {
        clearSession();
        qc.clear();
        setSignedOutEmail(email);
      });
  }, [sessionStatus, signedInEmail, clearSession, qc]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    if (!token) {
      setStep({ kind: 'fatal', message: 'Link mời không đầy đủ. Mở lại đúng link người mời gửi, hoặc nhờ họ tạo link mới.' });
      return;
    }
    setStep({ kind: 'checking' });
    joinApi
      .check(token)
      .then((res) => {
        if (cancelled) return;
        setInvite(res);
        setStep({ kind: 'info' });
      })
      .catch((e) => {
        if (cancelled) return;
        // 422 ở bước này là token sai dạng: coi như link không hợp lệ
        const invalid = getProblem(e)?.status === 422;
        setStep({ kind: 'fatal', message: invalid ? codeMessage('invitation_invalid') : problemMessage(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  /**
   * Lỗi chung của mọi bước. Trả true nếu đã xử lý (gắn vào ô, dừng luồng hoặc đếm ngược);
   * còn lại hiện câu báo trên form.
   */
  function handleError<T extends FieldValues>(e: unknown, setFieldError?: UseFormSetError<T>, fields: string[] = []) {
    const problem = getProblem(e);
    const code = problem?.code;
    if (code && FATAL.includes(code)) {
      setStep({ kind: 'fatal', message: problemMessage(e) });
      return;
    }
    if (code === 'already_member') {
      setStep({
        kind: 'fatal',
        message: `Email này đã là nhân viên của ${invite?.companyName ?? 'công ty'}. Đăng nhập để làm việc.`,
        signIn: true,
      });
      return;
    }
    if (problem?.status === 429) {
      const seconds = retryAfterSeconds(e);
      if (seconds) {
        cooldown.start(seconds);
        setError(`Thử quá nhiều lần. Đợi ${seconds} giây rồi thử lại.`);
      } else {
        // Vd "Link này đã gửi đủ 5 mã": câu của BE rõ hơn câu chung
        setError(getErrorMessage(e));
      }
      return;
    }
    const known = fields.filter((name) => problem?.errors?.[name]);
    if (setFieldError && known.length) {
      known.forEach((name) => setFieldError(name as Path<T>, { message: problem!.errors![name] }));
      return;
    }
    setError(problemMessage(e));
  }

  const sendCode = async (email: string, fullName: string, setFieldError?: UseFormSetError<InfoForm>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await joinApi.requestOtp({ token, email, fullName });
      setStep({ kind: 'code', email, fullName });
      setNotice(`Đã gửi mã xác minh tới ${email}. Mã có hạn ngắn, kiểm tra cả thư rác.`);
    } catch (e) {
      handleError(e, setFieldError, ['email', 'fullName']);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (email: string, fullName: string, code: string, setFieldError: UseFormSetError<CodeForm>) => {
    setBusy(true);
    setError(null);
    try {
      const verified = await joinApi.verify({ token, email, code });
      setNotice(null);
      setStep({ kind: 'password', email, fullName, verified });
    } catch (e) {
      handleError(e, setFieldError, ['code']);
      // Email bị BE từ chối (vd tài khoản quản trị nền tảng): quay lại sửa email
      const emailError = getProblem(e)?.errors?.email;
      if (emailError) {
        setStep({ kind: 'info', email, fullName });
        setError(emailError);
      }
    } finally {
      setBusy(false);
    }
  };

  const complete = async (
    current: Extract<Step, { kind: 'password' }>,
    values: PasswordForm,
    setFieldError: UseFormSetError<PasswordForm>,
  ) => {
    setBusy(true);
    setError(null);
    try {
      await joinApi.complete({
        registrationToken: current.verified.registrationToken,
        password: values.password,
        ...(current.verified.next === 'set_password' ? { confirmPassword: values.confirmPassword } : {}),
      });
      setStep({ kind: 'done', email: current.email, next: current.verified.next });
    } catch (e) {
      if (getProblem(e)?.code === 'registration_expired') {
        // Token đăng ký sống 30 phút: xin mã mới rồi nhập lại
        setStep({ kind: 'code', email: current.email, fullName: current.fullName });
        setError(problemMessage(e));
        return;
      }
      handleError(e, setFieldError, ['password', 'confirmPassword']);
    } finally {
      setBusy(false);
    }
  };

  const company = invite?.companyName;
  const title =
    step.kind === 'done' ? 'Đã gửi yêu cầu tham gia' : company ? `Tham gia ${company}` : 'Tham gia công ty';
  const subtitle =
    invite && step.kind !== 'fatal' && step.kind !== 'done'
      ? `Bạn được mời làm nhân viên. Link hết hạn lúc ${formatDateTime(invite.expiresAt)}.`
      : undefined;

  return (
    <AuthShell title={title} subtitle={subtitle}>
      {step.kind === 'checking' && <p className="text-sm text-muted-foreground">Đang kiểm tra link mời...</p>}

      {step.kind === 'fatal' && (
        <div className="grid gap-4" data-testid="join-fatal">
          <AlertMessage severity="error">{step.message}</AlertMessage>
          {step.signIn && (
            <Button asChild size="lg">
              <Link to={ROUTES.login}>Đăng nhập</Link>
            </Button>
          )}
        </div>
      )}

      {signedOutEmail && step.kind !== 'done' && (
        <AlertMessage severity="info" className="mb-4" onClose={() => setSignedOutEmail(null)}>
          Đã đăng xuất tài khoản <strong>{signedOutEmail}</strong> trên trình duyệt này để tham gia công ty.
        </AlertMessage>
      )}

      {error && step.kind !== 'fatal' && (
        <AlertMessage severity="error" className="mb-4" onClose={() => setError(null)}>
          {error}
        </AlertMessage>
      )}
      {notice && (step.kind === 'code' || step.kind === 'info') && (
        <AlertMessage severity="info" className="mb-4" onClose={() => setNotice(null)}>
          {notice}
        </AlertMessage>
      )}

      {step.kind === 'info' && (
        <InfoStep
          defaults={{ email: step.email ?? '', fullName: step.fullName ?? '' }}
          busy={busy}
          cooldown={cooldown.left}
          onSubmit={sendCode}
        />
      )}

      {step.kind === 'code' && (
        <CodeStep
          email={step.email}
          busy={busy}
          cooldown={cooldown.left}
          onSubmit={(code, setFieldError) => verify(step.email, step.fullName, code, setFieldError)}
          onResend={() => sendCode(step.email, step.fullName)}
          onChangeEmail={() => {
            setError(null);
            setNotice(null);
            setStep({ kind: 'info', email: step.email, fullName: step.fullName });
          }}
        />
      )}

      {step.kind === 'password' && (
        <PasswordStep
          email={step.email}
          next={step.verified.next}
          busy={busy}
          cooldown={cooldown.left}
          onSubmit={(values, setFieldError) => complete(step, values, setFieldError)}
        />
      )}

      {step.kind === 'done' && (
        <div className="grid gap-4" data-testid="join-done">
          <AlertMessage severity="success">
            Yêu cầu tham gia {company} đang chờ Admin công ty duyệt. Khi được duyệt, bạn đăng nhập bằng{' '}
            <strong>{step.email}</strong> và{' '}
            {step.next === 'sign_in' ? 'mật khẩu hiện tại của tài khoản này' : 'mật khẩu vừa đặt'}.
          </AlertMessage>
          <Button asChild size="lg" variant="outline">
            <Link to={ROUTES.login} state={{ registeredEmail: step.email }}>
              Về trang đăng nhập
            </Link>
          </Button>
        </div>
      )}
    </AuthShell>
  );
}

const waitLabel = (cooldown: number, label: string) => (cooldown > 0 ? `Thử lại sau ${cooldown} giây` : label);

function InfoStep({
  defaults,
  busy,
  cooldown,
  onSubmit,
}: {
  defaults: InfoForm;
  busy: boolean;
  cooldown: number;
  onSubmit: (email: string, fullName: string, setFieldError: UseFormSetError<InfoForm>) => void;
}) {
  const form = useForm<InfoForm>({ resolver: zodResolver(infoSchema), defaultValues: defaults });
  const submit = form.handleSubmit((v) => onSubmit(v.email, v.fullName.trim(), form.setError));
  return (
    <Form {...form}>
      <form onSubmit={submit} noValidate className="grid gap-4">
        <FormTextField control={form.control} name="email" label="Email" type="email" autoComplete="email" autoFocus />
        <FormTextField control={form.control} name="fullName" label="Họ tên" autoComplete="name" />
        <Button type="submit" size="lg" className="mt-2" disabled={busy || cooldown > 0}>
          {busy ? 'Đang gửi...' : waitLabel(cooldown, 'Gửi mã xác minh')}
        </Button>
      </form>
    </Form>
  );
}

function CodeStep({
  email,
  busy,
  cooldown,
  onSubmit,
  onResend,
  onChangeEmail,
}: {
  email: string;
  busy: boolean;
  cooldown: number;
  onSubmit: (code: string, setFieldError: UseFormSetError<CodeForm>) => void;
  onResend: () => void;
  onChangeEmail: () => void;
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
        <Button type="submit" size="lg" className="mt-2" disabled={busy || cooldown > 0}>
          {busy ? 'Đang kiểm tra...' : waitLabel(cooldown, 'Xác minh')}
        </Button>
        <div className="flex flex-wrap justify-between gap-2">
          <Button type="button" variant="link" className="px-0" onClick={onChangeEmail} disabled={busy}>
            Đổi email
          </Button>
          <Button type="button" variant="link" className="px-0" onClick={onResend} disabled={busy || cooldown > 0}>
            {waitLabel(cooldown, 'Gửi lại mã')}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function PasswordStep({
  email,
  next,
  busy,
  cooldown,
  onSubmit,
}: {
  email: string;
  next: JoinVerifyResult['next'];
  busy: boolean;
  cooldown: number;
  onSubmit: (values: PasswordForm, setFieldError: UseFormSetError<PasswordForm>) => void;
}) {
  const signIn = next === 'sign_in';
  const form = useForm<PasswordForm>({
    resolver: zodResolver(signIn ? signInSchema : setPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });
  const submit = form.handleSubmit((v) => onSubmit(v, form.setError));
  return (
    <Form {...form}>
      <form onSubmit={submit} noValidate className="grid gap-4">
        {signIn ? (
          <>
            <AlertMessage severity="info">
              <strong>{email}</strong> đã có tài khoản Commerio. Nhập mật khẩu hiện tại để gửi yêu cầu; mật khẩu không
              đổi.
            </AlertMessage>
            <FormTextField
              control={form.control}
              name="password"
              label="Mật khẩu hiện tại"
              password
              autoComplete="current-password"
              autoFocus
            />
          </>
        ) : (
          <>
            <FormTextField
              control={form.control}
              name="password"
              label="Đặt mật khẩu"
              password
              autoComplete="new-password"
              description="Tối thiểu 8 ký tự, có chữ và số."
              autoFocus
            />
            <FormTextField
              control={form.control}
              name="confirmPassword"
              label="Nhập lại mật khẩu"
              password
              autoComplete="new-password"
            />
          </>
        )}
        <Button type="submit" size="lg" className="mt-2" disabled={busy || cooldown > 0}>
          {busy ? 'Đang gửi...' : waitLabel(cooldown, 'Gửi yêu cầu tham gia')}
        </Button>
      </form>
    </Form>
  );
}
