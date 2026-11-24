import { useRef } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { ProductFormPage } from './ProductFormPage';

/** `navigate(..., { state })` sau khi tạo: trang sửa của đúng sản phẩm này giữ nguyên instance của form tạo */
export interface ProductCreatedState {
  createdId: string;
}

/**
 * Bọc ProductFormPage cho hai route `catalog/products/new` và `catalog/products/:productId` (FE#463). Đổi giữa tạo và sửa
 * thì mount lại để không giữ state cũ, trừ lúc vừa tạo xong chuyển sang chính sản phẩm đó: giữ instance để trang không
 * vẽ lại từ đầu (chi tiết đã có sẵn trong cache)
 */
export function ProductFormRoute() {
  const { productId } = useParams<{ productId: string }>();
  const location = useLocation();
  const createdId = (location.state as ProductCreatedState | null)?.createdId;
  const isNew = !productId;
  const last = useRef({ isNew, key: 0 });
  if (last.current.isNew !== isNew) {
    const keep = !isNew && createdId === productId;
    last.current = { isNew, key: keep ? last.current.key : last.current.key + 1 };
  }
  return <ProductFormPage key={last.current.key} />;
}
