import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import BlockIcon from '@mui/icons-material/Block';
import { PageHeader } from '@/components/common/PageHeader';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import {
  useArchiveVariant,
  useAttributes,
  useCategories,
  useCreateProduct,
  useProduct,
  useUpdateProduct,
} from '@/api/catalog.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { conflictCurrent } from '@/features/identity/shared';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import type { ProductDetail, ProductVariant } from '@/types/catalog';
import { ProductImagesField, type ImageItem } from './ProductImagesField';
import { VariantBuilder, emptyPlan, planCombos, planError, type VariantPlan } from './VariantBuilder';
import { AddVariantDialog } from './AddVariantDialog';
import { comboKey, productSchema, type ProductForm, type Toast } from './shared';

const toImages = (p: ProductDetail): ImageItem[] =>
  [...p.images].sort((a, b) => a.position - b.position).map((i) => ({ fileId: i.fileId, url: i.url }));

/** UC-CP-02: tạo sản phẩm kèm tổ hợp biến thể; sửa thông tin, ảnh và biến thể */
export function ProductFormPage() {
  const { productId } = useParams<{ productId: string }>();
  const isNew = !productId;
  const navigate = useNavigate();
  const location = useLocation();
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
  const [imagesError, setImagesError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [plan, setPlan] = useState<VariantPlan>(emptyPlan);
  const [variantsError, setVariantsError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [stopping, setStopping] = useState<ProductVariant | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  // Thông báo "Đã tạo" chuyển từ trang tạo mới; xoá khỏi history để tải lại trang không hiện lại
  useEffect(() => {
    const passed = (location.state as { toast?: Toast } | null)?.toast;
    if (passed) {
      setToast(passed);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location, navigate]);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors },
  } = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: '', categoryId: '', description: '' },
  });

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

  /** Lỗi 422 của BE về đúng ô */
  const applyFieldErrors = (e: unknown) => {
    const fieldErrors = getProblem(e)?.errors;
    if (!fieldErrors) return false;
    (['name', 'categoryId', 'description'] as const).forEach((f) => {
      if (fieldErrors[f]) setFieldError(f, { message: fieldErrors[f] });
    });
    setImagesError(fieldErrors.images ?? null);
    setVariantsError(fieldErrors.variants ?? null);
    return true;
  };

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    setImagesError(null);
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
        navigate(ROUTES.company.catalogProduct(companyId, created.id), {
          replace: true,
          state: {
            toast: {
              severity: 'success',
              msg: `Đã tạo ${created.name} với ${created.variants.length} biến thể`,
            } satisfies Toast,
          },
        });
      } else {
        const saved = await updateMut.mutateAsync({
          id: productId,
          name: values.name,
          description: values.description,
          imageFileIds,
          version,
        });
        load(saved);
        setToast({ severity: 'success', msg: `Đã lưu ${saved.name}` });
      }
    } catch (e) {
      const latest = conflictCurrent<ProductDetail>(e);
      if (getProblem(e)?.code === 'version_conflict' && latest) {
        load(latest);
        setError('Sản phẩm vừa được người khác sửa. Form đã hiện bản mới nhất, chưa có gì thay đổi.');
        return;
      }
      if (!applyFieldErrors(e)) setError(getErrorMessage(e));
    }
  });

  const stopVariant = async () => {
    if (!stopping || !productId) return;
    try {
      await archiveVariantMut.mutateAsync({ productId, variantId: stopping.id });
      setToast({ severity: 'success', msg: `Đã ngừng bán ${stopping.sku}` });
    } catch (e) {
      setToast({ severity: 'warning', msg: getErrorMessage(e) });
    }
    setStopping(null);
  };

  const activeVariants = useMemo(
    () => product?.variants.filter((v) => !v.archivedAt).length ?? 0,
    [product],
  );

  if (!isNew && productQuery.isLoading) {
    return (
      <Stack alignItems="center" sx={{ py: 8 }}>
        <CircularProgress />
      </Stack>
    );
  }
  if (!isNew && productQuery.isError) {
    return (
      <Box>
        <Button startIcon={<ArrowBackIcon />} onClick={backToList} sx={{ mb: 2 }}>
          Danh sách sản phẩm
        </Button>
        <Alert severity="error">{getErrorMessage(productQuery.error)}</Alert>
      </Box>
    );
  }

  const busy = createMut.isPending || updateMut.isPending;
  const title = isNew ? 'Thêm sản phẩm' : readOnly ? (product?.name ?? '') : 'Sửa sản phẩm';

  return (
    <Box component="form" onSubmit={onSubmit} noValidate>
      <Button startIcon={<ArrowBackIcon />} onClick={backToList} sx={{ mb: 1 }}>
        Danh sách sản phẩm
      </Button>
      <PageHeader
        title={title}
        subtitle={product ? `Cập nhật lần cuối ${formatDateTime(product.updatedAt)}` : undefined}
        action={
          readOnly ? null : (
            <Button type="submit" variant="contained" disabled={busy || uploading}>
              {busy ? 'Đang lưu...' : uploading ? 'Đang tải ảnh...' : isNew ? 'Tạo sản phẩm' : 'Lưu'}
            </Button>
          )
        }
      />

      {archived && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Sản phẩm đã xoá nên chỉ xem được. SKU của sản phẩm không cấp lại cho sản phẩm khác.
        </Alert>
      )}
      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Stack spacing={2}>
        <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', p: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
            Thông tin chung
          </Typography>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' } }}>
            <TextField
              label="Tên sản phẩm"
              fullWidth
              autoFocus={isNew}
              InputProps={{ readOnly }}
              {...register('name')}
              error={Boolean(errors.name)}
              helperText={errors.name?.message}
            />
            <Controller
              control={control}
              name="categoryId"
              render={({ field }) => (
                <TextField
                  select
                  label="Danh mục"
                  fullWidth
                  {...field}
                  disabled={!isNew}
                  InputProps={{ readOnly }}
                  error={Boolean(errors.categoryId)}
                  helperText={
                    errors.categoryId?.message ??
                    (isNew
                      ? 'SKU sinh theo quy tắc của danh mục'
                      : 'Không đổi được vì SKU đã sinh theo danh mục này')
                  }
                >
                  {categories.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                  {/* Danh mục cũ có thể chưa nạp xong */}
                  {product && !categories.some((c) => c.id === product.category.id) && (
                    <MenuItem value={product.category.id}>{product.category.name}</MenuItem>
                  )}
                </TextField>
              )}
            />
            <TextField
              label="Mô tả"
              fullWidth
              multiline
              minRows={3}
              InputProps={{ readOnly }}
              {...register('description')}
              error={Boolean(errors.description)}
              helperText={errors.description?.message}
              sx={{ gridColumn: { md: '1 / -1' } }}
            />
          </Box>
        </Paper>

        <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', p: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
            Ảnh sản phẩm
          </Typography>
          {readOnly && !images.length ? (
            <Typography variant="body2" color="text.secondary">
              Chưa có ảnh.
            </Typography>
          ) : (
            <ProductImagesField
              value={images}
              onChange={setImages}
              onBusyChange={setUploading}
              disabled={readOnly}
            />
          )}
          {imagesError && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {imagesError}
            </Alert>
          )}
        </Paper>

        <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', p: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Biến thể
            </Typography>
            {!isNew && !readOnly && (
              <Button size="small" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
                Thêm biến thể
              </Button>
            )}
          </Stack>

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
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>SKU</TableCell>
                  <TableCell>Thuộc tính</TableCell>
                  <TableCell>Trạng thái</TableCell>
                  {!readOnly && <TableCell align="right" />}
                </TableRow>
              </TableHead>
              <TableBody>
                {product?.variants.map((v) => (
                  <TableRow key={v.id} sx={{ opacity: v.archivedAt ? 0.6 : 1 }}>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{v.sku}</TableCell>
                    <TableCell>
                      {v.attributes.map((a) => `${a.attributeName}: ${a.value}`).join(', ') || 'Mặc định'}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={v.archivedAt ? 'Ngừng bán' : 'Đang bán'}
                        color={v.archivedAt ? 'default' : 'success'}
                      />
                    </TableCell>
                    {!readOnly && (
                      <TableCell align="right">
                        {!v.archivedAt && (
                          <Tooltip
                            title={activeVariants === 1 ? 'Sản phẩm cần ít nhất một biến thể đang bán' : 'Ngừng bán'}
                          >
                            <span>
                              <IconButton
                                size="small"
                                color="error"
                                disabled={activeVariants === 1}
                                onClick={() => setStopping(v)}
                              >
                                <BlockIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>
      </Stack>

      {product && (
        <AddVariantDialog
          open={addOpen}
          product={product}
          category={categories.find((c) => c.id === product.category.id)}
          attributes={attributes}
          onClose={() => setAddOpen(false)}
          onDone={(msg) => {
            setAddOpen(false);
            setToast({ severity: 'success', msg });
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(stopping)}
        title="Ngừng bán biến thể?"
        message={
          <>
            Biến thể <strong>{stopping?.sku}</strong> sẽ ngừng bán. SKU được giữ lại; thêm lại đúng tổ
            hợp này sẽ bán lại với SKU cũ.
          </>
        }
        confirmLabel="Ngừng bán"
        destructive
        loading={archiveVariantMut.isPending}
        onConfirm={stopVariant}
        onClose={() => setStopping(null)}
      />

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} variant="filled">
            {toast.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
