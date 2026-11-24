/**
 * Trạng thái wizard thiết lập ban đầu (FE#468, Documents/21 mục 23). Hàm thuần: bước nào hiện, bước nào mở được,
 * ai bị ép về `/welcome`, dải nào hiện ở khu làm việc.
 */
import type { Onboarding, OnboardingItem, OnboardingKey } from '@/types/onboarding';

/** Thứ tự bảy bước bắt buộc (Documents/21 mục 23); chữ là tên trên thanh bước (design v2.html, STEPS) */
export const WIZARD_STEP_LABELS = {
  company_profile: 'Hồ sơ công ty',
  connect_shop: 'Kết nối gian hàng',
  link_skus: 'Liên kết SKU sàn',
  assign_groups: 'Danh mục sản phẩm',
  stock_sync: 'Đồng bộ tồn lần đầu',
  order_cutoff: 'Đồng bộ đơn từ thời điểm nào',
  opening_stock: 'Tồn đầu kỳ',
} as const satisfies Partial<Record<OnboardingKey, string>>;

export type WizardKey = keyof typeof WIZARD_STEP_LABELS;
/** Màn đang đứng: một bước, hoặc trang "Sẵn sàng bán" */
export type WizardView = WizardKey | 'ready';

/** Bốn bước thiết lập gian hàng dùng chung gian hàng đang thiết lập (`ref` kiểu `shop`) */
export const SHOP_SETUP_KEYS: readonly WizardKey[] = ['link_skus', 'assign_groups', 'stock_sync', 'order_cutoff'];

export interface WizardStep {
  key: WizardKey;
  label: string;
  /** Số thứ tự trên thanh bước, từ 1 */
  index: number;
  done: boolean;
  /** Mở được: đã xong, hoặc mọi bước trước đã xong */
  reachable: boolean;
  ref: OnboardingItem['ref'];
}

const isWizardKey = (key: string): key is WizardKey => key in WIZARD_STEP_LABELS;

/** Các bước của wizard: mục bắt buộc BE trả (đã lọc quyền) theo thứ tự BE; mục FE chưa biết thì bỏ */
export function wizardSteps(data: Onboarding): WizardStep[] {
  const required = data.items.filter((i) => !i.optional && isWizardKey(i.key));
  let blocked = false;
  return required.map((item, i) => {
    const step: WizardStep = {
      key: item.key as WizardKey,
      label: WIZARD_STEP_LABELS[item.key as WizardKey],
      index: i + 1,
      done: item.done,
      reachable: item.done || !blocked,
      ref: item.ref,
    };
    if (!item.done) blocked = true;
    return step;
  });
}

/** Màn mặc định: bước `next` nếu là của người dùng, không thì bước đầu tiên chưa xong; xong hết thì "Sẵn sàng bán" */
function defaultView(data: Onboarding, steps: WizardStep[]): WizardView {
  const next = data.next;
  if (next?.mine && steps.some((s) => s.key === next.key && s.reachable)) return next.key as WizardKey;
  return steps.find((s) => !s.done)?.key ?? 'ready';
}

/**
 * Màn wizard theo `?step=` trên URL. Bước chưa mở được (đi tắt qua URL) hoặc không có thì về màn mặc định, để tải lại
 * trang vẫn đứng đúng bước mà không nhảy cóc.
 */
export function resolveView(data: Onboarding, urlStep: string | null): WizardView {
  const steps = wizardSteps(data);
  if (urlStep === 'ready') return steps.every((s) => s.done) ? 'ready' : defaultView(data, steps);
  const hit = steps.find((s) => s.key === urlStep);
  return hit?.reachable ? hit.key : defaultView(data, steps);
}

/** Màn sau khi xong bước `key`: bước kế theo thứ tự, hết bước thì "Sẵn sàng bán" */
export function viewAfter(data: Onboarding, key: WizardKey): WizardView {
  const steps = wizardSteps(data);
  const i = steps.findIndex((s) => s.key === key);
  return steps[i + 1]?.key ?? 'ready';
}

/** Màn trước để nút "Quay lại"; bước đầu thì null */
export function viewBefore(data: Onboarding, view: WizardView): WizardKey | null {
  const steps = wizardSteps(data);
  if (view === 'ready') return steps.at(-1)?.key ?? null;
  const i = steps.findIndex((s) => s.key === view);
  return i > 0 ? steps[i - 1].key : null;
}

/**
 * Chế độ của khu làm việc công ty (Documents/21 mục 23, mục FE):
 * - `force`: ép về `/welcome` (`mustWizard`);
 * - `banner`: công ty chưa hoàn tất, người này không bị ép: dải "Công ty đang thiết lập" (mọi vai trò, cả Sale);
 * - `resume`: đã hoàn tất mà có mục bị đảo lại: dải "Tiếp tục thiết lập" ở Tổng quan;
 * - `none`: chưa tải được hoặc không còn gì.
 */
export type WorkspaceMode = 'force' | 'banner' | 'resume' | 'none';

export function workspaceMode(data: Onboarding | undefined): WorkspaceMode {
  if (!data) return 'none';
  if (data.mustWizard) return 'force';
  if (data.completedAt === null) return 'banner';
  return data.total > 0 && data.done < data.total ? 'resume' : 'none';
}

/**
 * Trang còn mở được khi đang bị ép về `/welcome`: uỷ quyền sàn về trang callback; bước 3 tới 6 còn làm ở trang thiết
 * lập gian hàng (tạm, tới khi nhúng vào wizard). Bước 7 đã nhúng phiếu kiểm kê đầu kỳ vào wizard (FE#468 PR C) nên
 * trang phiếu không còn mở được lúc bị ép.
 */
const INTERIM_ALLOWED: RegExp[] = [
  /^channel\/shops\/oauth-callback\/[^/]+$/,
  /^channel\/shops\/[^/]+\/setup$/,
];

/** Guard công ty: đường cần chuyển tới (`/welcome`), hoặc null nếu được ở lại trang */
export function onboardingRedirect(data: Onboarding | undefined, companyId: string, pathname: string): string | null {
  if (workspaceMode(data) !== 'force') return null;
  const base = `/c/${companyId}/`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/\/$/, '') : '';
  if (INTERIM_ALLOWED.some((re) => re.test(rest))) return null;
  return `/c/${companyId}/welcome`;
}
