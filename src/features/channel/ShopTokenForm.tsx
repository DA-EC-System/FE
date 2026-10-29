import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { FormTextField } from '@/components/common/FormTextField';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { useConnectShopByToken } from '@/api/shops.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import type { ShopCallbackResult } from '@/types/shop';

const tokenSchema = z.object({
  accessToken: z.string().trim().min(1, 'Nhập access token').max(2000, 'Token dài tối đa 2000 ký tự'),
  refreshToken: z.string().trim().max(2000, 'Token dài tối đa 2000 ký tự'),
});
type TokenForm = z.infer<typeof tokenSchema>;

interface ShopTokenFormProps {
  platform: string;
  name: string;
  onBack: () => void;
  onBusyChange: (busy: boolean) => void;
  onDone: (result: ShopCallbackResult) => void;
}

/** Cách 2: dán token lấy trên console của sàn (shop thử không đi OAuth được) */
export function ShopTokenForm({ platform, name, onBack, onBusyChange, onDone }: ShopTokenFormProps) {
  const connect = useConnectShopByToken();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<TokenForm>({
    resolver: zodResolver(tokenSchema),
    defaultValues: { accessToken: '', refreshToken: '' },
  });
  const { control, setError: setFieldError } = form;

  const onSubmit = form.handleSubmit(async ({ accessToken, refreshToken }) => {
    setError(null);
    onBusyChange(true);
    try {
      const result = await connect.mutateAsync({ platform, accessToken, refreshToken: refreshToken || undefined });
      // Không giữ token trong form sau khi đã gửi
      form.reset();
      onDone(result);
    } catch (e) {
      const problem = getProblem(e);
      const fields = problem?.errors ?? {};
      if (fields.accessToken) setFieldError('accessToken', { message: fields.accessToken });
      if (fields.refreshToken) setFieldError('refreshToken', { message: fields.refreshToken });
      if (fields.accessToken || fields.refreshToken) return;
      setError(
        problem?.code === 'marketplace_rejected'
          ? 'Sàn từ chối token này. Kiểm tra lại token hoặc lấy token mới trên console của sàn.'
          : problemMessage(e),
      );
    } finally {
      onBusyChange(false);
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="grid gap-4" data-testid="token-form">
        <p className="font-medium">Dán token {name}</p>
        {error && <AlertMessage severity="error">{error}</AlertMessage>}
        <FormTextField
          control={control}
          name="accessToken"
          label="Access token"
          password
          autoComplete="off"
          className="[&_input]:font-mono"
        />
        <FormTextField
          control={control}
          name="refreshToken"
          label="Refresh token (không bắt buộc)"
          password
          autoComplete="off"
          className="[&_input]:font-mono"
          description="Có refresh token thì Commerio tự gia hạn; không có thì hết hạn phải kết nối lại."
        />
        <div className="flex justify-between gap-2">
          <Button type="button" variant="ghost" disabled={connect.isPending} onClick={onBack}>
            <ArrowLeft />
            Chọn sàn khác
          </Button>
          <Button type="submit" disabled={connect.isPending}>
            <KeyRound />
            {connect.isPending ? 'Đang kết nối...' : 'Kết nối'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
