import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSaveProductSpec } from '@/api/shops.api';
import { problemMessage } from '@/api/problemMessages';
import { CategoryStep } from '@/features/channel/push/CategoryStep';
import { draftFromSpec, withCategory, type SpecDraft } from '@/features/channel/specDraft';
import type { ProductDetail } from '@/types/catalog';
import type { Marketplace, ProductSpec } from '@/types/shop';

interface CategoryPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  product: ProductDetail;
  platform: Marketplace;
  label: string;
  /** Gian hàng gọi gợi ý category; null khi chưa có gian hàng của sàn */
  shopId: string | null;
  spec: ProductSpec | null;
  pathIds: string[] | null;
  /** Tab đang có attribute sửa dở: nhắc rằng đổi category sẽ bỏ phần đó */
  dirty: boolean;
}

/**
 * Chọn hoặc đổi category của sàn ngay trong tab sàn của trang sản phẩm, không rời trang (FE#459). Chọn xong thì lưu
 * thông tin sàn với category mới; leaf khác thì attribute và ánh xạ trục của leaf cũ bỏ đi (mã attribute theo leaf)
 */
export function CategoryPickerDialog({ open, onOpenChange, companyId, product, platform, label, shopId, spec, pathIds, dirty }: CategoryPickerDialogProps) {
  const [draft, setDraft] = useState<SpecDraft>(() => draftFromSpec(spec));
  const save = useSaveProductSpec();
  const changed = draft.externalCategoryId !== (spec?.externalCategoryId ?? null);

  // Radix không gọi onOpenChange(true) khi cha mở hộp, nên đặt lại lựa chọn theo prop `open`: Huỷ rồi mở lại không còn
  // category chọn dở (review FE#466)
  useEffect(() => {
    if (open) setDraft(draftFromSpec(spec));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ đặt lại lúc mở, không theo spec đổi khi đang mở
  }, [open]);

  const onSave = async () => {
    if (!draft.externalCategoryId || save.isPending) return;
    try {
      const saved = await save.mutateAsync({
        productId: product.id,
        platform,
        input: {
          externalCategoryId: draft.externalCategoryId,
          attributes: draft.attributes,
          axisMap: draft.axisMap,
          valueMap: draft.valueMap,
          version: spec?.version ?? null,
        },
      });
      toast.success(
        saved.missing.length ? `Đã lưu category ${label}. Còn thiếu ${saved.missing.length} mục.` : `Đã lưu category ${label}.`,
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(problemMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{spec ? `Đổi category ${label}` : `Chọn category ${label}`}</DialogTitle>
          <DialogDescription>Chọn xong bấm Lưu category, trang sản phẩm giữ nguyên.</DialogDescription>
        </DialogHeader>
        {open && (
          <CategoryStep
            platform={platform}
            label={label}
            companyId={companyId}
            shopId={shopId}
            product={product}
            draft={draft}
            pathIds={pathIds}
            onPick={(c) => setDraft((d) => withCategory(d, c.externalId, c.path))}
          />
        )}
        {spec && changed && (
          <AlertMessage severity="warning">
            Category khác thì attribute {label} đã điền cho category cũ sẽ bỏ, cần điền lại theo category mới
            {dirty ? ', kể cả phần đang sửa chưa lưu' : ''}.
          </AlertMessage>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button type="button" onClick={onSave} disabled={!changed || !draft.externalCategoryId || save.isPending}>
            {save.isPending ? 'Đang lưu…' : 'Lưu category'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
