import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Controller, useFieldArray, useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowLeft, Trash2, TriangleAlert, UserPlus, X } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { RowAction } from '@/components/common/RowAction';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useCreateOrder, useCustomer, useCustomers, useOrderVariants } from '@/api/sales.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import { ROUTES } from '@/router/routes';
import { formatCurrency } from '@/utils/format';
import { cn } from '@/lib/utils';
import type { CreateOrderInput, CustomerSummary, OrderVariantOption } from '@/types/sales';
import {
  MAX_LINE_QTY,
  PAYMENT_METHOD_LABELS,
  PHONE_RE,
  orderFormSchema,
  parseIntOr0,
  phoneSchema,
  type OrderFormInput,
  type OrderFormOutput,
} from './shared';
import { SearchCombobox } from './SearchCombobox';

const EMPTY: OrderFormInput = {
  customerMode: 'existing',
  customerId: '',
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  customerAddress: '',
  recipientName: '',
  recipientPhone: '',
  address: '',
  shippingFee: '0',
  paymentMethod: '',
  note: '',
  lines: [],
};

/** Đường dẫn lỗi 422 của BE → ô trên form */
const FIELD_OF: Record<string, keyof OrderFormInput> = {
  customer: 'customerId',
  'customer.id': 'customerId',
  'customer.name': 'customerName',
  'customer.phone': 'customerPhone',
  'customer.email': 'customerEmail',
  'customer.address': 'customerAddress',
  'shippingAddress.name': 'recipientName',
  'shippingAddress.phone': 'recipientPhone',
  'shippingAddress.address': 'address',
  shippingFee: 'shippingFee',
  paymentMethod: 'paymentMethod',
  note: 'note',
};

function toInput(v: OrderFormOutput): CreateOrderInput {
  return {
    customer:
      v.customerMode === 'existing'
        ? { id: v.customerId }
        : {
            name: v.customerName,
            phone: v.customerPhone,
            ...(v.customerEmail ? { email: v.customerEmail } : {}),
            ...(v.customerAddress ? { address: v.customerAddress } : {}),
          },
    shippingAddress: { name: v.recipientName, phone: v.recipientPhone, address: v.address },
    lines: v.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
    shippingFee: v.shippingFee,
    paymentMethod: v.paymentMethod,
    ...(v.note ? { note: v.note } : {}),
  };
}

function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {(error || hint) && (
        <p className={error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{error ?? hint}</p>
      )}
    </div>
  );
}

/** UC-SF-01 — Sale tạo đơn tay: chọn hoặc nhập khách, thêm sản phẩm, giao hàng, thanh toán */
export function OrderCreatePage() {
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const createMut = useCreateOrder();

  const {
    control,
    register,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    getFieldState,
    getValues,
    formState: { errors },
  } = useForm<OrderFormInput, unknown, OrderFormOutput>({
    // Dòng trên form giữ thêm sku, giá để hiển thị; schema chỉ kiểm các ô nhập nên phải ép kiểu
    resolver: zodResolver(orderFormSchema) as unknown as Resolver<OrderFormInput, unknown, OrderFormOutput>,
    defaultValues: EMPTY,
  });
  const { fields, append, remove, update } = useFieldArray({ control, name: 'lines', keyName: 'key' });
  const [mode, customerId, customerName, customerPhone, lines, shippingFee] = useWatch({
    control,
    name: ['customerMode', 'customerId', 'customerName', 'customerPhone', 'lines', 'shippingFee'],
  });

  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<OrderFormOutput | null>(null);

  // ---------- Khách ----------
  const [customerInput, setCustomerInput] = useState('');
  const customerSearch = useDebounce(customerInput.trim());
  const customerOptions = useCustomers(
    { page: 1, pageSize: 10, search: customerSearch || undefined },
    { enabled: mode === 'existing' && !customerId },
  );
  const picked = useCustomer(mode === 'existing' ? customerId : '');
  /** Khách đã điền sẵn người nhận, để không điền đè khi người dùng đã sửa */
  const filledFor = useRef<string | null>(null);
  useEffect(() => {
    const c = picked.data;
    if (!c || filledFor.current === c.id) return;
    filledFor.current = c.id;
    setValue('recipientName', c.name, { shouldValidate: false });
    setValue('recipientPhone', c.phone);
    setValue('address', c.address);
  }, [picked.data, setValue]);

  // Khách mới: người nhận theo tên, số điện thoại của khách cho tới khi người dùng sửa ô người nhận
  useEffect(() => {
    if (mode !== 'new') return;
    if (!getFieldState('recipientName').isDirty) setValue('recipientName', customerName);
    if (!getFieldState('recipientPhone').isDirty) setValue('recipientPhone', customerPhone);
  }, [mode, customerName, customerPhone, getFieldState, setValue]);

  // Số điện thoại của khách mới trùng khách đã có (AC-T2)
  const phone = customerPhone.trim();
  const dupQuery = useCustomers({ page: 1, pageSize: 5, search: phone }, { enabled: mode === 'new' && PHONE_RE.test(phone) });
  const duplicate = mode === 'new' && PHONE_RE.test(phone) ? dupQuery.data?.items.find((c) => c.phone === phone) : undefined;

  const chooseCustomer = (c: Pick<CustomerSummary, 'id'>) => {
    setValue('customerMode', 'existing');
    setValue('customerId', c.id, { shouldDirty: true });
    clearErrors('customerId');
    setCustomerInput('');
  };
  const clearCustomer = () => {
    setValue('customerId', '');
    filledFor.current = null;
  };

  // ---------- Sản phẩm ----------
  const [variantInput, setVariantInput] = useState('');
  const variantSearch = useDebounce(variantInput.trim());
  const variants = useOrderVariants(variantSearch);

  const addVariant = (v: OrderVariantOption) => {
    if (v.price === null) return;
    const index = lines.findIndex((l) => l.variantId === v.variantId);
    // Chọn lại biến thể đã có thì tăng số lượng dòng đó (AC-T3)
    if (index >= 0) {
      const current = lines[index];
      update(index, { ...current, quantity: String(Math.min(MAX_LINE_QTY, parseIntOr0(current.quantity) + 1)) });
    } else {
      append({
        variantId: v.variantId,
        sku: v.sku,
        productName: v.productName,
        attributesLabel: v.attributesLabel,
        price: v.price,
        available: v.available,
        quantity: '1',
      });
      clearErrors('lines');
    }
    setVariantInput('');
  };

  const subtotal = lines.reduce((sum, l) => sum + l.price * parseIntOr0(l.quantity), 0);
  const fee = parseIntOr0(shippingFee);
  const shortLines = useMemo(() => lines.filter((l) => parseIntOr0(l.quantity) > l.available), [lines]);

  // ---------- Gửi ----------
  const submit = async (values: OrderFormOutput) => {
    setPending(null);
    setNotice(null);
    try {
      const order = await createMut.mutateAsync(toInput(values));
      toast.success(`Đã tạo đơn ${order.code}`);
      navigate(ROUTES.company.order(companyId, order.id));
    } catch (e) {
      const problem = getProblem(e);
      if (problem?.status === 404) {
        // Khách đã chọn không còn (AC-T5)
        clearCustomer();
        setError('customerId', { message: 'Không tìm thấy khách hàng. Chọn khách khác.' });
        setNotice('Không tìm thấy khách hàng');
        return;
      }
      let placed = 0;
      for (const [path, message] of Object.entries(problem?.errors ?? {})) {
        const m = /^lines\.(\d+)\.(variantId|quantity)$/.exec(path);
        if (m) {
          setError(`lines.${Number(m[1])}.${m[2] as 'quantity'}`, { message });
          placed++;
        } else if (path === 'lines') {
          setError('lines', { message });
          placed++;
        } else if (FIELD_OF[path]) {
          setError(FIELD_OF[path], { message });
          placed++;
        }
      }
      setNotice(placed ? 'Dữ liệu không hợp lệ. Xem các ô báo đỏ.' : problemMessage(e));
    }
  };

  // Có dòng vượt tồn khả dụng thì hỏi lại trước khi tạo (AC-T4)
  const onSubmit = handleSubmit(
    (values) => {
      if (shortLines.length > 0) setPending(values);
      else submit(values);
    },
    // Zod bỏ qua superRefine khi ô khác đã lỗi, nên tự báo ô khách để người dùng thấy đủ lỗi một lần
    () => {
      const v = getValues();
      if (v.customerMode === 'existing' && !v.customerId) {
        setError('customerId', { message: 'Chọn khách hàng hoặc tạo khách mới' });
      }
      if (v.customerMode === 'new' && !v.customerName.trim()) setError('customerName', { message: 'Nhập tên khách' });
      const phone = phoneSchema.safeParse(v.customerPhone);
      if (v.customerMode === 'new' && !phone.success) setError('customerPhone', { message: phone.error.issues[0].message });
    },
  );

  const busy = createMut.isPending;
  const linesError = errors.lines?.root?.message ?? errors.lines?.message;

  return (
    <form onSubmit={onSubmit} noValidate>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mb-2 -ms-2"
        onClick={() => navigate(ROUTES.company.orders(companyId))}
      >
        <ArrowLeft />
        Đơn hàng
      </Button>
      <PageHeader title="Tạo đơn" subtitle="Giá lấy theo bảng giá chuẩn lúc tạo đơn. Đơn mới ở trạng thái Chờ xác nhận." />
      {notice && (
        <AlertMessage severity="error" className="mb-4" onClose={() => setNotice(null)}>
          {notice}
        </AlertMessage>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="grid gap-4 lg:col-span-2">
          {/* Khách hàng */}
          <Card className="py-4">
            <CardHeader>
              <CardTitle className="text-base">Khách hàng</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Controller
                control={control}
                name="customerMode"
                render={({ field }) => (
                  <RadioGroup
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);
                      clearErrors(['customerId', 'customerName', 'customerPhone']);
                    }}
                    className="flex gap-6"
                    aria-label="Khách hàng"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem id="customer-existing" value="existing" />
                      <Label htmlFor="customer-existing">Khách có sẵn</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem id="customer-new" value="new" />
                      <Label htmlFor="customer-new">Khách mới</Label>
                    </div>
                  </RadioGroup>
                )}
              />

              {mode === 'existing' &&
                (customerId ? (
                  <div className="flex items-start justify-between gap-4 rounded-md border p-3" data-testid="picked-customer">
                    <div className="text-sm">
                      <p className="font-medium">{picked.data?.name ?? '...'}</p>
                      <p className="text-muted-foreground">
                        {picked.data?.phone}
                        {picked.data?.email && ` · ${picked.data.email}`}
                      </p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={clearCustomer}>
                      <X />
                      Đổi khách
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-1.5">
                    <SearchCombobox<CustomerSummary>
                      id="customer-picker"
                      label="Tìm khách"
                      placeholder="Gõ tên hoặc số điện thoại"
                      input={customerInput}
                      onInputChange={setCustomerInput}
                      options={customerOptions.data?.items ?? []}
                      fetching={customerOptions.isFetching}
                      emptyText={customerSearch ? 'Không tìm thấy khách' : 'Gõ tên hoặc số điện thoại'}
                      getKey={(c) => c.id}
                      renderOption={(c) => (
                        <>
                          <span className="font-medium">{c.name}</span>
                          <span className="text-xs whitespace-nowrap text-muted-foreground">{c.phone}</span>
                        </>
                      )}
                      onPick={chooseCustomer}
                      invalid={Boolean(errors.customerId)}
                    />
                    {errors.customerId && <p className="text-sm text-destructive">{errors.customerId.message}</p>}
                  </div>
                ))}

              {mode === 'new' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Tên khách" htmlFor="customer-name" error={errors.customerName?.message}>
                    <Input id="customer-name" aria-invalid={Boolean(errors.customerName)} {...register('customerName')} />
                  </Field>
                  <Field label="Số điện thoại" htmlFor="customer-phone" error={errors.customerPhone?.message}>
                    <Input
                      id="customer-phone"
                      inputMode="tel"
                      aria-invalid={Boolean(errors.customerPhone)}
                      {...register('customerPhone')}
                    />
                  </Field>
                  <Field label="Email (tuỳ chọn)" htmlFor="customer-email" error={errors.customerEmail?.message}>
                    <Input id="customer-email" type="email" aria-invalid={Boolean(errors.customerEmail)} {...register('customerEmail')} />
                  </Field>
                  <Field label="Địa chỉ (tuỳ chọn)" htmlFor="customer-address" error={errors.customerAddress?.message}>
                    <Input id="customer-address" {...register('customerAddress')} />
                  </Field>
                  {duplicate && (
                    <AlertMessage severity="warning" className="sm:col-span-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          Đã có khách {duplicate.name} với số này.
                        </span>
                        <Button type="button" size="sm" variant="outline" onClick={() => chooseCustomer(duplicate)}>
                          <UserPlus />
                          Dùng khách này
                        </Button>
                      </div>
                    </AlertMessage>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sản phẩm */}
          <Card className="py-4">
            <CardHeader>
              <CardTitle className="text-base">Sản phẩm</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="max-w-lg">
                <SearchCombobox<OrderVariantOption>
                  id="order-variant-picker"
                  label="Thêm sản phẩm"
                  placeholder="Tìm theo tên hoặc SKU"
                  input={variantInput}
                  onInputChange={setVariantInput}
                  options={variants.data ?? []}
                  fetching={variants.isFetching}
                  emptyText={variantSearch ? 'Không tìm thấy sản phẩm' : 'Gõ tên sản phẩm hoặc SKU'}
                  getKey={(v) => v.variantId}
                  disabledReason={(v) => (v.price === null ? 'Chưa có giá' : null)}
                  renderOption={(v) => (
                    <>
                      <div className="min-w-0">
                        <p className="font-medium">{v.sku}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {v.productName}
                          {v.attributesLabel && ` · ${v.attributesLabel}`}
                        </p>
                      </div>
                      <div className="text-end text-xs whitespace-nowrap">
                        <p>{v.price === null ? 'Chưa có giá' : formatCurrency(v.price)}</p>
                        <p className="text-muted-foreground">Khả dụng {v.available.toLocaleString('vi-VN')}</p>
                      </div>
                    </>
                  )}
                  onPick={addVariant}
                  disabled={busy}
                />
              </div>
              {linesError && <AlertMessage severity="error">{linesError}</AlertMessage>}
              <div className="overflow-x-auto rounded-md border">
                <Table data-testid="order-lines">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sản phẩm</TableHead>
                      <TableHead className="w-32 text-right">Đơn giá</TableHead>
                      <TableHead className="w-36 text-right">Số lượng</TableHead>
                      <TableHead className="w-36 text-right">Thành tiền</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!fields.length && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                          Tìm và thêm sản phẩm vào đơn.
                        </TableCell>
                      </TableRow>
                    )}
                    {fields.map((f, i) => {
                      const lineErrors = errors.lines?.[i];
                      const qty = parseIntOr0(lines[i]?.quantity ?? '');
                      const short = qty > f.available;
                      return (
                        <TableRow key={f.key} data-row-id={f.variantId} className="align-top">
                          <TableCell>
                            <p className="font-medium">{f.sku}</p>
                            <p className={cn('text-xs', lineErrors?.variantId ? 'text-destructive' : 'text-muted-foreground')}>
                              {lineErrors?.variantId?.message ??
                                `${f.productName}${f.attributesLabel ? ` · ${f.attributesLabel}` : ''}`}
                            </p>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(f.price)}</TableCell>
                          <TableCell className="text-right">
                            <div className="grid gap-1">
                              <Input
                                {...register(`lines.${i}.quantity`)}
                                aria-label={`Số lượng ${f.sku}`}
                                inputMode="numeric"
                                aria-invalid={Boolean(lineErrors?.quantity)}
                                className="h-8 text-right"
                              />
                              {lineErrors?.quantity ? (
                                <p className="text-xs text-destructive">{lineErrors.quantity.message}</p>
                              ) : (
                                short && (
                                  <p className="flex items-center justify-end gap-1 text-xs text-warning">
                                    <TriangleAlert className="size-3" />
                                    Chỉ còn {f.available.toLocaleString('vi-VN')} khả dụng
                                  </p>
                                )
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(f.price * qty)}</TableCell>
                          <TableCell>
                            <RowAction label="Bỏ dòng" destructive reason={busy ? 'Đang tạo đơn' : null} onClick={() => remove(i)}>
                              <Trash2 />
                            </RowAction>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Giao hàng */}
          <Card className="py-4">
            <CardHeader>
              <CardTitle className="text-base">Giao hàng</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Người nhận" htmlFor="recipient-name" error={errors.recipientName?.message}>
                <Input id="recipient-name" aria-invalid={Boolean(errors.recipientName)} {...register('recipientName')} />
              </Field>
              <Field label="Số điện thoại người nhận" htmlFor="recipient-phone" error={errors.recipientPhone?.message}>
                <Input
                  id="recipient-phone"
                  inputMode="tel"
                  aria-invalid={Boolean(errors.recipientPhone)}
                  {...register('recipientPhone')}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Địa chỉ giao" htmlFor="address" error={errors.address?.message}>
                  <Input id="address" aria-invalid={Boolean(errors.address)} {...register('address')} />
                </Field>
              </div>
              <Field label="Phí giao (đ)" htmlFor="shipping-fee" error={errors.shippingFee?.message}>
                <Input
                  id="shipping-fee"
                  inputMode="numeric"
                  aria-invalid={Boolean(errors.shippingFee)}
                  {...register('shippingFee')}
                />
              </Field>
              <Field label="Ghi chú" htmlFor="order-note" error={errors.note?.message}>
                <Textarea id="order-note" rows={1} {...register('note')} />
              </Field>
            </CardContent>
          </Card>

          {/* Thanh toán */}
          <Card className="py-4">
            <CardHeader>
              <CardTitle className="text-base">Thanh toán</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Controller
                control={control}
                name="paymentMethod"
                render={({ field }) => (
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="flex flex-wrap gap-6"
                    aria-label="Cách thanh toán"
                  >
                    {(['prepaid', 'cod'] as const).map((m) => (
                      <div key={m} className="flex items-center gap-2">
                        <RadioGroupItem id={`pay-${m}`} value={m} aria-invalid={Boolean(errors.paymentMethod)} />
                        <Label htmlFor={`pay-${m}`}>{PAYMENT_METHOD_LABELS[m]}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                )}
              />
              <p className={errors.paymentMethod ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
                {errors.paymentMethod?.message ?? 'Trả trước: tạo mã thanh toán ở chi tiết đơn sau khi tạo.'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tóm tắt tiền */}
        <Card className="py-4 lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle className="text-base">Tóm tắt</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm" data-testid="order-summary">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tạm tính</span>
              <span data-testid="subtotal">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phí giao</span>
              <span>{formatCurrency(fee)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-base font-semibold">
              <span>Tổng</span>
              <span data-testid="total">{formatCurrency(subtotal + fee)}</span>
            </div>
            <Button type="submit" className="mt-2" disabled={busy}>
              {busy ? 'Đang tạo...' : 'Tạo đơn'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={pending !== null}
        title="Tạo đơn khi thiếu hàng?"
        message={
          <>
            Đơn có sản phẩm không đủ hàng, vẫn tạo?
            <ul className="mt-2 list-disc ps-5">
              {shortLines.map((l) => (
                <li key={l.variantId}>
                  {l.sku}: cần {parseIntOr0(l.quantity)}, còn {l.available} khả dụng
                </li>
              ))}
            </ul>
          </>
        }
        confirmLabel="Vẫn tạo"
        loading={busy}
        onConfirm={() => pending && submit(pending)}
        onClose={() => setPending(null)}
      />
    </form>
  );
}
