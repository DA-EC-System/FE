import { formatDateTime } from '@/utils/format';
import type { PackageSummary } from '@/types/fulfillment';
import { shippingProviderTypeLabel } from './shared';

/** Vận chuyển của kiện sàn: đơn vị, gói giao, hạn sàn hứa, mã vận đơn; không có gì thì ẩn */
export function PackageShipping({ pkg }: { pkg: PackageSummary }) {
  const provider = pkg.carrier?.name ?? pkg.shipmentProvider;
  const parts = [
    provider,
    shippingProviderTypeLabel(pkg.shippingProviderType),
    pkg.promisedShippingAt && `sàn hứa gửi trước ${formatDateTime(pkg.promisedShippingAt)}`,
    pkg.trackingCode && `vận đơn ${pkg.trackingCode}`,
  ].filter(Boolean);
  if (!parts.length) return null;
  return (
    <p className="text-xs text-muted-foreground" data-testid="package-shipping">
      {parts.join(' · ')}
    </p>
  );
}
