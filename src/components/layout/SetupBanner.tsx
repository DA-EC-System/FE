import { Hourglass } from 'lucide-react';
import { useOnboarding } from '@/api/onboarding.api';
import { workspaceMode } from '@/features/onboarding/wizardState';

/**
 * Dải "Công ty đang thiết lập" (FE#468, Documents/21 mục 23): công ty chưa hoàn tất onboarding mà người này không bị ép
 * vào wizard (nhân viên không có quyền với bước còn thiếu, Sale). Đang tải hay lỗi thì không hiện.
 */
export function SetupBanner() {
  const onboarding = useOnboarding();
  if (workspaceMode(onboarding.data) !== 'banner') return null;
  return (
    <div
      role="status"
      data-testid="setup-banner"
      className="mb-4 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
    >
      <Hourglass className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <p>
        <b className="font-semibold">Công ty đang thiết lập.</b> Commerio chưa lấy đơn và chưa cập nhật tồn lên sàn cho tới khi xong. Bạn
        vẫn dùng được các màn khác.
      </p>
    </div>
  );
}
