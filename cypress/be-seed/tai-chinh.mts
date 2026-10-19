// Dựng dữ liệu cho cypress/e2e/p4-be/tai-chinh.cy.ts trên database E2E. BE chưa có API tạo đơn (#24, #25) nên đơn ghi thẳng
// bảng sales và trạng thái thanh toán đổi bằng hàm biên của payment/finance, giống test/integration/finance của BE.
// Cần API BE chạy ở cổng 3000 với cùng DATABASE_URL và PAYMENT_CREDENTIALS_KEY. Chạy từ thư mục BE, mỗi lần chạy spec một lần:
//   DATABASE_URL=.../commerio_e2e PAYMENT_CREDENTIALS_KEY=... node --env-file=.env <FE>/cypress/be-seed/tai-chinh.mts <FE>/cypress/fixtures/fe12-be.json
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BE = process.cwd();
const imp = (p: string) => import(pathToFileURL(path.join(BE, p)).href);
const { Decimal } = await imp('node_modules/decimal.js/decimal.mjs');
const { eq, inArray } = await imp('node_modules/drizzle-orm/index.js');
const { withCompany, closeDb } = await imp('src/shared/db/client.ts');
const { categories, products, productVariants } = await imp('src/modules/catalog/repository/schema.ts');
const { orders, orderLines } = await imp('src/modules/sales/repository/schema.ts');
const pay = await imp('src/modules/payment/index.ts');
const fin = await imp('src/modules/finance/index.ts');

const API = 'http://localhost:3000/api/v1';
const RUN = Date.now().toString().slice(-7);
const PASSWORD = 'matkhau123';
const email = `ketoan.${RUN}@commerio.test`;

async function http(method: string, url: string, token?: string, body?: object) {
  const res = await fetch(API + url, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}

const { companyId } = await http('POST', '/identity/register', undefined, {
  company: { name: `Công ty Tài chính ${RUN}`, taxCode: `05${RUN}1` },
  ceo: { fullName: 'Kế Toán Thử', email, password: PASSWORD },
  optionalModules: [],
});
const login = await http('POST', '/identity/login', undefined, { email, password: PASSWORD });
const { accessToken: token } = await http('POST', '/identity/select-company', login.accessToken, { companyId }).catch(
  async () => http('POST', '/identity/select-company', undefined, { companyId }),
);
await http('PUT', '/payment/gateways/vietqr', token, {
  credentials: { bankBin: '970422', accountNo: '0123456789', accountName: 'CONG TY THU', sepayApiKey: `SEPAY-${RUN}` },
  version: 0,
});

const variantId: string = await withCompany(companyId, async (tx: any) => {
  const [c] = await tx.insert(categories).values({ companyId, name: `Danh mục ${RUN}`, skuPattern: 'E2E-{SEQ}' }).returning({ id: categories.id });
  const [p] = await tx.insert(products).values({ companyId, categoryId: c.id, name: `Áo thun E2E ${RUN}` }).returning({ id: products.id });
  const [v] = await tx.insert(productVariants).values({ companyId, productId: p.id, sku: `E2E-${RUN}` }).returning({ id: productVariants.id });
  return v.id;
});

async function order(unitPrice: number, paymentMethod: 'prepaid' | 'cod' = 'prepaid') {
  const code = `DH-${randomUUID().slice(0, 8).toUpperCase()}`;
  const total = new Decimal(unitPrice).toFixed(2);
  return withCompany(companyId, async (tx: any) => {
    const [v] = await tx
      .select({ sku: productVariants.sku, name: products.name })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(inArray(productVariants.id, [variantId]));
    const [o] = await tx
      .insert(orders)
      .values({ companyId, code, source: 'manual', paymentMethod, subtotal: total, total })
      .returning({ id: orders.id });
    await tx.insert(orderLines).values({
      companyId, orderId: o.id, variantId, sku: v.sku, productName: v.name, quantity: 1, unitPrice: total, lineTotal: total,
    });
    return { orderId: o.id as string, code, amount: unitPrice };
  });
}
const inCompany = (fn: () => Promise<unknown>) => withCompany(companyId, fn);
const link = (orderId: string) =>
  http('POST', `/payment/orders/${orderId}/links`, token, { gateway: 'vietqr' }) as Promise<{ id: string; paymentCode: string }>;

// COD: hai đơn đã giao chờ thu, một đơn huỷ trước khi giao (không thu)
const cod1 = await order(200000, 'cod');
const cod2 = await order(350000, 'cod');
const cod3 = await order(120000, 'cod');
await inCompany(async () => {
  for (const o of [cod1, cod2, cod3]) await pay.initOrderPayment(o.orderId, 'cod');
  await pay.markDelivered(cod1.orderId, new Date());
  await pay.markDelivered(cod2.orderId, new Date());
  await pay.markCodNotCollected(cod3.orderId);
});

// Đã thu qua cổng (mô phỏng qua HTTP), rồi huỷ đơn: chờ hoàn
const refundOrders = [];
for (const price of [180000, 260000]) {
  const o = await order(price);
  await inCompany(() => pay.initOrderPayment(o.orderId, 'prepaid'));
  const l = await link(o.orderId);
  await http('POST', `/payment/dev/simulate/${l.paymentCode}`, token);
  await withCompany(companyId, (tx: any) => tx.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, o.orderId)));
  await inCompany(() => pay.markRefundPending(o.orderId));
  refundOrders.push(o);
}

// Một đơn đã thu, có hoá đơn
const paid = await order(99000);
await inCompany(() => pay.initOrderPayment(paid.orderId, 'prepaid'));
await http('POST', `/payment/dev/simulate/${(await link(paid.orderId)).paymentCode}`, token);
const invoice = await inCompany(() => fin.issueInvoiceForOrder(paid.orderId));

// Khoản thu chưa khớp: lệch tiền (149.000 cho đơn 150.000), không mã 90.000 (gán vào đơn 90.000), không mã 50.000 (hoàn lại)
const verified = (over: object) => {
  const key = `T${Date.now()}${Math.random().toString().slice(2, 8)}`;
  return {
    companyId, gateway: 'vietqr', source: 'sepay', eventKey: key, gatewayTxnId: key, succeeded: true, fee: null,
    occurredAt: new Date(), paymentCode: null, paymentLinkId: null, orderId: null, ...over,
  };
};
const mismatch = await order(150000);
await inCompany(() => pay.initOrderPayment(mismatch.orderId, 'prepaid'));
const ml = await link(mismatch.orderId);
const assignTarget = await order(90000);
await inCompany(() => pay.initOrderPayment(assignTarget.orderId, 'prepaid'));
await inCompany(async () => {
  await fin.handleVerifiedPayment(
    verified({ paymentCode: ml.paymentCode, paymentLinkId: ml.id, orderId: mismatch.orderId, amount: new Decimal(149000), rawPayload: { content: `chuyen tien ${ml.paymentCode}` } }),
  );
  await fin.handleVerifiedPayment(verified({ amount: new Decimal(90000), rawPayload: { content: `CK GAN ${RUN}` } }));
  await fin.handleVerifiedPayment(verified({ amount: new Decimal(50000), rawPayload: { content: `CK HOAN ${RUN}` } }));
});

const out = {
  run: RUN, email, password: PASSWORD, companyId,
  cod: [cod1, cod2], codNotCollected: cod3, refund: refundOrders, paid, invoice: { id: invoice.invoiceId, number: invoice.number },
  mismatch, assignTarget,
};
writeFileSync(process.argv[2]!, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out));
await closeDb();
