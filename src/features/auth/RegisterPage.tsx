import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { AlertMessage } from '@/components/common/AlertMessage';
import { FormTextField } from '@/components/common/FormTextField';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { AuthShell } from './AuthShell';
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
  assistantDataConsent: 'optionalModules',
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

  const form = useForm<RegisterForm>({
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
  const { control, setError: setFieldError } = form;

  const onSubmit = form.handleSubmit((v) => {
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
          const errors = { ...problem?.errors };
          if (problem?.code === 'email_taken') errors['ceo.email'] ??= 'Email này đã có tài khoản';
          // Lỗi gắn được với ô thì hiện dưới ô; còn lại gom lên đầu form
          const unmapped: string[] = [];
          for (const [key, message] of Object.entries(errors)) {
            const name = SERVER_FIELD[key];
            if (name) setFieldError(name, { message });
            else unmapped.push(message);
          }
          if (unmapped.length > 0) setError(unmapped.join(' '));
          else if (Object.keys(errors).length === 0) setError(getErrorMessage(e));
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
        <AlertMessage severity="error" className="mb-4" onClose={() => setError(null)}>
          {error}
        </AlertMessage>
      )}

      <Form {...form}>
        <form onSubmit={onSubmit} noValidate className="grid gap-6">
          <section className="grid gap-4">
            <h2 className="font-bold">Thông tin công ty</h2>
            <FormTextField control={control} name="companyName" label="Tên công ty" autoFocus />
            <FormTextField
              control={control}
              name="taxCode"
              label="Mã số thuế"
              inputMode="numeric"
            />
          </section>

          <section className="grid gap-4">
            <h2 className="font-bold">Tài khoản CEO</h2>
            <FormTextField control={control} name="fullName" label="Họ tên" autoComplete="name" />
            <FormTextField
              control={control}
              name="email"
              label="Email"
              type="email"
              autoComplete="email"
              description="Dùng để đăng nhập."
            />
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <FormTextField
                control={control}
                name="password"
                label="Mật khẩu"
                password
                autoComplete="new-password"
                description="Tối thiểu 8 ký tự, có chữ và số."
              />
              <FormTextField
                control={control}
                name="confirmPassword"
                label="Nhập lại mật khẩu"
                password
                autoComplete="new-password"
              />
            </div>
          </section>

          <FormField
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
                <FormItem className="gap-1">
                  <h2 className="font-bold">Phân hệ tuỳ chọn</h2>
                  <p className="mb-2 text-sm text-muted-foreground">
                    Mười phân hệ lõi (sản phẩm, kho, đơn hàng, tài chính...) luôn bật. Có thể bật
                    thêm sau.
                  </p>
                  <div className="grid gap-1">
                    {OPTIONAL_MODULES.map((key) => (
                      <label
                        key={key}
                        className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-accent/60"
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={value.includes(key)}
                          onCheckedChange={(c) => toggle(key, c === true)}
                        />
                        <span className="grid gap-0.5">
                          <span className="text-sm font-semibold">{MODULE_LABELS[key]}</span>
                          <span className="text-xs text-muted-foreground">
                            {MODULE_DESCRIPTIONS[key]}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <FormMessage />
                  <AssistantConsentDialog
                    open={askConsent}
                    onAgree={() => {
                      onChange([...value, 'assistant']);
                      setAskConsent(false);
                    }}
                    onDecline={() => setAskConsent(false)}
                  />
                </FormItem>
              );
            }}
          />

          <Button type="submit" size="lg" disabled={register.isPending}>
            {register.isPending ? 'Đang đăng ký...' : 'Đăng ký'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Đã có tài khoản?{' '}
            <Link to={ROUTES.login} className="font-semibold text-primary hover:underline">
              Đăng nhập
            </Link>
          </p>
        </form>
      </Form>
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
    <AlertDialog open={open} onOpenChange={(o) => !o && onDecline()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Bật Trợ lý AI?</AlertDialogTitle>
          <AlertDialogDescription>
            Khi dùng Trợ lý AI, câu hỏi của nhân viên và dữ liệu liên quan (sản phẩm, đơn hàng, tài
            liệu nội bộ được dùng để trả lời) sẽ được gửi tới OpenAI để xử lý. Bấm Đồng ý nếu công
            ty chấp nhận điều này.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onDecline}>Không đồng ý</AlertDialogCancel>
          <AlertDialogAction onClick={onAgree}>Đồng ý</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
