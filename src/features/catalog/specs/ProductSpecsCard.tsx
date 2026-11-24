import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { focusField } from '../focusField';
import { SpecFieldsInput, specFieldDomId } from './SpecFieldsInput';
import { EMPTY_SPEC, missingRequired, type SpecDraft, type SpecDrafts, type SpecFieldView } from './specValues';

/** id của card, để tab sàn nhảy tới khi chưa có id từng ô (acn-72, `productTabs.ts`) */
export const PRODUCT_SPECS_ID = 'product-field-specs';

interface ProductSpecsCardProps {
  groupName: string | null;
  /** Thông số của mẫu nhóm, theo thứ tự mẫu */
  templateViews: SpecFieldView[];
  /** Thông số ngoài mẫu đang có giá trị */
  otherViews: SpecFieldView[];
  drafts: SpecDrafts;
  onChange: (fieldId: string, draft: SpecDraft) => void;
  errors: Record<string, string>;
  readOnly: boolean;
  loading: boolean;
  /** Link trang danh mục, khi có quyền sửa danh mục */
  templateLink: string | null;
  /**
   * Thêm thuộc tính vào danh mục đang chọn ngay từ form, một bước (Documents/29 bước 3; Documents/21 §5.6).
   * Không có: người dùng không có quyền sửa danh mục
   */
  onAddField?: () => void;
}

/**
 * Card "Thông số" trên form sản phẩm (Documents/21 §5.5): ô theo mẫu nhóm hàng, rồi "Thông số khác" (ngoài mẫu, xoá
 * được). Thiếu thông số bắt buộc không chặn lưu; sản phẩm chỉ chưa "Sẵn sàng".
 */
export function ProductSpecsCard({
  groupName,
  templateViews,
  otherViews,
  drafts,
  onChange,
  errors,
  readOnly,
  loading,
  templateLink,
  onAddField,
}: ProductSpecsCardProps) {
  const missing = missingRequired(templateViews, drafts);

  return (
    <Card id={PRODUCT_SPECS_ID} tabIndex={-1} className="outline-none">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="flex-1">Thuộc tính sản phẩm{groupName ? ` của ${groupName}` : ''}</CardTitle>
          {groupName && !readOnly && onAddField && (
            <Button type="button" variant="outline" size="sm" onClick={onAddField}>
              Thêm thuộc tính vào danh mục
            </Button>
          )}
        </div>
        {!readOnly && missing.length > 0 && (
          <p className="text-sm text-warning-text">
            Còn trống {missing.length} thuộc tính cần cho Sẵn sàng:{' '}
            {missing.map((v, i) => (
              <span key={v.fieldId}>
                {i > 0 && ', '}
                <button
                  type="button"
                  className="min-h-6 cursor-pointer font-medium underline underline-offset-2"
                  onClick={() => focusField(specFieldDomId(v.fieldId))}
                >
                  {v.name}
                </button>
              </span>
            ))}
            . Vẫn lưu được.
          </p>
        )}
      </CardHeader>
      <CardContent className="grid gap-5">
        {!groupName ? (
          <p className="text-sm text-muted-foreground">Chọn danh mục sản phẩm để hiện các thuộc tính cần điền.</p>
        ) : loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : templateViews.length ? (
          <SpecFieldsInput views={templateViews} drafts={drafts} onChange={onChange} errors={errors} readOnly={readOnly} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Danh mục {groupName} chưa có thuộc tính sản phẩm.
            {templateLink && (
              <>
                {' '}
                <Link to={templateLink} className="font-medium text-primary-text underline underline-offset-2">
                  Mở trang danh mục
                </Link>
              </>
            )}
          </p>
        )}
        {otherViews.length > 0 && (
          <section className="grid gap-3 border-t pt-4" aria-label="Thuộc tính khác">
            <div>
              <h3 className="text-sm font-semibold">Thuộc tính khác</h3>
              <p className="text-xs text-muted-foreground">
                Không thuộc danh mục hiện tại, thường do đổi danh mục. Vẫn gửi lên sàn nếu có ánh xạ; không cần thì xoá.
              </p>
            </div>
            <SpecFieldsInput
              views={otherViews}
              drafts={drafts}
              onChange={onChange}
              errors={errors}
              readOnly={readOnly}
              onClear={(fieldId) => onChange(fieldId, EMPTY_SPEC)}
            />
          </section>
        )}
      </CardContent>
    </Card>
  );
}
