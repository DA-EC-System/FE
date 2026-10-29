/**
 * Catalog của công ty đang làm việc: danh mục, thuộc tính (UC-CP-01), sản phẩm, biến thể,
 * ảnh (UC-CP-02). Hợp đồng theo commerio-backend#13, #14; BE lấy công ty từ token.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { useAuthStore } from '@/stores/authStore';
import type { PageResult } from './types';
import type {
  Attribute,
  AttributeInput,
  BusinessStatusInput,
  BusinessStatusResult,
  Category,
  CategoryInput,
  ProductCreateInput,
  ProductDetail,
  ProductListItem,
  ProductListParams,
  ProductUpdateInput,
  ProductVariant,
  UploadTicket,
} from '@/types/catalog';

export const catalogKeys = {
  all: (companyId: string) => ['company', companyId, 'catalog'] as const,
  categories: (companyId: string) => [...catalogKeys.all(companyId), 'categories'] as const,
  attributes: (companyId: string) => [...catalogKeys.all(companyId), 'attributes'] as const,
  products: (companyId: string) => [...catalogKeys.all(companyId), 'products'] as const,
  productList: (companyId: string, params: ProductListParams) =>
    [...catalogKeys.products(companyId), 'list', params] as const,
  product: (companyId: string, id: string) =>
    [...catalogKeys.products(companyId), 'detail', id] as const,
};

function useCompanyId(): string {
  return useAuthStore((s) => s.companyContext?.companyId ?? '');
}

/** Số sản phẩm của danh mục/thuộc tính và SKU kế tiếp đổi theo sản phẩm → làm mới cả catalog */
function useInvalidateCatalog() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return () => qc.invalidateQueries({ queryKey: catalogKeys.all(companyId) });
}

// ---------- Danh mục và quy tắc SKU (UC-CP-01) ----------

export function useCategories() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: catalogKeys.categories(companyId),
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data } = await apiClient.get<Category[]>('/catalog/categories');
      return data;
    },
  });
}

export function useCreateCategory() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (input: CategoryInput) => {
      const { data } = await apiClient.post<Category>('/catalog/categories', input);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateCategory() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async ({ id, ...body }: CategoryInput & { id: string; version: number }) => {
      const { data } = await apiClient.put<Category>(`/catalog/categories/${id}`, body);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      await apiClient.delete(`/catalog/categories/${id}`, { params: { version } });
    },
    onSuccess: invalidate,
  });
}

// ---------- Thuộc tính (UC-CP-01) ----------

export function useAttributes() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: catalogKeys.attributes(companyId),
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data } = await apiClient.get<Attribute[]>('/catalog/attributes');
      return data;
    },
  });
}

export function useCreateAttribute() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (input: AttributeInput) => {
      const { data } = await apiClient.post<Attribute>('/catalog/attributes', input);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateAttribute() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async ({ id, ...body }: AttributeInput & { id: string; version: number }) => {
      const { data } = await apiClient.put<Attribute>(`/catalog/attributes/${id}`, body);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteAttribute() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      await apiClient.delete(`/catalog/attributes/${id}`, { params: { version } });
    },
    onSuccess: invalidate,
  });
}

// ---------- Sản phẩm và biến thể (UC-CP-02) ----------

export function useProducts(params: ProductListParams) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: catalogKeys.productList(companyId, params),
    enabled: Boolean(companyId),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data } = await apiClient.get<PageResult<ProductListItem>>('/catalog/products', {
        params,
      });
      return data;
    },
  });
}

export function useProduct(id: string | undefined) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: catalogKeys.product(companyId, id ?? ''),
    enabled: Boolean(companyId && id),
    queryFn: async () => {
      const { data } = await apiClient.get<ProductDetail>(`/catalog/products/${id}`);
      return data;
    },
  });
}

export function useCreateProduct() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (input: ProductCreateInput) => {
      const { data } = await apiClient.post<ProductDetail>('/catalog/products', input);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateProduct() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async ({ id, ...body }: ProductUpdateInput & { id: string }) => {
      const { data } = await apiClient.put<ProductDetail>(`/catalog/products/${id}`, body);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useAddVariant() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async ({
      productId,
      attributeValueIds,
    }: {
      productId: string;
      attributeValueIds: string[];
    }) => {
      const { data } = await apiClient.post<ProductVariant>(
        `/catalog/products/${productId}/variants`,
        { attributeValueIds },
      );
      return data;
    },
    onSuccess: invalidate,
  });
}

/**
 * Đổi trạng thái kinh doanh (sơ đồ B1). Không truyền `variantIds` thì áp cho mọi SKU con;
 * SKU không làm được thao tác này nằm trong `skipped` kèm lý do.
 */
export function useChangeBusinessStatus() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async ({ productId, ...body }: BusinessStatusInput & { productId: string }) => {
      const { data } = await apiClient.post<BusinessStatusResult>(
        `/catalog/products/${productId}/business-status`,
        body,
      );
      return data;
    },
    onSuccess: invalidate,
  });
}

// ---------- Ảnh qua module files (commerio-backend#14) ----------

/**
 * Xin vé rồi PUT thẳng file lên kho (SeaweedFS/S3). PUT dùng fetch thường:
 * không gắn token của Commerio vào URL của kho lưu trữ.
 */
export async function uploadProductImage(file: File): Promise<string> {
  return uploadFile(file, 'product_image');
}

/** `attachment`: tệp đính kèm chứng từ, mọi thành viên công ty tải được (FE#55) */
export async function uploadFile(file: File, purpose: 'product_image' | 'attachment'): Promise<string> {
  const { data: ticket } = await apiClient.post<UploadTicket>('/files/uploads', {
    fileName: file.name,
    contentType: file.type,
    sizeBytes: file.size,
    purpose,
  });
  const res = await fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.headers, body: file });
  if (!res.ok) throw new Error(`Tải ${file.name} thất bại (${res.status})`);
  return ticket.fileId;
}
