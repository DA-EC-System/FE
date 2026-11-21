import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertMessage } from '@/components/common/AlertMessage';
import { PlatformDetail } from '@/components/common/PlatformDetail';
import { FormTextField } from '@/components/common/FormTextField';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { useConnectShopByToken } from '@/api/shops.api';
import { getProblem } from '@/api/client';
import { tokenErrorMessage, type ProblemSummary } from '@/api/problemMessages';
import type { ShopCallbackResult } from '@/types/shop';
import { ConnectSteps } from './ConnectOutcome';
import { failureFromError, type ConnectFailure } from './connectFailure';

/** Bước khi kiểm tra token với sàn; hiện trong lúc chờ BE */
const TOKEN_STEPS = ['Gọi sàn kiểm tra token', 'Đọc ID gian hàng', 'Đối chiếu với gian hàng đã có'];

const tokenSchema = z.object({
  accessToken: z.string().trim().min(1, 'Nhập mã truy cập').max(2000, 'Token dài tối đa 2000 ký tự'),
  refreshToken: z.string().trim().max(2000, 'Token dài tối đa 2000 ký tự'),
});
type TokenForm = z.infer<typeof tokenSchema>;

interface ShopTokenFormProps {
  platform: string;
  name: string;
  /** Gian hàng đang kết nối lại (commerio-backend#398): BE chỉ nối lại gian hàng này, token của seller khác là `shop_mismatch` */
  shopId?: string;
  /** Chữ nút quay lại; mặc định "Chọn sàn khác" (hộp Thêm gian hàng) */
  backLabel?: string;
  onBack: () => void;
  onBusyChange: (busy: boolean) => void;
  onDone: (result: ShopCallbackResult) => void;
  /** Lỗi có màn kết quả riêng (gian hàng đang nối ở công ty khác, token của seller khác khi kết nối lại) */
  onFailure: (failure: ConnectFailure) => void;
}

/** Cách 2: dán token lấy ở trang nhà phát triển của sàn (shop thử không đi OAuth được) */
export function ShopTokenForm({
  platform,
  name,
  shopId,
  backLabel = 'Chọn sàn khác',
  onBack,
  onBusyChange,
  onDone,
  onFailure,
}: ShopTokenFormProps) {
  const connect = useConnectShopByToken();
  const [error, setError] = useState<ProblemSummary | null>(null);
  const form = useForm<TokenForm>({
    resolver: zodResolver(tokenSchema),
    defaultValues: { accessToken: '', refreshToken: '' },
  });
  const { control, setError: setFieldError } = form;

  const onSubmit = form.handleSubmit(async ({ accessToken, refreshToken }) => {
    setError(null);
    onBusyChange(true);
    try {
      const result = await connect.mutateAsync({
        platform,
        accessToken,
        refreshToken: refreshToken || undefined,
        ...(shopId ? { shopId } : {}),
      });
      // Không giữ token trong form sau khi đã gửi
      form.reset();
      onDone(result);
    } catch (e) {
      const problem = getProblem(e);
      const fields = problem?.errors ?? {};
      if (fields.accessToken) setFieldError('accessToken', { message: fields.accessToken });
      if (fields.refreshToken) setFieldError('refreshToken', { message: fields.refreshToken });
      if (fields.accessToken || fields.refreshToken) return;
      if (problem?.code === 'shop_connected_elsewhere' || problem?.code === 'shop_mismatch') {
        form.reset();
        onFailure(failureFromError(e, 'token'));
        return;
      }
      setError(tokenErrorMessage(e, platform));
    } finally {
      onBusyChange(false);
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="grid gap-4" data-testid="token-form">
        <p className="font-medium">Dán token {name}</p>
        {error && (
          <AlertMessage severity="error">
            <p>{error.message}</p>
            <PlatformDetail text={error.platformMessage} />
          </AlertMessage>
        )}
        {connect.isPending && <ConnectSteps steps={TOKEN_STEPS} current={1} />}
        <FormTextField
          control={control}
          name="accessToken"
          label="Mã truy cập (access token)"
          password
          autoComplete="off"
          className="[&_input]:font-mono"
        />
        <FormTextField
          control={control}
          name="refreshToken"
          label="Mã làm mới (refresh token, không bắt buộc)"
          password
          autoComplete="off"
          className="[&_input]:font-mono"
          description="Có mã làm mới thì Commerio tự gia hạn; không có thì hết hạn phải dán token mới."
        />
        <div className="flex justify-between gap-2">
          <Button type="button" variant="ghost" disabled={connect.isPending} onClick={onBack}>
            {backLabel}
          </Button>
          <Button type="submit" disabled={connect.isPending}>
            {connect.isPending ? 'Đang kết nối...' : 'Kết nối'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
