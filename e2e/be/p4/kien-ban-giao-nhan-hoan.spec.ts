import { type APIRequestContext, type Page, request } from '@playwright/test';
import { expect, test, toast } from '../../fixtures';

// P4 với BE thật (commerio-backend#199 phần d): bàn giao trừ tồn đúng một lần, bàn giao trùng, CEO đảo bàn giao, sàn xác
// nhận lấy hàng, giao thất bại, hoàn về và kho quét nhận hàng hoàn. Đối chiếu: BE `src/modules/order/fulfillment/CLAUDE.md`
// (mục "Trừ tồn khi kiện rời kho", "Giao, thất bại, hoàn", bảng route), Documents/21 §19.2, §15.3.
//
// Chuẩn bị (BE cục bộ trỏ sàn giả lập Lazada, commerio-backend `scripts/lazada-mock/README.md`):
// 1. BE: `npm run infra:up`; `docker compose -f deploy/compose.yaml --profile lazada-mock up -d lazada-wiremock lazada-mock`;
//    chạy api (`npm run dev`) và worker (`npm run dev:worker`) với LAZADA_APP_KEY=mock-app-key,
//    LAZADA_APP_SECRET=mock-app-secret, LAZADA_API_URL=http://127.0.0.1:8090/rest, LAZADA_AUTH_URL=http://127.0.0.1:8090,
//    LAZADA_REDIRECT_URL=http://127.0.0.1:5173/channel/lazada/callback (đặt ở shell: Node không đè biến đã có bằng `.env`).
// 2. `npm run mock:lazada -- load giao-that-bai` (đơn 600000000000001, hai món ATH-TRANG-M, ATH-DEN-L, mỗi món 1 cái).
//    Sàn giả lập chỉ có một đơn cố định: mỗi lần chạy trọn cần công ty mới và nạp lại kịch bản. Seller giả chỉ gắn một
//    công ty: ngắt gian hàng ở công ty của lần trước (đơn cũ phải hoàn tất, việc nền tự hoàn tất chạy lúc worker khởi động
//    rồi mỗi giờ) trước khi nối ở công ty mới, không thì 409 `shop_connected_elsewhere`.
// 3. Công ty mới bật phân hệ `channel` (và `purchasing` nếu muốn giá vốn khác 0): sản phẩm hai biến thể Trắng M, Đen L;
//    nhập hàng (đề nghị nhập → duyệt → đặt → phiếu nhận ghi sổ) 10 mỗi SKU; nối gian hàng Lazada (trang uỷ quyền giả trả
//    `code` ngay); thiết lập: ghép hai SKU sàn với hai biến thể, tồn đầu kỳ "Kiểm kê"; phiếu kiểm kê đầu kỳ đếm 10 mỗi
//    SKU, gửi duyệt, duyệt. Worker kéo đơn còn mở: kiện về Đã giữ hàng, đơn Đang xử lý.
// 4. Chạy `dong-goi-rts-van-don.spec.ts` với E2E_PACKING_EMAIL, E2E_PACKING_PASSWORD, E2E_PACKING_COMPANY_ID,
//    E2E_PACKING_CODE: kiện tới Chờ lấy hàng, WireMock ở `ready_to_ship`. Rồi chạy spec này với cùng biến (thêm
//    E2E_LAZADA_MOCK_ADMIN_URL nếu cổng admin WireMock khác http://127.0.0.1:8091). Chạy chung một lệnh được:
//    `pnpm exec playwright test --project=be e2e/be/p4/dong-goi-rts-van-don.spec.ts e2e/be/p4/kien-ban-giao-nhan-hoan.spec.ts`.
//    Playwright xếp file theo tên, không theo thứ tự trên dòng lệnh: tiền tố `kien-` giữ file này đứng sau `dong-goi-…`.
// Spec tự chuyển bước sàn (`PUT /__admin/scenarios/don/state`) rồi tự kéo đơn (`POST /channel/shops/:id/orders/pull`)
// trước mỗi lần kiểm, nên chịu được việc nền kéo đơn 5 phút chạy xen giữa. Chạy xong kiện ở Đã hoàn về: chạy lại cần
// chuẩn bị lại từ bước 2.

interface PackageLine {
  variantId: string | null;
  sku: string;
  quantity: number;
}
interface StatusChange {
  from: string | null;
  to: string;
  reason: string | null;
  source: string;
}
interface Package {
  id: string;
  code: string;
  status: string;
  version: number;
  trackingCode: string | null;
  handoverSource: string | null;
  pickupConfirmedAt: string | null;
  lines: PackageLine[];
  statusHistory: StatusChange[];
}
interface StockLevel {
  onHand: number;
  reserved: number;
  quarantine: number;
}
interface StockDetail {
  level: StockLevel;
  moves: { document: { type: string; number: string }; unitCost: number | null }[];
}
interface StockDoc {
  id: string;
  number: string;
  status: string;
  source: { type: string; id: string; number: string } | null;
  lines: { variantId: string; quantity: number; expected?: number; unitCost: number | null }[];
}

const email = process.env.E2E_PACKING_EMAIL ?? '';
const password = process.env.E2E_PACKING_PASSWORD ?? '';
const companyId = process.env.E2E_PACKING_COMPANY_ID ?? '';
const packageCode = process.env.E2E_PACKING_CODE ?? '';
const mockAdmin = process.env.E2E_LAZADA_MOCK_ADMIN_URL ?? 'http://127.0.0.1:8091';
const CHUAN_BI = 'chạy dong-goi-rts-van-don trước, xem phần chuẩn bị ở đầu file';
const LY_DO_DAO = 'Kho quét nhầm kiện, hàng còn trên kệ';
// Mô tả bước giao thất bại trong hành trình của sàn giả lập (`TRACE_STEPS` ở scripts/lazada-mock/stubs.ts)
const LY_DO_SAN = 'Giao không thành công: khách không nghe máy';

test.describe.configure({ mode: 'serial' });

test.describe('P4-BE · bàn giao, đảo bàn giao, nhận hàng hoàn (Lazada giả lập, kịch bản giao-that-bai)', () => {
  let skipReason = '';
  let page: Page;
  let api: APIRequestContext;
  let admin: APIRequestContext;
  let pkg: Package;
  let shopId = '';
  /** `version` của kiện trước lần bàn giao đầu, dùng cho bàn giao trùng */
  let versionTruocBanGiao = 0;
  /** Tồn thực mỗi biến thể trước lần bàn giao đầu */
  let tonDau = new Map<string, StockLevel>();

  const kien = async (): Promise<Package> => {
    const res = await api.get(`/api/v1/fulfillment/packages/${pkg.id}`);
    expect(res.status(), await res.text()).toBe(200);
    return res.json();
  };
  const dongBienThe = () => pkg.lines.filter((l): l is PackageLine & { variantId: string } => l.variantId !== null);
  const ton = async (variantId: string): Promise<StockDetail> => {
    const res = await api.get(`/api/v1/inventory/stock/${variantId}`);
    expect(res.status(), await res.text()).toBe(200);
    return res.json();
  };
  const tonCacDong = async () => new Map(await Promise.all(dongBienThe().map(async (l) => [l.variantId, (await ton(l.variantId)).level] as const)));
  /** Tồn thực mỗi dòng bằng `goc` trừ `tru` lần số lượng của dòng */
  const kiemTonThuc = async (goc: Map<string, StockLevel>, tru: number) => {
    const now = await tonCacDong();
    for (const l of dongBienThe()) expect(now.get(l.variantId)!.onHand, `tồn thực ${l.sku}`).toBe(goc.get(l.variantId)!.onHand - tru * l.quantity);
    return now;
  };
  const buocSan = async (): Promise<string> => {
    const res = await admin.get(`${mockAdmin}/__admin/scenarios`);
    expect(res.ok(), await res.text()).toBe(true);
    const { scenarios } = (await res.json()) as { scenarios: { name: string; state: string }[] };
    return scenarios.find((s) => s.name === 'don')?.state ?? '';
  };
  /** Chuyển bước đơn trên sàn giả lập rồi kéo đơn (app không nhận push của sàn) */
  const sanChuyen = async (state: string) => {
    const put = await admin.put(`${mockAdmin}/__admin/scenarios/don/state`, { data: { state } });
    expect(put.ok(), await put.text()).toBe(true);
    expect(await buocSan()).toBe(state);
    const pull = await api.post(`/api/v1/channel/shops/${shopId}/orders/pull`);
    expect(pull.status(), await pull.text()).toBe(200);
  };
  const choTrangThai = async (status: string) => {
    await expect.poll(async () => (await kien()).status, { timeout: 15_000 }).toBe(status);
    pkg = await kien();
  };
  const trangThaiKien = () => page.getByTestId('package-status');
  const lichSuMoiNhat = () => page.getByTestId('status-history').locator('li').first();
  const nutKien = (name: string) => page.getByTestId('package-actions').getByRole('button', { name, exact: true });
  const moKien = async () => {
    await page.goto(`/c/${companyId}/fulfillment/packages/${pkg.id}`);
    await expect(trangThaiKien()).toBeVisible();
  };

  test.beforeAll(async ({ browser }) => {
    const { baseURL, viewport, storageState } = test.info().project.use;
    if (!email || !password || !companyId || !packageCode) {
      skipReason = 'Cần tài khoản và kiện thử của Lazada giả lập (E2E_PACKING_*)';
      return;
    }
    if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1') {
      skipReason = 'Luồng ghi này chạy trên BE cục bộ trỏ sàn giả lập';
      return;
    }
    admin = await request.newContext();
    const state = await admin.get(`${mockAdmin}/__admin/scenarios`).catch(() => null);
    if (!state?.ok()) {
      skipReason = `Không gọi được WireMock ở ${mockAdmin}: ${CHUAN_BI}`;
      return;
    }

    // Đăng nhập bằng form; access token lấy từ phản hồi select-company như e2e/be/congTyGia.ts
    page = await browser.newPage({ baseURL, viewport, storageState });
    await page.goto('/login');
    await page.locator('input[name=email]').fill(email);
    await page.locator('input[name=password]').fill(password);
    const selected = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/v1/identity/select-company' && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    const res = await selected;
    expect(res.status(), await res.text()).toBe(200);
    const { accessToken } = (await res.json()) as { accessToken: string };
    await expect(page).toHaveURL(new RegExp(`/c/${companyId}(?:/|$)`));
    await expect(page.getByTestId('nav-user')).toBeVisible();
    api = await request.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` } });

    const found = await api.get(`/api/v1/fulfillment/packages?tab=awaiting_pickup&search=${encodeURIComponent(packageCode)}`);
    expect(found.status(), await found.text()).toBe(200);
    const item = ((await found.json()) as { items: Package[] }).items.find((p) => p.code === packageCode);
    const step = await buocSan();
    if (!item || step !== 'ready_to_ship') {
      skipReason = `Kiện ${packageCode} phải ở Chờ lấy hàng và sàn ở ready_to_ship (sàn đang ${step || '?'}): ${CHUAN_BI}`;
      return;
    }
    pkg = item;
    pkg = await kien();
    const shops = await api.get('/api/v1/channel/shops');
    expect(shops.status(), await shops.text()).toBe(200);
    shopId = ((await shops.json()) as { items: { id: string; platform: string }[] }).items.find((s) => s.platform === 'lazada')!.id;
  });

  test.beforeEach(() => {
    test.skip(Boolean(skipReason), skipReason);
  });

  test.afterAll(async () => {
    await page?.close();
    await api?.dispose();
    await admin?.dispose();
  });

  test('bàn giao ở tab Chờ lấy hàng: kiện Đang giao, tồn thực giảm đúng số của kiện, lịch sử ghi chuyển', async () => {
    expect(dongBienThe().length, 'kiện phải có dòng đã ghép SKU').toBeGreaterThan(0);
    tonDau = await tonCacDong();
    for (const l of dongBienThe()) expect(tonDau.get(l.variantId)!.reserved, `đang giữ ${l.sku}`).toBeGreaterThanOrEqual(l.quantity);
    versionTruocBanGiao = pkg.version;

    await page.goto(`/c/${companyId}/fulfillment/packages?tab=awaiting_pickup`);
    await page.getByRole('checkbox', { name: `Chọn ${pkg.code}`, exact: true }).click();
    await page.getByRole('button', { name: 'Bàn giao ĐVVC (1)', exact: true }).click();
    const handOver = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/fulfillment/packages/hand-over'));
    await page.getByRole('alertdialog').getByRole('button', { name: 'Bàn giao ĐVVC', exact: true }).click();
    const res = await handOver;
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ handedOver: [expect.objectContaining({ id: pkg.id })], failed: [] });
    await toast(page, 'Đã bàn giao 1 kiện');

    pkg = await kien();
    expect(pkg).toMatchObject({ status: 'in_transit', handoverSource: 'scan', pickupConfirmedAt: null });
    expect(pkg.statusHistory.at(-1)).toMatchObject({ from: 'awaiting_pickup', to: 'in_transit', source: 'user' });
    const sau = await kiemTonThuc(tonDau, 1);
    for (const l of dongBienThe()) expect(sau.get(l.variantId)!.reserved, `đang giữ ${l.sku}`).toBe(tonDau.get(l.variantId)!.reserved - l.quantity);

    await moKien();
    await expect(trangThaiKien()).toContainText('Đang giao');
    await expect(lichSuMoiNhat()).toContainText('Đang giao');
    // Kho quét, sàn chưa xác nhận lấy: CEO thấy nút Đảo bàn giao
    await expect(nutKien('Đảo bàn giao')).toBeVisible();
  });

  test('bàn giao trùng bằng version cũ: kiện nằm ở failed với already_handed_over, tồn không đổi', async () => {
    const res = await api.post('/api/v1/fulfillment/packages/hand-over', { data: { packages: [{ id: pkg.id, version: versionTruocBanGiao }] } });
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { handedOver: unknown[]; failed: { packageId: string; code: string }[] };
    expect(body.handedOver).toEqual([]);
    expect(body.failed).toEqual([expect.objectContaining({ packageId: pkg.id, code: 'already_handed_over' })]);
    await kiemTonThuc(tonDau, 1);
    expect((await kien()).status).toBe('in_transit');
  });

  test('CEO đảo bàn giao: bỏ trống lý do thì báo lỗi, không gọi API; có lý do thì kiện về Chờ lấy hàng, trả lại đủ tồn', async () => {
    let undoCalls = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST' && new URL(r.url()).pathname.endsWith('/undo-handover')) undoCalls++;
    });
    await moKien();
    await nutKien('Đảo bàn giao').click();
    const dialog = page.getByRole('dialog', { name: 'Đảo bàn giao' });
    await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await expect(dialog).toContainText('Nhập lý do');
    expect(undoCalls).toBe(0);

    await dialog.getByTestId('reason-input').fill(LY_DO_DAO);
    const undo = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/undo-handover'));
    await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    expect((await undo).status()).toBe(200);
    expect(undoCalls).toBe(1);
    await toast(page, `${pkg.code}: Đảo bàn giao`);
    await expect(trangThaiKien()).toContainText('Chờ lấy hàng');
    await expect(lichSuMoiNhat()).toContainText('Chờ lấy hàng');
    await expect(lichSuMoiNhat().getByTestId('status-reason')).toHaveText(`Lý do: ${LY_DO_DAO}`);

    pkg = await kien();
    expect(pkg.statusHistory.at(-1)).toMatchObject({ from: 'in_transit', to: 'awaiting_pickup', reason: LY_DO_DAO });
    const sau = await kiemTonThuc(tonDau, 0);
    for (const l of dongBienThe()) expect(sau.get(l.variantId)!.reserved, `đang giữ ${l.sku}`).toBe(tonDau.get(l.variantId)!.reserved);
  });

  test('bàn giao lại ở trang kiện: tồn thực giảm đúng một lần nữa', async () => {
    await moKien();
    const handOver = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/fulfillment/packages/hand-over'));
    await nutKien('Bàn giao').click();
    expect((await handOver).status()).toBe(200);
    await toast(page, `Đã bàn giao kiện ${pkg.code}`);
    await expect(trangThaiKien()).toContainText('Đang giao');
    pkg = await kien();
    expect(pkg.status).toBe('in_transit');
    await kiemTonThuc(tonDau, 1);
  });

  test('sàn báo đã lấy hàng (shipped): kiện vẫn Đang giao, không trừ tồn lần hai, không đảo bàn giao được nữa', async () => {
    await sanChuyen('shipped');
    await choTrangThai('in_transit');
    await kiemTonThuc(tonDau, 1);

    const res = await api.post(`/api/v1/fulfillment/packages/${pkg.id}/undo-handover`, { data: { version: pkg.version, reason: LY_DO_DAO } });
    expect(res.status(), await res.text()).toBe(409);
    expect(((await res.json()) as { type: string }).type).toBe('/problems/handover_confirmed_by_platform');

    // Sàn đã xác nhận lấy: API trả mốc, trang kiện không còn nút Đảo bàn giao (21 §19.2)
    expect(pkg).toMatchObject({ handoverSource: 'scan', pickupConfirmedAt: expect.any(String) });
    await moKien();
    await expect(trangThaiKien()).toContainText('Đang giao');
    await expect(nutKien('Báo thất lạc')).toBeVisible();
    await expect(nutKien('Đảo bàn giao')).toHaveCount(0);
    expect((await kien()).status).toBe('in_transit');
    await kiemTonThuc(tonDau, 1);
  });

  test('sàn báo giao thất bại rồi hoàn: Giao thất bại mang lý do của sàn, Đang hoàn, hoàn xong vẫn chờ kho quét', async () => {
    await sanChuyen('failed_delivery');
    await choTrangThai('delivery_failed');
    expect(pkg.statusHistory.at(-1)).toMatchObject({ from: 'in_transit', to: 'delivery_failed', reason: LY_DO_SAN });
    await moKien();
    await expect(trangThaiKien()).toContainText('Giao thất bại');
    await expect(lichSuMoiNhat().getByTestId('status-reason')).toHaveText(`Lý do: ${LY_DO_SAN}`);

    await sanChuyen('shipped_back');
    await choTrangThai('returning');
    expect(pkg.statusHistory.at(-1)).toMatchObject({ from: 'delivery_failed', to: 'returning' });
    await moKien();
    await expect(trangThaiKien()).toContainText('Đang hoàn');

    // Sàn báo hoàn xong: kiện ở Đang hoàn tới khi kho quét (spec 199c D1), không thêm dòng lịch sử
    const soDong = pkg.statusHistory.length;
    await sanChuyen('shipped_back_success');
    pkg = await kien();
    expect(pkg.status).toBe('returning');
    expect(pkg.statusHistory).toHaveLength(soDong);
    await moKien();
    await expect(trangThaiKien()).toContainText('Đang hoàn');
    await kiemTonThuc(tonDau, 1);
  });

  test('quét nhận hàng hoàn: mã sai báo lỗi ở ô mã; mã vận đơn đúng thì Đã hoàn về, chờ xử lý tăng đúng số quét, phiếu KT mang giá vốn dòng kiện', async () => {
    const [mot, ...khac] = [...dongBienThe()].sort((a, b) => Number(b.sku.includes('TRANG')) - Number(a.sku.includes('TRANG')));
    const quet = new Map([[mot!.variantId, 1], ...khac.map((l) => [l.variantId, 0] as const)]);
    const truoc = await tonCacDong();
    // Giá vốn chốt trên dòng kiện lúc bàn giao = giá của phiếu xuất theo kiện (XK) gần nhất của SKU
    const giaXuat = new Map(
      await Promise.all(
        dongBienThe().map(async (l) => [l.variantId, (await ton(l.variantId)).moves.find((m) => m.document.type === 'shipment')?.unitCost ?? null] as const),
      ),
    );

    await moKien();
    await nutKien('Quét nhận hàng hoàn').click();
    const dialog = page.getByTestId('package-scan-dialog');
    const ma = dialog.locator('#package-code-input');
    await ma.fill('SAI-MA-199');
    const sai = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/receive-return'));
    await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    const loi = await sai;
    expect(loi.status()).toBe(422);
    expect(await loi.json()).toMatchObject({ type: '/problems/package_mismatch', errors: { code: expect.any(String) } });
    await expect(ma).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog).toContainText('Mã quét không phải của kiện này');
    expect((await kien()).status).toBe('returning');

    await ma.fill(pkg.trackingCode ?? pkg.code);
    for (const l of dongBienThe()) await dialog.getByLabel(`Số quét ${l.sku}`, { exact: true }).fill(String(quet.get(l.variantId)));
    const nhan = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/receive-return'));
    await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    const ok = await nhan;
    expect(ok.status(), await ok.text()).toBe(200);
    await toast(page, `Đã nhận hàng hoàn ${pkg.code}`);
    await expect(trangThaiKien()).toContainText('Đã hoàn về');
    pkg = await kien();
    expect(pkg.status).toBe('returned');
    expect(pkg.statusHistory.at(-1)).toMatchObject({ from: 'returning', to: 'returned', source: 'user' });

    // Chờ xử lý tăng đúng số quét, tồn thực không đổi
    const sau = await tonCacDong();
    for (const l of dongBienThe()) {
      expect(sau.get(l.variantId)!.quarantine, `chờ xử lý ${l.sku}`).toBe(truoc.get(l.variantId)!.quarantine + quet.get(l.variantId)!);
      expect(sau.get(l.variantId)!.onHand, `tồn thực ${l.sku}`).toBe(truoc.get(l.variantId)!.onHand);
    }

    // Phiếu kiểm hàng về (KT) nháp: số dự kiến theo kiện, số quét, giá vốn dòng kiện
    const list = await api.get('/api/v1/inventory/documents?type=return_inspection&pageSize=100');
    expect(list.status(), await list.text()).toBe(200);
    const summary = ((await list.json()) as { items: StockDoc[] }).items.find((d) => d.source?.type === 'package' && d.source.id === pkg.id);
    expect(summary, 'phiếu KT của kiện').toBeTruthy();
    const docRes = await api.get(`/api/v1/inventory/documents/${summary!.id}`);
    expect(docRes.status(), await docRes.text()).toBe(200);
    const doc = (await docRes.json()) as StockDoc;
    expect(doc.number).toMatch(/^KT-/);
    expect(doc.status).toBe('draft');
    for (const l of dongBienThe()) {
      const line = doc.lines.find((d) => d.variantId === l.variantId);
      expect(line, `dòng phiếu ${l.sku}`).toMatchObject({ expected: l.quantity, quantity: quet.get(l.variantId), unitCost: giaXuat.get(l.variantId) });
      expect(line!.unitCost, `giá vốn ${l.sku}`).not.toBeNull();
    }

    // Quét lần hai: kiện đã Đã hoàn về
    const lan2 = await api.post(`/api/v1/fulfillment/packages/${pkg.id}/receive-return`, {
      data: { version: pkg.version, code: pkg.code, lines: dongBienThe().map((l) => ({ variantId: l.variantId, quantity: 0 })) },
    });
    expect(lan2.status(), await lan2.text()).toBe(409);
    expect(((await lan2.json()) as { type: string }).type).toBe('/problems/invalid_transition');
    const cuoi = await tonCacDong();
    for (const l of dongBienThe()) expect(cuoi.get(l.variantId)!.quarantine, `chờ xử lý ${l.sku}`).toBe(sau.get(l.variantId)!.quarantine);
  });
});
