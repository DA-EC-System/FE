import { Link } from 'react-router-dom';
import { AlertMessage } from '@/components/common/AlertMessage';
import { blockerFix, canUseFix } from '@/features/channel/blockerFix';
import { shopState, shopTitle } from '@/features/channel/readiness';
import type { ShopReadiness } from '@/types/blocker';
import { useProductFix } from './productFix';

/**
 * Đầu tab sàn: các mục còn chặn đăng lên gian hàng của sàn, cùng danh sách với rail và trình đăng (FE#458). Mỗi mục một dòng
 * kèm nút tới chỗ sửa; trong trang sản phẩm nút mở tại chỗ (`ProductFixContext`).
 */
export function ReadinessNote({
  companyId,
  productId,
  readiness,
  can,
}: {
  companyId: string;
  productId: string;
  readiness: ShopReadiness;
  can: { product: boolean; finance: boolean };
}) {
  const openFix = useProductFix();
  const state = shopState(readiness);
  if (state === 'listed') return null;
  if (state === 'ready')
    return (
      <AlertMessage severity="success">
        <span data-testid="readiness-note">Đủ thông tin để đăng lên {shopTitle(readiness)}.</span>
      </AlertMessage>
    );
  return (
    <AlertMessage severity="warning">
      <div className="grid gap-1" data-testid="readiness-note">
        <b>
          Còn {readiness.blockers.length} mục trước khi đăng lên {shopTitle(readiness)}
        </b>
        <ul className="grid gap-0.5">
          {readiness.blockers.map((b, i) => {
            const found = blockerFix(b.target, {
              companyId,
              productId,
              platform: readiness.platform,
              shopId: readiness.shopId,
              variantId: b.variantIds[0] ?? null,
            });
            const fix = found && canUseFix(found, can) ? found : null;
            return (
              <li key={`${b.code}-${i}`} className="flex flex-wrap items-baseline gap-x-2" data-testid="readiness-item">
                <span>{b.label}</span>
                {fix && (
                  <Link
                    to={fix.to}
                    className="text-sm font-medium underline underline-offset-2"
                    data-testid="readiness-fix"
                    onClick={(ev) => {
                      if (openFix?.(fix.to)) ev.preventDefault();
                    }}
                  >
                    {fix.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </AlertMessage>
  );
}
