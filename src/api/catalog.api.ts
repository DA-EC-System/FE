/**
 * Catalog của công ty đang làm việc: nhóm hàng, cài đặt sản phẩm, thuộc tính (UC-CP-01), sản phẩm, biến thể,
 * ảnh (UC-CP-02). Hợp đồng theo commerio-backend#13, #14; BE lấy công ty từ token.
 */

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMutation } from './useMutation';
import { apiClient } from './client';
import { shopKeys } from './shops.api';
import { useAuthStore } from '@/stores/authStore';
import type { PageResult } from './types';
import type {
  Attribute,
  AttributeInput,
  BusinessStatusInput,
  BusinessStatusResult,
  BulkEditParams,
  BulkEditRow,
  BulkSaveResult,
  BulkSaveRow,
  GroupTemplate,
  GroupTemplateInput,
  ProductCreateInput,
  ProductDetail,
  ProductGroup,
  ProductGroupInput,
  ProductSettings,
  ProductSettingsInput,
  ProductListItem,
  ProductListParams,
  ProductUpdateInput,
  ProductVariant,
  SpecField,
  SpecFieldCreateInput,
  SpecFieldUpdateInput,
  UploadTicket,
  VariantUpdateInput,
} from '@/types/catalog';

export const catalogKeys = {
  all: (companyId: string) => ['company', companyId, 'catalog'] as const,
  groups: (companyId: string) => [...catalogKeys.all(companyId), 'groups'] as const,
  settings: (companyId: string) => [...catalogKeys.all(companyId), 'settings'] as const,
  attributes: (companyId: string) => [...catalogKeys.all(companyId), 'attributes'] as const,
  products: (companyId: string) => [...catalogKeys.all(companyId), 'products'] as const,
  productList: (companyId: string, params: ProductListParams) =>
    [...catalogKeys.products(companyId), 'list', params] as const,
  product: (companyId: string, id: string) =>
    [...catalogKeys.products(companyId), 'detail', id] as const,
  specFields: (companyId: string) => [...catalogKeys.all(companyId), 'spec-fields'] as const,
  template: (companyId: string, groupId: string) => [...catalogKeys.groups(companyId), 'template', groupId] as const,
  bulkEdit: (companyId: string, params: BulkEditParams) =>
    [...catalogKeys.all(companyId), 'bulk-edit', params] as const,
};

function useCompanyId(): string {
  return useAuthStore((s) => s.companyContext?.companyId ?? '');
}

/** Số sản phẩm của nhóm hàng/thuộc tính và SKU kế tiếp đổi theo sản phẩm → làm mới cả catalog */
/** Tải lại mọi dữ liệu catalog của công ty (vd. sau 409 `version_conflict` để có bản mới nhất) */
export function useInvalidateCatalog() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return () => qc.invalidateQueries({ queryKey: catalogKeys.all(companyId) });
}

// ---------- Nhóm hàng và cài đặt sản phẩm (Documents/21 §5.2, FE#350) ----------

export function useGroups() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: catalogKeys.groups(companyId),
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data } = await apiClient.get<{ items: ProductGroup[] }>('/catalog/groups');
      return data.items;
    },
  });
}

export function useCreateGroup() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (input: ProductGroupInput) => {
      const { data } = await apiClient.post<ProductGroup>('/catalog/groups', input);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateGroup() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async ({ id, ...body }: ProductGroupInput & { id: string; version: number }) => {
      const { data } = await apiClient.put<ProductGroup>(`/catalog/groups/${id}`, body);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteGroup() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      await apiClient.delete(`/catalog/groups/${id}`, { params: { version } });
    },
    onSuccess: invalidate,
  });
}

/** Chuyển sản phẩm sang nhóm khác (kể cả đã lưu trữ); bỏ `productIds` là cả nhóm */
export function useMoveGroupProducts() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; targetGroupId: string; productIds?: string[] }) => {
      const { data } = await apiClient.post<{ moved: number }>(`/catalog/groups/${id}/move-products`, body);
      return data;
    },
    onSuccess: invalidate,
  });
}

/** Mẫu SKU, số thứ tự kế tiếp và gợi ý mặc định của công ty */
export function useProductSettings() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: catalogKeys.settings(companyId),
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data } = await apiClient.get<ProductSettings>('/catalog/settings');
      return data;
    },
  });
}

export function useUpdateProductSettings() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (input: ProductSettingsInput) => {
      const { data } = await apiClient.put<ProductSettings>('/catalog/settings', input);
      return data;
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

/**
 * Điền mặc định cho vài trường số của biến thể để trang không sập khi BE cũ chưa trả.
 * Độ hoàn thiện (`readiness`, `missing`) và hiện diện (`presence`) không điền: BE luôn trả (commerio-backend#204);
 * thiếu thì trang hiện "Chưa tính", không mặc định Sẵn sàng hay Chưa đăng.
 */
export function withVariantDefaults(p: ProductDetail): ProductDetail {
  return {
    ...p,
    variants: p.variants.map((v) => ({
      ...v,
      businessStatus: v.businessStatus ?? (v.archivedAt ? 'archived' : 'selling'),
      missing: v.missing ?? [],
      targetNetPrice: v.targetNetPrice ?? null,
      minQty: v.minQty ?? null,
      weightG: v.weightG ?? null,
      lengthMm: v.lengthMm ?? null,
      widthMm: v.widthMm ?? null,
      heightMm: v.heightMm ?? null,
      version: v.version ?? 1,
      hasListingError: v.hasListingError ?? false,
      listingCount: v.listingCount ?? 0,
      archiveBlockers: v.archiveBlockers ?? [],
    })),
    specs: p.specs ?? [],
    missingSpecFieldIds: p.missingSpecFieldIds ?? [],
  };
}

export function useProduct(id: string | undefined) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: catalogKeys.product(companyId, id ?? ''),
    enabled: Boolean(companyId && id),
    queryFn: async () => {
      const { data } = await apiClient.get<ProductDetail>(`/catalog/products/${id}`);
      return withVariantDefaults(data);
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
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return useMutation({
    mutationFn: async ({ id, ...body }: ProductUpdateInput & { id: string }) => {
      const { data } = await apiClient.put<ProductDetail>(`/catalog/products/${id}`, body);
      return data;
    },
    onSuccess: () => {
      invalidate();
      // Listing gian hàng hiện tên, ảnh đại diện của sản phẩm (FE#205): đổi ảnh xong quay lại gian hàng phải thấy ngay
      void qc.invalidateQueries({ queryKey: [...shopKeys.all(companyId), 'listings'] });
    },
  });
}

/**
 * Đặt hoặc thay ảnh của một giá trị phân loại (PUT …/attribute-value-images/:attributeValueId, §17.2). Không nhận
 * `version`, không tăng `version` sản phẩm; trả ProductDetail mới
 */
export function useSetValueImage() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return useMutation({
    mutationFn: async ({ productId, attributeValueId, fileId }: { productId: string; attributeValueId: string; fileId: string }) => {
      const { data } = await apiClient.put<ProductDetail>(
        `/catalog/products/${productId}/attribute-value-images/${attributeValueId}`,
        { fileId },
      );
      return withVariantDefaults(data);
    },
    onSuccess: (p) => qc.setQueryData(catalogKeys.product(companyId, p.id), p),
  });
}

/** Gỡ ảnh của một giá trị phân loại, không xoá tệp */
export function useRemoveValueImage() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return useMutation({
    mutationFn: async ({ productId, attributeValueId }: { productId: string; attributeValueId: string }) => {
      const { data } = await apiClient.delete<ProductDetail>(
        `/catalog/products/${productId}/attribute-value-images/${attributeValueId}`,
      );
      return withVariantDefaults(data);
    },
    onSuccess: (p) => qc.setQueryData(catalogKeys.product(companyId, p.id), p),
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
 * Xoá hẳn (§17.2): chỉ sản phẩm mọi SKU Chờ hoàn thiện, chưa dùng ở chứng từ, listing nào; ngược lại 409 product_in_use.
 * Lưu trữ đi qua business-status.
 */
export function useDeleteProduct() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      await apiClient.delete(`/catalog/products/${id}`, { params: { version } });
    },
    onSuccess: invalidate,
  });
}

/** §17.2: sửa giá chuẩn, giá muốn bán, cân nặng, kích thước gói của một SKU; trả ProductDetail mới */
export function useUpdateVariant() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async ({
      productId,
      variantId,
      ...input
    }: VariantUpdateInput & { productId: string; variantId: string }) => {
      const { data } = await apiClient.patch<ProductDetail>(
        `/catalog/products/${productId}/variants/${variantId}`,
        input,
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

// ---------- Sửa hàng loạt SKU (FE#155, BE#242) ----------

/** Dòng SKU kèm số hiện tại và gợi ý của BE. Gợi ý chỉ để hiện, không tự lưu */
export function useBulkEditRows(params: BulkEditParams) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: catalogKeys.bulkEdit(companyId, params),
    enabled: Boolean(companyId),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data } = await apiClient.get<PageResult<BulkEditRow>>('/catalog/variants/bulk-edit', { params });
      return data;
    },
  });
}

/** Lưu một lần; dòng lỗi trả về trong `failed`, dòng khác vẫn lưu */
export function useBulkSaveVariants() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return useMutation({
    mutationFn: async (rows: BulkSaveRow[]) => {
      const { data } = await apiClient.patch<BulkSaveResult>('/catalog/variants/bulk', { rows });
      return data;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: catalogKeys.all(companyId) });
      qc.invalidateQueries({ queryKey: ['company', companyId, 'inventory'] });
    },
  });
}

// ---------- Thư viện thông số và mẫu nhóm hàng (Documents/21 §5.5) ----------

export function useSpecFields(options: { enabled?: boolean } = {}) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: catalogKeys.specFields(companyId),
    enabled: Boolean(companyId) && (options.enabled ?? true),
    queryFn: async () => {
      const { data } = await apiClient.get<{ items: SpecField[] }>('/catalog/spec-fields');
      return data.items;
    },
  });
}

export function useCreateSpecField() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (input: SpecFieldCreateInput) => {
      const { data } = await apiClient.post<SpecField>('/catalog/spec-fields', input);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateSpecField() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async ({ id, ...body }: SpecFieldUpdateInput & { id: string }) => {
      const { data } = await apiClient.put<SpecField>(`/catalog/spec-fields/${id}`, body);
      return data;
    },
    onSuccess: invalidate,
  });
}

/** 409 `in_use` kèm `groupCount`, `productCount` khi còn mẫu nhóm hoặc sản phẩm dùng */
export function useDeleteSpecField() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      await apiClient.delete(`/catalog/spec-fields/${id}`, { params: { version } });
    },
    onSuccess: invalidate,
  });
}

/** Mẫu của nhóm: trục chuẩn và thông số; form tạo sản phẩm gọi khi chọn nhóm */
export function useGroupTemplate(groupId: string | undefined) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: catalogKeys.template(companyId, groupId ?? ''),
    enabled: Boolean(companyId && groupId),
    queryFn: async () => {
      const { data } = await apiClient.get<GroupTemplate>(`/catalog/groups/${groupId}/template`);
      return data;
    },
  });
}

export function useUpdateGroupTemplate() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async ({ groupId, ...body }: GroupTemplateInput & { groupId: string }) => {
      const { data } = await apiClient.put<GroupTemplate>(`/catalog/groups/${groupId}/template`, body);
      return data;
    },
    onSuccess: invalidate,
  });
}
