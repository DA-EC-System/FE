import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowLeft, Ban, Plus } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { FormTextField } from '@/components/common/FormTextField';
import { RowAction } from '@/components/common/RowAction';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  useArchiveVariant,
  useAttributes,
  useCategories,
  useCreateProduct,
  useProduct,
  useUpdateProduct,
} from '@/api/catalog.api';
import { getProblem } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { conflictCurrent } from '@/features/identity/shared';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import type { ProductDetail, ProductVariant } from '@/types/catalog';
import { ProductImagesField, type ImageItem } from './ProductImagesField';
import { VariantBuilder, emptyPlan, planCombos, planError, type VariantPlan } from './VariantBuilder';
import { AddVariantDialog } from './AddVariantDialog';
import { comboKey, productSchema, type ProductForm } from './shared';

const toImages = (p: ProductDetail): ImageItem[] =>
  [...p.images].sort((a, b) => a.position - b.position).map((i) => ({ fileId: i.fileId, url: i.url }));

/** UC-CP-02: tạo sản phẩm kèm tổ hợp biến thể; sửa thông tin, ảnh và biến thể */
export function ProductFormPage() {
  const { productId } = useParams<{ productId: string }>();
  const isNew = !productId;
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const can = useCan();

  const productQuery = useProduct(productId);
  const product = productQuery.data;
  const categories = useCategories().data ?? [];
  const attributes = useAttributes().data ?? [];
  const createMut = useCreateProduct();
  const updateMut = useUpdateProduct();
  const archiveVariantMut = useArchiveVariant();

  const archived = product?.status === 'archived';
  const readOnly = !can(PERMISSIONS.productManage) || archived;

  const [images, setImages] = useState<ImageItem[]>([]);
  const [imagesError, setImagesError] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const [plan, setPlan] = useState<VariantPlan>(emptyPlan);
  const [variantsError, setVariantsError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [stopping, setStopping] = useState<ProductVariant | null>(null);

  const form = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: '', categoryId: '', description: '' },
  });
  const { control, reset, setError: setFieldError } = form;

  // Nạp form một lần cho mỗi sản phẩm; refetch sau khi thêm biến thể không đè lên chỗ đang sửa
  const loadedId = useRef<string | null>(null);
  const load = (p: ProductDetail) => {
    reset({ name: p.name, categoryId: p.category.id, description: p.description });
    setImages(toImages(p));
    setVersion(p.version);
  };
  useEffect(() => {
    if (product && loadedId.current !== product.id) {
      loadedId.current = product.id;
      load(product);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  const categoryId = useWatch({ control, name: 'categoryId' });
  const category = categories.find((c) => c.id === categoryId);

  const backToList = () => navigate(ROUTES.company.catalog(companyId));

  /** Lỗi 422 của BE về đúng chỗ (AC-8) */
  const applyFieldErrors = (e: unknown) => {
    const fieldErrors = getProblem(e)?.errors;
    if (!fieldErrors) return false;
    (['name', 'categoryId', 'description'] as const).forEach((f) => {
      if (fieldErrors[f]) setFieldError(f, { message: fieldErrors[f] });
    });
    setImagesError(fieldErrors.images);
    setVariantsError(fieldErrors.variants ?? null);
    return true;
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    setImagesError(undefined);
    const imageFileIds = images.map((i) => i.fileId);
    try {
      if (isNew) {
        const problem = planError(plan, attributes);
        setVariantsError(problem);
        if (problem) return;
        const variants = planCombos(plan, attributes)
          .filter((c) => !plan.excluded.includes(comboKey(c)))
          .map((attributeValueIds) => ({ attributeValueIds }));
        const created = await createMut.mutateAsync({ ...values, imageFileIds, variants });
        toast.success(`Đã tạo ${created.name} với ${created.variants.length} biến thể`);
        navigate(ROUTES.company.catalogProduct(companyId, created.id), { replace: true });
      } else {
        const saved = await updateMut.mutateAsync({
          id: productId,
          name: values.name,
          description: values.description,
          imageFileIds,
          version,
        });
        load(saved);
        toast.success(`Đã lưu ${saved.name}`);
      }
    } catch (e) {
      const latest = conflictCurrent<ProductDetail>(e);
      if (problemCode(e) === 'version_conflict' && latest) {
        load(latest);
        setError('Sản phẩm vừa được người khác sửa. Form đã hiện bản mới nhất, chưa có gì thay đổi.');
        return;
      }
      if (problemCode(e) === 'name_taken') {
        setFieldError('name', { message: getProblem(e)?.errors?.name ?? 'Đã có sản phẩm cùng tên' });
        return;
      }
      if (!applyFieldErrors(e)) setError(problemMessage(e));
    }
  });

  const stopVariant = async () => {
    if (!stopping || !productId) return;
    try {
      await archiveVariantMut.mutateAsync({ productId, variantId: stopping.id });
      toast.success(`Đã ngừng bán ${stopping.sku}`);
    } catch (e) {
      toast.warning(problemMessage(e));
    }
    setStopping(null);
  };

  const activeVariants = useMemo(
    () => product?.variants.filter((v) => !v.archivedAt).length ?? 0,
    [product],
  );

  const back = (
    <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={backToList}>
      <ArrowLeft />
      Danh sách sản phẩm
    </Button>
  );

  if (!isNew && productQuery.isLoading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!isNew && productQuery.isError) {
    // C4: không có hoặc của công ty khác đều là 404 (AC-15)
    const notFound = getProblem(productQuery.error)?.status === 404;
    return (
      <div>
        {back}
        <PageHeader title={notFound ? 'Không tìm thấy' : 'Không tải được sản phẩm'} />
        <AlertMessage severity="error">{problemMessage(productQuery.error)}</AlertMessage>
      </div>
    );
  }

  const busy = createMut.isPending || updateMut.isPending;
  const title = isNew ? 'Thêm sản phẩm' : readOnly ? (product?.name ?? '') : 'Sửa sản phẩm';

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate>
        {back}
        <PageHeader
          title={title}
          subtitle={product ? `Cập nhật lần cuối ${formatDateTime(product.updatedAt)}` : undefined}
          action={
            readOnly ? null : (
              <Button type="submit" disabled={busy || uploading}>
                {busy ? 'Đang lưu...' : uploading ? 'Đang tải ảnh...' : isNew ? 'Tạo sản phẩm' : 'Lưu'}
              </Button>
            )
          }
        />

        {archived && (
          <AlertMessage severity="info" className="mb-4">
            Sản phẩm đã lưu trữ nên chỉ xem được. SKU của sản phẩm không cấp lại cho sản phẩm khác.
          </AlertMessage>
        )}
        {error && (
          <AlertMessage severity="warning" className="mb-4">
            {error}
          </AlertMessage>
        )}

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Thông tin chung</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-[2fr_1fr]">
              <FormTextField
                control={control}
                name="name"
                label="Tên sản phẩm"
                autoFocus={isNew}
                readOnly={readOnly}
              />
              <FormField
                control={control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Danh mục</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={!isNew || readOnly}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full" aria-label="Danh mục">
                          <SelectValue placeholder="Chọn danh mục" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                        {/* Danh mục cũ có thể chưa nạp xong */}
                        {product && !categories.some((c) => c.id === product.category.id) && (
                          <SelectItem value={product.category.id}>{product.category.name}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                    {!form.formState.errors.categoryId && !readOnly && (
                      <FormDescription>
                        {isNew
                          ? 'SKU sinh theo quy tắc của danh mục'
                          : 'Không đổi được vì SKU đã sinh theo danh mục này'}
                      </FormDescription>
                    )}
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="description"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Mô tả</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} readOnly={readOnly} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ảnh sản phẩm</CardTitle>
            </CardHeader>
            <CardContent>
              <ProductImagesField
                value={images}
                onChange={(next) => {
                  setImages(next);
                  setImagesError(undefined);
                }}
                onBusyChange={setUploading}
                disabled={readOnly}
                error={imagesError}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Biến thể</CardTitle>
              {!isNew && !readOnly && (
                <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                  <Plus />
                  Thêm biến thể
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {isNew ? (
                <VariantBuilder
                  attributes={attributes}
                  category={category}
                  value={plan}
                  onChange={(next) => {
                    setPlan(next);
                    setVariantsError(null);
                  }}
                  error={variantsError}
                />
              ) : (
                <div className="grid gap-2">
                  <div className="overflow-x-auto rounded-md border">
                    <Table data-testid="variants">
                      <TableHeader>
                        <TableRow>
                          <TableHead>SKU</TableHead>
                          <TableHead>Thuộc tính</TableHead>
                          <TableHead>Trạng thái</TableHead>
                          {!readOnly && <TableHead className="w-16" />}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {product?.variants.map((v) => (
                          <TableRow
                            key={v.id}
                            data-row-id={v.id}
                            className={cn(v.archivedAt && 'text-muted-foreground')}
                          >
                            <TableCell className={cn('font-mono', v.archivedAt && 'line-through')}>
                              {v.sku}
                            </TableCell>
                            <TableCell>
                              {v.attributes.map((a) => `${a.attributeName}: ${a.value}`).join(', ') ||
                                'Mặc định'}
                            </TableCell>
                            <TableCell>
                              <Badge variant={v.archivedAt ? 'secondary' : 'success'}>
                                {v.archivedAt ? 'Ngừng bán' : 'Đang bán'}
                              </Badge>
                            </TableCell>
                            {!readOnly && (
                              <TableCell className="text-right">
                                {!v.archivedAt && (
                                  <RowAction
                                    label={`Ngừng bán ${v.sku}`}
                                    destructive
                                    reason={
                                      activeVariants === 1
                                        ? 'Sản phẩm cần ít nhất một biến thể đang bán'
                                        : null
                                    }
                                    onClick={() => setStopping(v)}
                                  >
                                    <Ban />
                                  </RowAction>
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {variantsError && <AlertMessage severity="error">{variantsError}</AlertMessage>}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {product && (
          <AddVariantDialog
            open={addOpen}
            product={product}
            category={categories.find((c) => c.id === product.category.id)}
            attributes={attributes}
            onClose={() => setAddOpen(false)}
            onDone={(message) => {
              setAddOpen(false);
              toast.success(message);
            }}
          />
        )}

        <ConfirmDialog
          open={Boolean(stopping)}
          title="Ngừng bán biến thể?"
          message={
            <>
              Biến thể <strong>{stopping?.sku}</strong> sẽ ngừng bán. SKU được giữ lại; thêm lại đúng
              tổ hợp này sẽ bán lại với SKU cũ.
            </>
          }
          confirmLabel="Ngừng bán"
          destructive
          loading={archiveVariantMut.isPending}
          onConfirm={stopVariant}
          onClose={() => setStopping(null)}
        />
      </form>
    </Form>
  );
}
