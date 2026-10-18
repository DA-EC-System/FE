import { CircleCheck } from 'lucide-react';
import { BrandLogo } from '@/components/common/BrandLogo';

/**
 * Trang khách được cổng đưa về sau khi trả tiền (AC-P6). Cố ý không đọc tham số trên URL:
 * kết quả thật chỉ đến qua IPN/webhook ở BE, tham số trả về có thể bị sửa tay.
 */
export function PaymentResultPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center text-card-foreground">
        <div className="mb-6 flex items-center justify-center gap-3">
          <BrandLogo size={32} />
          <span className="text-lg font-extrabold">Commerio</span>
        </div>
        <CircleCheck className="mx-auto mb-4 size-12 text-success" />
        <h1 className="mb-2 text-xl font-bold">Cảm ơn bạn</h1>
        <p className="text-muted-foreground">Đã nhận yêu cầu thanh toán. Cửa hàng sẽ xác nhận khi nhận được tiền.</p>
        <p className="mt-4 text-sm text-muted-foreground">Bạn có thể đóng trang này.</p>
      </div>
    </div>
  );
}
