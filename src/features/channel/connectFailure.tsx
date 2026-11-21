import { ArrowLeftRight, Building2, LockKeyhole, Timer, UserRoundX, X } from 'lucide-react';
import { getProblem } from '@/api/client';
import { PlatformDetail } from '@/components/common/PlatformDetail';
import { companyMismatchMessage, isCompanyRef, isShopRef, problemSummary, type CompanyRef } from '@/api/problemMessages';
import { platformInfo } from '@/lib/platforms';
import { platformLabel } from './shopSchemas';
import { CompanyBox, ShopBox, type ResultScreenProps, type ShopRef } from './ConnectOutcome';

/* ---------- Tình huống thất bại khi sàn trả về ---------- */

export type ConnectFailure =
  | { kind: 'declined'; platform: string }
  | { kind: 'no_state'; platform: string }
  | { kind: 'state_invalid' }
  | { kind: 'mismatch'; expected?: ShopRef; actual?: ShopRef; via?: 'oauth' | 'token' }
  | { kind: 'elsewhere'; via?: 'oauth' | 'token' }
  | { kind: 'company_mismatch'; expected?: CompanyRef; actual?: CompanyRef }
  | { kind: 'error'; message: string; platformMessage?: string };


/**
 * Lỗi của callback hay dán token thành tình huống để chọn màn kết quả (§18.4). `via = 'token'` khi lỗi đến từ dán token:
 * màn nhầm gian hàng, gian hàng ở công ty khác hướng dẫn dán lại token thay cho đăng xuất trên sàn.
 */
export function failureFromError(e: unknown, via?: 'oauth' | 'token'): ConnectFailure {
  const p = getProblem(e);
  const viaField = via ? { via } : {};
  switch (p?.code) {
    case 'oauth_state_invalid':
    case 'invalid_state':
      return { kind: 'state_invalid' };
    case 'shop_mismatch':
      return {
        kind: 'mismatch',
        expected: isShopRef(p.expected) ? p.expected : undefined,
        actual: isShopRef(p.actual) ? p.actual : undefined,
        ...viaField,
      };
    case 'shop_connected_elsewhere':
      return { kind: 'elsewhere', ...viaField };
    case 'company_mismatch':
      return {
        kind: 'company_mismatch',
        ...(isCompanyRef(p.expected) && isCompanyRef(p.actual) ? { expected: p.expected, actual: p.actual } : {}),
      };
    default:
      return { kind: 'error', ...problemSummary(e, 'connect') };
  }
}

/** Các bước khi gian hàng đang nối ở công ty khác; dán token thì không có bước đăng xuất trên sàn */
export function elsewhereSteps(via: 'oauth' | 'token' = 'oauth'): string[] {
  return [
    'Nếu gian hàng đã chuyển sang công ty bạn: nhờ công ty cũ ngắt kết nối trong Commerio của họ, rồi thử lại.',
    via === 'token'
      ? 'Nếu bạn dán nhầm: lấy token của đúng gian hàng rồi dán lại.'
      : 'Nếu bạn đăng nhập nhầm: đăng xuất trên sàn, đăng nhập đúng tài khoản rồi thêm lại.',
  ];
}

const refLabel = (ref?: ShopRef) => (ref ? (ref.name ?? ref.externalShopId) : '');

/**
 * Nội dung màn kết quả của từng tình huống; nút do nơi gọi truyền vào.
 * platformName: tên sàn theo GET /channel/shops/platforms; vắng thì dùng nhãn dự phòng theo mã sàn.
 */
export function failureScreen(failure: ConnectFailure, platformName?: string): Omit<ResultScreenProps, 'actions'> {
  switch (failure.kind) {
    case 'declined':
      return {
        outcome: 'declined',
        tone: 'bad',
        icon: X,
        title: `Bạn đã từ chối uỷ quyền trên ${platformLabel(failure.platform, platformName)}`,
        description:
          'Chưa kết nối gian hàng nào. Commerio chưa có quyền gì trên gian hàng này, bạn có thể thử lại bất cứ lúc nào.',
      };
    case 'no_state': {
      const name = platformLabel(failure.platform, platformName);
      return {
        outcome: 'no_state',
        tone: 'warn',
        icon: Timer,
        title: 'Hãy bắt đầu kết nối từ Commerio',
        description: `Hãy bấm Kết nối ${name} trong Commerio, không uỷ quyền từ ${platformInfo(failure.platform)?.authorizePortal ?? 'trang của sàn'}.`,
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
    case 'mismatch': {
      const token = failure.via === 'token';
      return {
        outcome: 'mismatch',
        tone: 'warn',
        icon: UserRoundX,
        title:
          failure.expected && failure.actual
            ? token
              ? `Token vừa dán là của ${refLabel(failure.actual)}, không phải ${refLabel(failure.expected)}`
              : `Bạn vừa đăng nhập ${refLabel(failure.actual)}, không phải ${refLabel(failure.expected)}`
            : token
              ? 'Token vừa dán không phải của gian hàng đang kết nối lại'
              : 'Tài khoản sàn vừa uỷ quyền không phải gian hàng đang kết nối lại',
        description: token
          ? 'Commerio không đổi gì: cả hai gian hàng giữ nguyên trạng thái, token vừa dán đã bỏ. Hãy lấy token của đúng gian hàng rồi dán lại.'
          : 'Commerio không đổi gì: cả hai gian hàng giữ nguyên trạng thái, token vừa nhận đã bỏ. Đăng xuất trên sàn, đăng nhập đúng tài khoản rồi kết nối lại.',
        children:
          failure.expected && failure.actual ? (
            <div className="flex w-full flex-wrap items-stretch justify-center gap-3 text-start" data-testid="mismatch-compare">
              <ShopBox label="Gian hàng cần kết nối" shop={failure.expected} />
              <ArrowLeftRight className="size-5 self-center text-muted-foreground" aria-hidden />
              <ShopBox label={token ? 'Gian hàng của token' : 'Gian hàng vừa đăng nhập'} shop={failure.actual} miss />
            </div>
          ) : undefined,
      };
    }
    case 'elsewhere':
      return {
        outcome: 'elsewhere',
        tone: 'bad',
        icon: LockKeyhole,
        title: 'Gian hàng này đang kết nối ở một công ty khác',
        description:
          'Một gian hàng trên sàn chỉ kết nối với một công ty trong Commerio, để đơn và tồn không bị hai bên cùng đổi. Commerio không cho biết đó là công ty nào.',
        children: (
          <ol className="w-full list-decimal ps-5 text-start text-sm leading-relaxed text-foreground-2">
            {elsewhereSteps(failure.via).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        ),
      };
    case 'company_mismatch':
      return {
        outcome: 'company_mismatch',
        tone: 'warn',
        icon: Building2,
        title:
          failure.expected && failure.actual
            ? `Bạn đang mở ${failure.actual.name}, không phải ${failure.expected.name}`
            : 'Bạn đã đổi công ty giữa chừng',
        description: `${companyMismatchMessage(failure.expected, failure.actual)} Commerio không lưu gian hàng nào, token vừa nhận đã bỏ.`,
        children:
          failure.expected && failure.actual ? (
            <div className="flex w-full flex-wrap items-stretch justify-center gap-3 text-start" data-testid="company-compare">
              <CompanyBox label="Bắt đầu kết nối ở" company={failure.expected} />
              <ArrowLeftRight className="size-5 self-center text-muted-foreground" aria-hidden />
              <CompanyBox label="Đang mở" company={failure.actual} miss />
            </div>
          ) : undefined,
      };
    case 'error':
      return {
        outcome: 'error',
        tone: 'bad',
        icon: X,
        title: 'Chưa kết nối được gian hàng',
        description: failure.message,
        children: <PlatformDetail text={failure.platformMessage} className="justify-items-center" />,
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
