import { ArrowLeftRight, Building2, LockKeyhole, Timer, UserRoundX, X } from 'lucide-react';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { platformLabel } from './shopSchemas';
import { ShopBox, type ResultScreenProps, type ShopRef } from './ConnectOutcome';

/* ---------- Tình huống thất bại khi sàn trả về ---------- */

export type ConnectFailure =
  | { kind: 'declined'; platform: string }
  | { kind: 'no_state'; platform: string }
  | { kind: 'state_invalid' }
  | { kind: 'mismatch'; expected?: ShopRef; actual?: ShopRef }
  | { kind: 'elsewhere' }
  | { kind: 'error'; message: string };

/** Nơi người dùng bấm uỷ quyền ngoài Commerio (§18.6.3): chỉ để hiện chữ, không rẽ nhánh luồng */
const AUTHORIZE_PORTAL: Record<string, string> = { tiktok: 'Partner Center' };

/** Lỗi của callback thành tình huống để chọn màn kết quả (§18.4) */
export function failureFromError(e: unknown): ConnectFailure {
  const p = getProblem(e);
  switch (p?.code) {
    case 'oauth_state_invalid':
    case 'invalid_state':
      return { kind: 'state_invalid' };
    case 'shop_mismatch':
      return { kind: 'mismatch', expected: p.expected, actual: p.actual };
    case 'shop_connected_elsewhere':
      return { kind: 'elsewhere' };
    default:
      return { kind: 'error', message: problemMessage(e) };
  }
}

const refLabel = (ref?: ShopRef) => (ref ? (ref.name ?? ref.externalShopId) : '');

/** Nội dung màn kết quả của từng tình huống; nút do nơi gọi truyền vào */
export function failureScreen(failure: ConnectFailure): Omit<ResultScreenProps, 'actions'> {
  switch (failure.kind) {
    case 'declined':
      return {
        outcome: 'declined',
        tone: 'bad',
        icon: X,
        title: `Bạn đã bấm Từ chối trên ${platformLabel(failure.platform)}`,
        description:
          'Bạn đã từ chối uỷ quyền, chưa kết nối gian hàng nào. Commerio chưa có quyền gì trên gian hàng này, bạn có thể thử lại bất cứ lúc nào.',
      };
    case 'no_state': {
      const name = platformLabel(failure.platform);
      return {
        outcome: 'no_state',
        tone: 'warn',
        icon: Timer,
        title: 'Chưa có phiên kết nối của Commerio',
        description: `Hãy bấm Kết nối ${name} trong Commerio, không uỷ quyền từ ${AUTHORIZE_PORTAL[failure.platform] ?? 'trang của sàn'}.`,
      };
    }
    case 'state_invalid':
      return {
        outcome: 'state_invalid',
        tone: 'warn',
        icon: Timer,
        title: 'Phiên kết nối đã hết hạn',
        description:
          'Phiên kết nối đã hết hạn hoặc không hợp lệ. Liên kết uỷ quyền chỉ dùng được một lần, trong thời gian ngắn; bắt đầu lại để lấy liên kết mới.',
      };
    case 'mismatch':
      return {
        outcome: 'mismatch',
        tone: 'warn',
        icon: UserRoundX,
        title:
          failure.expected && failure.actual
            ? `Bạn vừa đăng nhập ${refLabel(failure.actual)}, không phải ${refLabel(failure.expected)}`
            : 'Tài khoản sàn vừa uỷ quyền không phải gian hàng đang kết nối lại',
        description:
          'Commerio không đổi gì: cả hai gian hàng giữ nguyên trạng thái, token vừa nhận đã bỏ. Đăng xuất trên sàn, đăng nhập đúng tài khoản rồi kết nối lại.',
        children:
          failure.expected && failure.actual ? (
            <div className="flex w-full flex-wrap items-stretch justify-center gap-3 text-start" data-testid="mismatch-compare">
              <ShopBox label="Cần nối" shop={failure.expected} />
              <ArrowLeftRight className="size-5 self-center text-muted-foreground" aria-hidden />
              <ShopBox label="Sàn trả về" shop={failure.actual} miss />
            </div>
          ) : undefined,
      };
    case 'elsewhere':
      return {
        outcome: 'elsewhere',
        tone: 'bad',
        icon: LockKeyhole,
        title: 'Gian hàng này đang nối ở một công ty khác',
        description:
          'Một gian hàng trên sàn chỉ nối với một công ty trong Commerio, để đơn và tồn không bị hai bên cùng đổi. Commerio không cho biết đó là công ty nào.',
        children: (
          <ol className="w-full list-decimal ps-5 text-start text-sm leading-relaxed text-foreground-2">
            <li>Nếu gian hàng đã chuyển sang công ty bạn: nhờ công ty cũ ngắt kết nối trong Commerio của họ, rồi thử lại.</li>
            <li>Nếu bạn đăng nhập nhầm: đăng xuất trên sàn, đăng nhập đúng tài khoản rồi thêm lại.</li>
          </ol>
        ),
      };
    case 'error':
      return {
        outcome: 'error',
        tone: 'bad',
        icon: X,
        title: 'Chưa kết nối được gian hàng',
        description: failure.message,
      };
  }
}

/** Màn kết quả khi không biết công ty đang kết nối (redirect_uri không có companyId) */
export const NO_COMPANY_SCREEN: Omit<ResultScreenProps, 'actions'> = {
  outcome: 'no_company',
  tone: 'warn',
  icon: Building2,
  title: 'Không xác định được công ty',
  description:
    'Không xác định được công ty đang kết nối gian hàng. Có thể bạn đã đổi công ty ở tab khác. Chọn đúng công ty rồi kết nối lại.',
};
