import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { FormTextField } from '@/components/common/FormTextField';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompanyProfile, useUpdateCompanyProfile } from '@/api/companySettings.api';
import { getErrorMessage, getProblem } from '@/api/client';
import type { CompanyProfile } from '@/types/companySettings';
import { taxCodeSchema } from '@/features/auth/schemas';
import { PROFILE_MAX, toProfileBody, toProfileForm, type CompanyProfileForm } from './companyProfile';

const text = z.string().max(PROFILE_MAX, `Tối đa ${PROFILE_MAX} ký tự`);
const schema = z.object({
  // Để trống thì không gửi; có nhập thì kiểm như lúc đăng ký (commerio-backend#459)
  taxCode: z.union([z.literal(''), taxCodeSchema]),
  address: text,
  responsibleName: text,
  responsibleAddress: text,
});

const PAGE_HELP = (
  <>
    Tên và mã số thuế lấy từ lúc đăng ký công ty, không sửa ở đây. Mã số thuế bị quản trị Commerio gỡ (công ty giữ mã
    của doanh nghiệp khác) thì CEO, Admin nhập mã đúng ở đây. Tổ chức chịu trách nhiệm hàng hoá được điền sẵn vào
    thuộc tính sàn (TikTok) khi ghép danh mục và khi đăng sản phẩm. Để trống thì dùng tên, địa chỉ của công ty.
  </>
);

/** Hồ sơ công ty (FE#267, commerio-backend#292): CEO, Admin sửa địa chỉ và tổ chức chịu trách nhiệm hàng hoá */
export function CompanyProfilePage() {
  const profileQuery = useCompanyProfile();
  const profile = profileQuery.data;

  return (
    <>
      <PageHeader
        title="Hồ sơ công ty"
        subtitle="Địa chỉ đăng ký và tổ chức chịu trách nhiệm hàng hoá dùng khi đăng sản phẩm lên sàn."
        help={PAGE_HELP}
      />
      {profileQuery.isError && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(profileQuery.error)}
        </AlertMessage>
      )}
      {profileQuery.isPending && <Skeleton className="h-80 w-full max-w-2xl" />}
      {profile && <ProfileForm profile={profile} />}
    </>
  );
}

/** Form hồ sơ; wizard `/welcome` nhúng lại ở bước Hồ sơ công ty (FE#419) và đọc lại tiến độ qua `onSaved` */
export function ProfileForm({ profile, onSaved }: { profile: CompanyProfile; onSaved?: () => void }) {
  const update = useUpdateCompanyProfile();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<CompanyProfileForm>({ resolver: zodResolver(schema), defaultValues: toProfileForm(profile) });
  const { control, setError: setFieldError, reset, watch } = form;

  // Hồ sơ đổi từ nơi khác (lệch version, lấy lại) thì nạp bản mới vào ô chưa sửa, giữ ô người dùng đang sửa
  useEffect(() => {
    reset(toProfileForm(profile), { keepDirtyValues: true });
  }, [profile, reset]);

  const address = watch('address').trim();

  const onSubmit = form.handleSubmit((v) => {
    setError(null);
    update.mutate(toProfileBody(v, profile.version), {
      onSuccess: (saved) => {
        reset(toProfileForm(saved));
        toast.success('Đã lưu hồ sơ công ty');
        onSaved?.();
      },
      onError: (e) => {
        const problem = getProblem(e);
        if (problem?.code === 'version_conflict') {
          // Hook đã thay cache bằng bản mới; effect ở trên nạp ô chưa sửa, giữ phần đang sửa
          setError('Hồ sơ vừa được người khác sửa. Đã tải bản mới, phần bạn đang sửa vẫn giữ; xem lại rồi lưu lần nữa.');
          return;
        }
        const fields = problem?.errors ?? {};
        let hasField = false;
        for (const k of ['taxCode', 'address', 'responsibleName', 'responsibleAddress'] as const) {
          if (fields[k]) {
            setFieldError(k, { message: fields[k] });
            hasField = true;
          }
        }
        if (!hasField) setError(getErrorMessage(e));
      },
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="grid max-w-2xl gap-4" data-testid="company-profile-form">
        {error && (
          <AlertMessage severity="warning" onClose={() => setError(null)}>
            {error}
          </AlertMessage>
        )}
        <Card className="gap-0 py-0">
          <div className="border-b px-4 py-3 text-sm font-semibold">Thông tin đăng ký</div>
          <dl className="grid gap-3 px-4 py-4 text-sm sm:grid-cols-[160px_minmax(0,1fr)]">
            <dt className="text-muted-foreground">Tên công ty</dt>
            <dd data-testid="company-name">{profile.name}</dd>
            <dt className="text-muted-foreground">Mã số thuế</dt>
            <dd className="tabular-nums">
              {profile.taxCode ?? <span className="text-muted-foreground">Chưa có mã số thuế</span>}
            </dd>
          </dl>
          {profile.taxCode === null && (
            <div className="border-t px-4 py-4">
              <FormTextField
                control={control}
                name="taxCode"
                label="Nhập mã số thuế"
                placeholder="0123456789"
                inputMode="numeric"
                description="Nhập một lần, lưu xong không tự sửa được. Không nhận mã đã bị quản trị Commerio gỡ khỏi công ty."
              />
            </div>
          )}
          <div className="border-t px-4 py-4">
            <FormTextField
              control={control}
              name="address"
              label="Địa chỉ đăng ký"
              placeholder="Số nhà, đường, phường, quận, tỉnh"
              maxLength={PROFILE_MAX}
            />
          </div>
        </Card>
        <Card className="gap-0 py-0">
          <div className="border-b px-4 py-3 text-sm font-semibold">Tổ chức chịu trách nhiệm hàng hoá</div>
          <div className="grid gap-4 px-4 py-4">
            <FormTextField
              control={control}
              name="responsibleName"
              label="Tên tổ chức"
              placeholder={profile.name}
              description="Để trống thì dùng tên công ty."
              maxLength={PROFILE_MAX}
            />
            <FormTextField
              control={control}
              name="responsibleAddress"
              label="Địa chỉ tổ chức"
              placeholder={address || 'Chưa có địa chỉ đăng ký'}
              description="Để trống thì dùng địa chỉ đăng ký."
              maxLength={PROFILE_MAX}
            />
            <p className="text-sm text-muted-foreground" data-testid="effective-responsible">
              Đang điền lên sàn: {profile.effectiveResponsible.name}
              {profile.effectiveResponsible.address ? `, ${profile.effectiveResponsible.address}` : ''}
            </p>
          </div>
        </Card>
        <div className="flex gap-2">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? 'Đang lưu…' : 'Lưu'}
          </Button>
          <Button type="button" variant="outline" disabled={update.isPending} onClick={() => reset(toProfileForm(profile))}>
            Hoàn tác
          </Button>
        </div>
      </form>
    </Form>
  );
}
