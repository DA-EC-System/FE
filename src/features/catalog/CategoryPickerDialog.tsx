import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSaveProductSpec } from '@/api/shops.api';
import { CategoryStep } from '@/features/channel/push/CategoryStep';
import { draftFromSpec, withCategory, type SpecDraft } from '@/features/channel/specDraft';
import type { ProductDetail } from '@/types/catalog';
import type { Marketplace, ProductSpec, SpecMissing } from '@/types/shop';
import { categorySaveError, type CategorySaveError } from './categorySaveError';

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
  /**
   * Sản phẩm đang thật sự có trên sàn (listing đang bán hoặc tạm ẩn, đã có mã trên sàn): lưu chỉ đổi trong Commerio, còn
   * bấm đổi trên sàn (FE#474). Listing chỉ đẩy lỗi hay bị từ chối thì không tính
   */
  listed?: boolean;
  /** Lưu xong mà còn thiếu mục (`missing` khác rỗng): trang đưa người dùng tới phần Attribute */
  onSavedWithMissing?: (missing: SpecMissing[]) => void;
}

/**
 * Chọn hoặc đổi category của sàn ngay trong tab sàn của trang sản phẩm, không rời trang (FE#459). Chọn xong thì lưu
 * thông tin sàn với category mới; leaf khác thì attribute và ánh xạ trục của leaf cũ bỏ đi (mã attribute theo leaf)
 */
export function CategoryPickerDialog({
  open,
  onOpenChange,
  companyId,
  product,
  platform,
  label,
  shopId,
  spec,
  pathIds,
  dirty,
  listed,
  onSavedWithMissing,
}: CategoryPickerDialogProps) {
  const [draft, setDraft] = useState<SpecDraft>(() => draftFromSpec(spec));
  const [error, setError] = useState<CategorySaveError | null>(null);
  const save = useSaveProductSpec();
  const changed = draft.externalCategoryId !== (spec?.externalCategoryId ?? null);
  const reasonId = useId();
  // Nút Lưu tắt thì nói lý do cạnh nút
  const disabledReason = !draft.externalCategoryId ? 'Chọn category để lưu' : !changed ? 'Chọn category khác để lưu' : null;

  // Radix không gọi onOpenChange(true) khi cha mở hộp, nên đặt lại lựa chọn theo prop `open`: Huỷ rồi mở lại không còn
  // category chọn dở (review FE#466)
  useEffect(() => {
    if (open) {
      setDraft(draftFromSpec(spec));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ đặt lại lúc mở, không theo spec đổi khi đang mở
  }, [open]);

  const onSave = async () => {
    if (!draft.externalCategoryId || save.isPending) return;
    setError(null);
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
      if (saved.missing.length) onSavedWithMissing?.(saved.missing);
    } catch (e) {
      // Hiện trong hộp, gần nút Lưu: toast vài giây làm người dùng tưởng bấm Lưu không có tác dụng
      setError(categorySaveError(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Vùng cuộn chỉ là phần chọn category; câu lỗi và nút Lưu luôn hiện ở đáy */}
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{spec ? `Đổi category ${label}` : `Chọn category ${label}`}</DialogTitle>
          <DialogDescription>Chọn xong bấm Lưu category, trang sản phẩm giữ nguyên.</DialogDescription>
        </DialogHeader>
        <div className="-mx-6 grid min-h-0 flex-1 gap-4 overflow-y-auto px-6" data-testid="category-picker-scroll">
          {open && (
            <CategoryStep
              platform={platform}
              label={label}
              companyId={companyId}
              shopId={shopId}
              product={product}
              draft={draft}
              pathIds={pathIds}
              onPick={(c) => {
                setDraft((d) => withCategory(d, c.externalId, c.path));
                setError(null);
              }}
            />
          )}
          {spec && changed && (
            <AlertMessage severity="warning">
              Category khác thì attribute {label} đã điền cho category cũ sẽ bỏ, cần điền lại theo category mới
              {dirty ? ', kể cả phần đang sửa chưa lưu' : ''}.
            </AlertMessage>
          )}
          {listed && changed && (
            <AlertMessage severity="info">
              Sản phẩm đang có trên {label}. Lưu category chỉ đổi trong Commerio. Sau đó bấm &ldquo;Đổi category trên {label}&rdquo;
              dưới ô Category để gửi lên sàn: việc này chạy nền, sàn duyệt lại, trong lúc chờ bản cũ vẫn bán.
            </AlertMessage>
          )}
        </div>
        {error && (
          <AlertMessage severity="error" className="shrink-0">
            <p>{error.message}</p>
            {error.items.length > 0 && (
              <ul className="mt-1 list-disc ps-5">
                {error.items.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </AlertMessage>
        )}
        <DialogFooter className="shrink-0 items-center">
          {disabledReason && (
            <p id={reasonId} className="text-sm text-muted-foreground sm:me-auto">
              {disabledReason}
            </p>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={Boolean(disabledReason) || save.isPending}
            aria-describedby={disabledReason ? reasonId : undefined}
          >
            {save.isPending ? 'Đang lưu…' : 'Lưu category'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
