import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { getProblem } from '@/api/client';
import { useCompanyProfile, useUpdateCompanyProfile } from '@/api/companySettings.api';
import { problemMessage } from '@/api/problemMessages';
import { usePlatformCategory, useSaveProductSpec, useSpecForCategory } from '@/api/shops.api';
import type { ProductDetail } from '@/types/catalog';
import type { ProductSpecResult, SpecMissing, SpecValue } from '@/types/shop';
import {
  draftFromSpec,
  draftMissing,
  productAxes,
  PROFILE_FIELDS,
  profilePatch,
  specInput,
  suggestValueMap,
  withAttribute,
  withAxis,
  withCategory,
  withCombinedAxes,
  withSuggestedAxes,
  withValue,
  type ProductAxis,
  type SpecDraft,
} from '../specDraft';

/**
 * Bản nháp thông tin sàn của một sản phẩm với một sàn (Documents/21 §18.8.2): category, attribute ghi đè, ánh xạ thuộc
 * tính biến thể. Gian hàng cùng sàn dùng chung một bản. `shopId` là gian hàng dùng để gọi gợi ý, cascade (cần token).
 */
export function usePlatformDraft({
  platform,
  label,
  product,
  initial,
  shopId,
  canEditCompany,
}: {
  platform: string;
  label: string;
  product: ProductDetail;
  initial: ProductSpecResult;
  shopId: string | null;
  canEditCompany: boolean;
}) {
  const [saved, setSaved] = useState<ProductSpecResult>(initial);
  const [draft, setDraft] = useState<SpecDraft>(() => draftFromSpec(initial.spec));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  const leaf = usePlatformCategory(platform, draft.externalCategoryId, shopId);
  const attrs = leaf.data?.attributes ?? null;
  const sales = useMemo(() => attrs?.filter((a) => a.kind === 'sales') ?? null, [attrs]);
  const axes = useMemo(() => productAxes(product.variants), [product.variants]);
  const facts = useMemo(() => ({ originCountry: product.originCountry ?? null, brand: product.brand ?? null }), [product.originCountry, product.brand]);
  const forLeaf = useSpecForCategory(product.id, platform, draft.externalCategoryId);
  const caps = forLeaf.data?.variantCapabilities ?? null;
  // "Còn thiếu" (kiểm người bán 21/11/2026 KB3 3.10): bản đã lưu, chưa sửa gì thì tin `missing` của BE, vì BE tính cả
  // giá trị tự điền từ thông số sản phẩm, hồ sơ công ty (`resolved`). Đang sửa, đổi category hay chưa lưu lần nào thì
  // tính lại trên giá trị gộp: ghi đè trong nháp > `resolved` của BE cho đúng leaf đang chọn (Documents/21 §18.8.2)
  const missing: SpecMissing[] = draftMissing({ draft, dirty, saved, forLeaf: forLeaf.data, attrs, axes, facts, caps });

  // Áp gợi ý thuộc tính biến thể của BE khi đã có attribute của leaf (§18.8.3)
  const suggestion = forLeaf.data;
  useEffect(() => {
    if (!sales || !suggestion) return;
    const codes = new Set(sales.map((a) => a.code));
    setDraft((d) =>
      withSuggestedAxes(
        d,
        axes,
        { axisMap: suggestion.suggestedAxisMap ?? {}, valueMap: suggestion.suggestedValueMap ?? {} },
        codes,
        suggestion.variantCapabilities?.customAxisName ?? true,
      ),
    );
  }, [sales, axes, suggestion]);

  const clearError = (key: string) =>
    setErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });

  const edit = (next: (d: SpecDraft) => SpecDraft, errorKey?: string) => {
    setDraft(next);
    setDirty(true);
    if (errorKey) clearError(errorKey);
  };

  const pickCategory = (externalId: string, path: string) => edit((d) => withCategory(d, externalId, path), 'externalCategoryId');
  const setAttribute = (code: string, value: SpecValue | null) => edit((d) => withAttribute(d, code, value), `attributes.${code}`);
  const setAxis = (axis: ProductAxis, code: string) =>
    edit((d) => {
      const next = withAxis(d, axis, code);
      return sales ? { ...next, valueMap: suggestValueMap([axis], next.axisMap, sales, next.valueMap) } : next;
    }, `axisMap.${axis.attributeId}`);
  const setValue = (valueId: string, optionId: string | null) => edit((d) => withValue(d, valueId, optionId), `valueMap.${valueId}`);

  // Ô công ty hồ sơ còn trống: tick sẵn "Lưu cũng vào hồ sơ công ty" (chỉ hiện khi hồ sơ trống nên không ghi đè gì)
  const profile = useCompanyProfile({ enabled: canEditCompany });
  const updateProfile = useUpdateCompanyProfile();
  const blankProfileCodes = useMemo(
    () => (attrs ?? []).filter((a) => a.tier === 'company' && PROFILE_FIELDS[a.code] && !a.defaultValue).map((a) => a.code),
    [attrs],
  );
  const [profileSync, setProfileSync] = useState<Set<string>>(new Set());
  useEffect(() => setProfileSync(new Set(blankProfileCodes)), [blankProfileCodes]);
  const toggleProfileSync = (code: string, checked: boolean) =>
    setProfileSync((prev) => {
      const next = new Set(prev);
      if (checked) next.add(code);
      else next.delete(code);
      return next;
    });

  const syncProfile = async () => {
    if (!canEditCompany || !profile.data) return;
    const body = profilePatch(
      blankProfileCodes.filter((c) => profileSync.has(c)),
      draft.attributes,
      profile.data.version,
    );
    if (!body) return;
    try {
      await updateProfile.mutateAsync(body);
      toast.success('Đã lưu vào hồ sơ công ty, sản phẩm sau tự điền.');
    } catch (e) {
      toast.warning(`Chưa lưu được vào hồ sơ công ty: ${problemMessage(e)}. Sản phẩm này vẫn dùng giá trị vừa nhập.`);
    }
  };

  const saveSpec = useSaveProductSpec();
  /** Lưu thông tin sàn; trả bản BE vừa lưu, null khi lỗi (lỗi theo ô nằm ở `errors`) */
  const save = async (from: SpecDraft = draft): Promise<ProductSpecResult | null> => {
    if (!from.externalCategoryId) return null;
    setErrors({});
    try {
      const result = await saveSpec.mutateAsync({ productId: product.id, platform, input: specInput(from, attrs, axes) });
      await syncProfile();
      setSaved(result);
      setDraft(draftFromSpec(result.spec));
      setDirty(false);
      return result;
    } catch (e) {
      const problem = getProblem(e);
      if (problem?.errors && Object.keys(problem.errors).length) {
        setErrors(problem.errors);
        toast.error(`Thông tin ${label} còn ô chưa hợp lệ, xem các ô viền đỏ.`);
      } else if (problem?.code === 'version_conflict' && problem.current) {
        const current = problem.current as ProductSpecResult;
        setSaved(current);
        setDraft(draftFromSpec(current.spec));
        setDirty(false);
        toast.warning(`Người khác vừa sửa thông tin ${label} của sản phẩm này. Đã nạp bản mới nhất, xem lại rồi lưu lại.`);
      } else {
        toast.error(problemMessage(e));
      }
      return null;
    }
  };

  /**
   * "Gộp thành 1 thuộc tính biến thể" (FE#459, commerio-backend#568): mọi thuộc tính biến thể trỏ `combineTarget` rồi lưu
   * ngay (PUT spec). Sản phẩm trong Commerio không đổi; lúc đẩy BE nối giá trị theo thứ tự ("Đỏ - S")
   */
  const combineAxes = async (): Promise<ProductSpecResult | null> => {
    const target = caps?.combineTarget;
    if (!target) return null;
    const next = withCombinedAxes(draft, axes, target);
    setDraft(next);
    setDirty(true);
    const result = await save(next);
    if (result) toast.success(`Đã gộp ${axes.map((a) => a.name).join(', ')} thành 1 thuộc tính biến thể khi đăng lên ${label} và lưu thông tin sàn.`);
    return result;
  };

  /** Khối đổi category của sản phẩm đã đăng gặp 409: nạp bản mới */
  const reload = (current: ProductSpecResult) => {
    setSaved(current);
    setDraft(draftFromSpec(current.spec));
    setDirty(false);
  };

  return {
    platform,
    label,
    saved,
    draft,
    errors,
    dirty,
    leaf,
    attrs,
    sales,
    axes,
    facts,
    caps,
    missing,
    saving: saveSpec.isPending,
    profileSync,
    toggleProfileSync,
    pickCategory,
    setAttribute,
    setAxis,
    setValue,
    save,
    combineAxes,
    reload,
  };
}

export type PlatformDraft = ReturnType<typeof usePlatformDraft>;
