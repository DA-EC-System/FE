import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useConnectShop } from '@/api/shops.api';
import { problemMessage } from '@/api/problemMessages';
import { useAuthStore } from '@/stores/authStore';
import type { ShopConnectInput } from '@/types/shop';

/** Công ty bắt đầu kết nối: sàn gọi lại vào URL cố định không có companyId */
export const OAUTH_COMPANY_KEY = 'commerio_oauth_company';

/**
 * Bắt đầu OAuth (UC-CH-01 bước 4–5): xin BE trang uỷ quyền rồi chuyển sang sàn.
 * Trang của sàn thật nằm ngoài app nên tải hẳn trang; sàn giả lập là một route của SPA
 * nên chuyển trong app để dữ liệu mock (giữ trong bộ nhớ) không mất.
 */
export function useStartConnect() {
  const navigate = useNavigate();
  const connect = useConnectShop();
  const companyId = useAuthStore((s) => s.companyContext?.companyId ?? '');

  const start = async (input: ShopConnectInput) => {
    try {
      const { authorizeUrl } = await connect.mutateAsync(input);
      try {
        sessionStorage.setItem(OAUTH_COMPANY_KEY, companyId);
      } catch {
        // Không ghi được thì trang callback dùng công ty đang chọn
      }
      if (authorizeUrl.startsWith('/')) navigate(authorizeUrl);
      else window.location.assign(authorizeUrl);
    } catch (e) {
      toast.error(problemMessage(e));
    }
  };

  return { start, pending: connect.isPending, variables: connect.variables };
}
