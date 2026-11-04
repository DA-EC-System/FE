import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { SearchInput } from '@/components/common/FilterBar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getProblem } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { useCategoryAttributes, useMarketplaceCategories, useSaveCategoryMap } from '@/api/shops.api';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import type { Category } from '@/types/catalog';
import type { CategoryMap, MarketplaceCategory } from '@/types/shop';
import { CATEGORY_SEARCH_LIMIT, attributeErrors, pickAttributeValues, splitProblemErrors } from './categoryMap';

interface CategoryMapDialogProps {
  shopId: string;
  /** Danh mục Commerio đang ghép; `null` là đóng hộp */
  category: Pick<Category, 'id' | 'name'> | null;
  /** Bản ghép hiện tại (sửa), `null` khi chưa ghép */
  current: CategoryMap | null;
  onClose: () => void;
}

/** FE#146: chọn danh mục lá trên sàn cho một danh mục Commerio và điền thuộc tính bắt buộc */
export function CategoryMapDialog({ shopId, category, current, onClose }: CategoryMapDialogProps) {
  const save = useSaveCategoryMap();
  return (
    <Dialog open={Boolean(category)} onOpenChange={(v) => !v && !save.isPending && onClose()}>
      {/* Chặn autofocus: Cypress sập khi Dialog tự focus vào ô tìm/combobox bên trong */}
      <DialogContent className="sm:max-w-2xl" onOpenAutoFocus={(e) => e.preventDefault()}>
        {category && (
          <CategoryMapForm
            key={category.id}
            shopId={shopId}
            category={category}
            current={current}
            save={save}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface FormProps {
  shopId: string;
  category: Pick<Category, 'id' | 'name'>;
  current: CategoryMap | null;
  save: ReturnType<typeof useSaveCategoryMap>;
  onClose: () => void;
}

type Picked = { externalId: string; name: string | null };

function CategoryMapForm({ shopId, category, current, save, onClose }: FormProps) {
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search.trim(), 300);
  const [picked, setPicked] = useState<Picked | null>(
    current ? { externalId: current.externalCategoryId, name: null } : null,
  );
  const [values, setValues] = useState<Record<string, string>>(current?.attributes ?? {});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ severity: 'error' | 'warning'; text: string } | null>(null);

  const results = useMarketplaceCategories(shopId, debounced, true);
  const attrs = useCategoryAttributes(shopId, picked?.externalId ?? null);
  const attributes = attrs.data ?? [];

  const pick = (c: MarketplaceCategory) => {
    if (c.externalId === picked?.externalId) return;
    setPicked({ externalId: c.externalId, name: c.name });
    setFieldErrors({});
    setCategoryError(null);
  };

  const submit = async () => {
    setNotice(null);
    if (!picked) {
      setCategoryError('Chọn một danh mục trên sàn');
      return;
    }
    if (!attrs.isSuccess) return;
    const invalid = attributeErrors(attributes, values);
    setFieldErrors(invalid);
    if (Object.keys(invalid).length) return;
    try {
      await save.mutateAsync({
        shopId,
        categoryId: category.id,
        input: {
          externalCategoryId: picked.externalId,
          attributes: pickAttributeValues(attributes, values),
          version: current?.version ?? null,
        },
      });
      toast.success(`Đã ghép danh mục ${category.name}`);
      onClose();
    } catch (e) {
      const code = problemCode(e);
      const problem = getProblem(e);
      if (code === 'version_conflict') {
        // Bảng ghép đã được tải lại (onSettled); lấy bản mới nhất BE gửi kèm để người dùng xem rồi lưu lại
        const latest = (problem as { current?: CategoryMap } | undefined)?.current;
        if (latest?.externalCategoryId) {
          setPicked({ externalId: latest.externalCategoryId, name: null });
          setValues(latest.attributes ?? {});
        }
        setFieldErrors({});
        setNotice({
          severity: 'warning',
          text: 'Danh mục vừa được người khác ghép lại. Đã tải bản mới nhất, xem lại rồi lưu nếu vẫn muốn đổi.',
        });
        return;
      }
      if (problem?.status === 422 && problem.errors) {
        const split = splitProblemErrors(problem.errors);
        setFieldErrors(split.attributes);
        setCategoryError(split.other.externalCategoryId ?? null);
        const rest = Object.entries(split.other).filter(([k]) => k !== 'externalCategoryId');
        if (rest.length) setNotice({ severity: 'error', text: rest.map(([, m]) => m).join(' ') });
        return;
      }
      setNotice({ severity: 'error', text: problemMessage(e) });
    }
  };

  const items = results.data ?? [];

  return (
    <>
      <DialogHeader>
        <DialogTitle>Ghép danh mục {category.name}</DialogTitle>
        <DialogDescription>
          Chọn danh mục lá trên sàn cho sản phẩm thuộc danh mục <strong>{category.name}</strong>, rồi điền các thuộc
          tính sàn bắt buộc. Tên, mô tả, giá và kích thước gói Commerio tự điền khi đẩy.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        {notice && <AlertMessage severity={notice.severity}>{notice.text}</AlertMessage>}

        <div className="grid gap-2">
          <Label>Danh mục trên sàn</Label>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Tìm danh mục sàn, vd: áo thun"
            className="md:w-full"
          />
          <div
            role="listbox"
            aria-label="Danh mục trên sàn"
            className="max-h-56 overflow-y-auto rounded-md border"
            data-testid="market-categories"
          >
            {results.isLoading ? (
              <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Đang tìm trên sàn…
              </p>
            ) : results.isError ? (
              <div className="p-3">
                <AlertMessage severity="error">{problemMessage(results.error)}</AlertMessage>
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => results.refetch()}>
                  Thử lại
                </Button>
              </div>
            ) : items.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Không có danh mục sàn khớp “{debounced}”.</p>
            ) : (
              items.map((c) => {
                const parts = c.name.split(' > ');
                const leaf = parts.pop();
                const selected = c.externalId === picked?.externalId;
                return (
                  <button
                    key={c.externalId}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => pick(c)}
                    className={cn(
                      'flex w-full flex-col items-start border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent',
                      selected && 'bg-primary/10',
                    )}
                  >
                    <span className="font-medium">{leaf}</span>
                    {parts.length > 0 && <span className="text-xs text-muted-foreground">{parts.join(' › ')}</span>}
                  </button>
                );
              })
            )}
          </div>
          {results.isSuccess && items.length >= CATEGORY_SEARCH_LIMIT && (
            <p className="text-xs text-muted-foreground">
              Sàn chỉ trả {CATEGORY_SEARCH_LIMIT} danh mục đầu, gõ thêm từ khoá để thu hẹp.
            </p>
          )}
          {picked && (
            <p className="text-sm" data-testid="picked-category">
              Đã chọn: <strong>{picked.name ?? `Mã danh mục sàn ${picked.externalId}`}</strong>
            </p>
          )}
          {categoryError && <p className="text-sm text-destructive">{categoryError}</p>}
        </div>

        {picked && (
          <div className="grid gap-3" data-testid="category-attributes">
            <Label className="text-muted-foreground">Thuộc tính bắt buộc của sàn</Label>
            {attrs.isLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Đang tải thuộc tính…
              </p>
            ) : attrs.isError ? (
              <div>
                <AlertMessage severity="error">{problemMessage(attrs.error)}</AlertMessage>
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => attrs.refetch()}>
                  Thử lại
                </Button>
              </div>
            ) : attributes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Danh mục này không có thuộc tính bắt buộc.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {attributes.map((a) => {
                  const id = `attr-${a.name}`;
                  const error = fieldErrors[a.name];
                  const set = (v: string) => {
                    setValues((prev) => ({ ...prev, [a.name]: v }));
                    setFieldErrors(({ [a.name]: _drop, ...rest }) => rest);
                  };
                  return (
                    <div key={a.name} className="grid gap-1.5">
                      <Label htmlFor={id}>{a.label}</Label>
                      {a.options.length ? (
                        <Select value={values[a.name] ?? ''} onValueChange={set}>
                          <SelectTrigger id={id} className="w-full" aria-invalid={Boolean(error)}>
                            <SelectValue placeholder={`Chọn ${a.label.toLowerCase()}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {a.options.map((o) => (
                              <SelectItem key={o} value={o}>
                                {o}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id={id}
                          value={values[a.name] ?? ''}
                          onChange={(e) => set(e.target.value)}
                          aria-invalid={Boolean(error)}
                        />
                      )}
                      {error && (
                        <p className="text-sm text-destructive" data-testid={`attr-error-${a.name}`}>
                          {error}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
          Huỷ
        </Button>
        <Button type="button" onClick={submit} disabled={save.isPending || (Boolean(picked) && !attrs.isSuccess)}>
          {save.isPending && <Loader2 className="animate-spin" />}
          Lưu
        </Button>
      </DialogFooter>
    </>
  );
}
