// Dựng dữ liệu cho cypress/e2e/p5-be/doi-soat.cy.ts trên database E2E. Gian hàng (#19) và đơn sàn (#21) chưa có luồng thật
// nên ghi thẳng bảng như test/integration/finance/settlement-helpers.ts của BE; bảng kê đi qua POST /finance/settlements/dev/import.
// Cần API BE chạy ở cổng 3000 với cùng DATABASE_URL. Chạy từ thư mục BE, mỗi lần chạy spec một lần:
//   DATABASE_URL=.../commerio_e2e node --env-file=.env <FE>/cypress/be-seed/doi-soat.mts <FE>/cypress/fixtures/fe13-be.json
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BE = process.cwd();
const imp = (p: string) => import(pathToFileURL(path.join(BE, p)).href);
const { Decimal } = await imp('node_modules/decimal.js/decimal.mjs');
const pg = (await imp('node_modules/pg/esm/index.mjs')).default;
const { withCompany, closeDb } = await imp('src/shared/db/client.ts');
const { categories, products, productVariants } = await imp('src/modules/product/catalog/repository/schema.ts');
const { orders, orderLines } = await imp('src/modules/order/sales/repository/schema.ts');
const { hashPassword } = await imp('src/modules/core/identity/service/passwords.ts');
const fin = await imp('src/modules/finance/index.ts');
const { recompute } = await imp('src/modules/insight/report/service/recompute.ts');

const API = 'http://localhost:3000/api/v1';
const RUN = Date.now().toString().slice(-7);
const PASSWORD = 'matkhau123';
const email = `ceo.ds.${RUN}@commerio.test`;
const analyst = `phantich.ds.${RUN}@commerio.test`;
// Role chủ bảng: tài khoản, thành viên (API mời nhân viên chưa có), gian hàng, mã đơn sàn
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

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
const signIn = async (mail: string, companyId: string) => {
  const login = await http('POST', '/identity/login', undefined, { email: mail, password: PASSWORD });
  return (await http('POST', '/identity/select-company', login.accessToken, { companyId })).accessToken as string;
};

const { companyId } = await http('POST', '/identity/register', undefined, {
  company: { name: `Công ty Đối soát ${RUN}`, taxCode: `06${RUN}1` },
  ceo: { fullName: 'Chủ Shop Thử', email, password: PASSWORD },
  optionalModules: ['channel', 'report'],
});
const token = await signIn(email, companyId);

// Vai trò Phân tích: xem báo cáo, xem chứng từ; không có giá vốn, không xuất tệp
const role = await http('POST', '/identity/roles', token, {
  name: `Phân tích ${RUN}`,
  permissions: ['report.dashboard.view', 'finance.invoice.view'],
});
const account = await db.query('insert into core.accounts (email, full_name, password_hash) values ($1, $2, $3) returning id', [
  analyst,
  'Phân Tích Thử',
  await hashPassword(PASSWORD),
]);
const membership = await db.query('insert into core.memberships (company_id, account_id) values ($1, $2) returning id', [
  companyId,
  account.rows[0].id,
]);
await db.query('insert into core.member_roles (membership_id, role_id, company_id) values ($1, $2, $3)', [
  membership.rows[0].id,
  role.id,
  companyId,
]);

const shopName = `Shop TikTok ${RUN}`;
const shop = await db.query(
  `insert into channel.shops (company_id, platform, external_shop_id, shop_name) values ($1, 'tiktok', $2, $3) returning id`,
  [companyId, `SHOP-${RUN}`, shopName],
);
const shopId: string = shop.rows[0].id;

const variantId: string = await withCompany(companyId, async (tx: any) => {
  const [c] = await tx.insert(categories).values({ companyId, name: `Danh mục ${RUN}`, skuPattern: 'DS-{SEQ}' }).returning({ id: categories.id });
  const [p] = await tx.insert(products).values({ companyId, categoryId: c.id, name: `Áo khoác ${RUN}` }).returning({ id: products.id });
  const [v] = await tx.insert(productVariants).values({ companyId, productId: p.id, sku: `DS-${RUN}` }).returning({ id: productVariants.id });
  return v.id;
});

/** Đơn sàn của gian hàng, đã lập hoá đơn hôm nay */
async function order(total: number) {
  const code = `DH-${randomUUID().slice(0, 8).toUpperCase()}`;
  const externalOrderId = `SO-${RUN}-${randomUUID().slice(0, 4)}`;
  const amount = new Decimal(total).toFixed(2);
  const orderId: string = await withCompany(companyId, async (tx: any) => {
    const [o] = await tx
      .insert(orders)
      .values({ companyId, code, source: 'marketplace', paymentMethod: null, shopId, externalOrderId, subtotal: amount, total: amount })
      .returning({ id: orders.id });
    await tx.insert(orderLines).values({
      companyId, orderId: o.id, variantId, sku: `DS-${RUN}`, productName: `Áo khoác ${RUN}`, quantity: 1, unitPrice: amount, lineTotal: amount,
    });
    return o.id;
  });
  await withCompany(companyId, () => fin.issueInvoiceForOrder(orderId));
  return { orderId, code, externalOrderId, total };
}

const matched = await order(100000);
const refunded = await order(200000);
const mismatch = await order(150000);
const processing = await order(80000);
const unsettled = await order(120000);

/** Giao dịch đơn khuôn OAS 202501 như settlement-helpers của BE: phí 17.000, vận chuyển 15.000, tiền về = doanh thu − 32.000 */
const orderTx = (externalOrderId: string, revenue: number, over: object = {}) => ({
  id: `TX-${RUN}-${randomUUID().slice(0, 6)}`,
  type: 'ORDER',
  order_id: externalOrderId,
  revenue_amount: String(revenue),
  shipping_cost_amount: '-15000',
  fee_tax_amount: '-17000',
  fee_tax_breakdown: { fee: { platform_commission_amount: '-10000', transaction_fee_amount: '-6000' }, tax: { pit_amount: '-1000' } },
  adjustment_amount: '0',
  settlement_amount: String(revenue - 32000),
  ...over,
});

const txs = {
  matched: orderTx(matched.externalOrderId, 100000),
  notFound: orderTx(`SO-${RUN}-khongco`, 50000),
  refunded: orderTx(refunded.externalOrderId, 150000, { revenue_breakdown: { refund_subtotal_before_discount_amount: '-50000' } }),
  // Sàn ghi doanh thu 140.000 cho đơn 150.000
  mismatch: orderTx(mismatch.externalOrderId, 140000),
  processing: orderTx(processing.externalOrderId, 80000),
};
const now = Math.floor(Date.now() / 1000);
const paidStatement = { id: `ST-${RUN}-1`, statement_time: now - 3600, settlement_amount: '372000', payment_status: 'PAID' };
const processingStatement = { id: `ST-${RUN}-2`, statement_time: now - 600, settlement_amount: '48000', payment_status: 'PROCESSING' };
const paid = await http('POST', '/finance/settlements/dev/import', token, {
  shopId,
  statement: paidStatement,
  transactions: [txs.matched, txs.notFound, txs.refunded, txs.mismatch],
});
const proc = await http('POST', '/finance/settlements/dev/import', token, {
  shopId,
  statement: processingStatement,
  transactions: [txs.processing],
});

// Worker có thể chưa chạy: dựng số báo cáo hôm nay ngay
const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
await recompute(companyId, today, today);

const out = {
  run: RUN, email, analyst, password: PASSWORD, companyId, shopId, shopName, today,
  orders: { matched, refunded, mismatch, processing, unsettled },
  tx: Object.fromEntries(Object.entries(txs).map(([k, t]) => [k, t.id])),
  statements: {
    paid: { id: paid.id, code: paidStatement.id },
    processing: { id: proc.id, code: processingStatement.id },
  },
};
writeFileSync(process.argv[2]!, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out));
await db.end();
await closeDb();
