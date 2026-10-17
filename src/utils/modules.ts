/**
 * 15 phân hệ của Commerio (docs/17). Mười phân hệ lõi luôn bật;
 * năm phân hệ tuỳ chọn do CEO bật (UC-PI-01, UC-PI-02).
 */

export const CORE_MODULES = [
  'platform',
  'identity',
  'catalog',
  'pricing',
  'inventory',
  'sales',
  'fulfillment',
  'finance',
  'payment',
  'notification',
] as const;

export const OPTIONAL_MODULES = [
  'purchasing',
  'channel',
  'inbox',
  'assistant',
  'report',
] as const;

export type CoreModuleKey = (typeof CORE_MODULES)[number];
export type OptionalModuleKey = (typeof OPTIONAL_MODULES)[number];
export type ModuleKey = CoreModuleKey | OptionalModuleKey;

export const MODULE_LABELS: Record<ModuleKey, string> = {
  platform: 'Nền tảng',
  identity: 'Tài khoản và phân quyền',
  catalog: 'Sản phẩm',
  pricing: 'Bảng giá',
  inventory: 'Kho',
  sales: 'Đơn hàng',
  fulfillment: 'Duyệt đơn và giao hàng',
  finance: 'Tài chính',
  payment: 'Thanh toán',
  notification: 'Thông báo',
  purchasing: 'Mua hàng',
  channel: 'Kênh bán',
  inbox: 'Hộp thư chung',
  assistant: 'Trợ lý AI',
  report: 'Báo cáo',
};

export function isOptionalModule(key: ModuleKey): key is OptionalModuleKey {
  return (OPTIONAL_MODULES as readonly string[]).includes(key);
}
