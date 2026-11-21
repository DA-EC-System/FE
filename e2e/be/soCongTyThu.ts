/**
 * Sổ công ty thử của lượt e2e chạy BE thật (Documents/21 mục 2.2, Thành chốt 21/11/2026: không có việc nền dọn định kỳ,
 * e2e tự dọn). `dangKyCongTyApi` ghi mỗi công ty vừa đăng ký; `xoaCongTyThu` xoá được thì gạch khỏi sổ. Cuối lượt,
 * project `be-don` (playwright.config.ts) và bước `if: always()` của job e2e-be gọi `donSo()` để xoá nốt công ty còn trong
 * sổ: token hết hạn, spec đổi mật khẩu, spec chết trước `afterAll`, spec quên gọi xoá.
 *
 * Sổ chứa email, mật khẩu của tài khoản thử nên đặt ngoài `test-results` (repo public, không lọt vào artifact). File này
 * không import gì ngoài node để chạy thẳng được: `node e2e/be/soCongTyThu.ts` (Node 24 tự bỏ kiểu).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface CongTyTrongSo {
  companyId: string;
  email: string;
  password: string;
}

const duongDanSo = () => process.env.E2E_SO_CONG_TY ?? join(tmpdir(), 'commerio-e2e-cong-ty-thu.json');
const goc = () => process.env.PW_BASE_URL ?? 'http://127.0.0.1:5173';

function docSo(): CongTyTrongSo[] {
  const file = duongDanSo();
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as CongTyTrongSo[]) : [];
}

function ghiSo(ds: CongTyTrongSo[]) {
  const file = duongDanSo();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(ds, null, 2));
}

/** Ghi công ty vừa đăng ký (project `be` chạy một worker nên không có hai bên ghi cùng lúc) */
export function ghiCongTy(c: CongTyTrongSo) {
  ghiSo([...docSo().filter((x) => x.companyId !== c.companyId), c]);
}

/** Spec đổi mật khẩu CEO thì ghi mật khẩu mới để bước dọn đăng nhập được */
export function doiMatKhauTrongSo(email: string, password: string) {
  ghiSo(docSo().map((x) => (x.email === email ? { ...x, password } : x)));
}

export function gachCongTy(companyId: string) {
  ghiSo(docSo().filter((x) => x.companyId !== companyId));
}

/** `cid` trong access token (công ty đã chọn), để gạch sổ khi xoá bằng token */
export function congTyCuaToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as { cid?: unknown };
    return typeof payload.cid === 'string' ? payload.cid : null;
  } catch {
    return null;
  }
}

async function goi(path: string, init: RequestInit & { token?: string; json?: unknown }) {
  const { token, json, ...rest } = init;
  return fetch(`${goc()}/api/v1${path}`, {
    ...rest,
    headers: {
      ...(json !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
}

/** Đăng nhập lại, chọn công ty, xoá. Trả `null` khi xong, chuỗi lý do khi không xoá được (không in mật khẩu, token). */
async function xoaMot(c: CongTyTrongSo): Promise<string | null> {
  const login = await goi('/identity/login', { method: 'POST', json: { email: c.email, password: c.password } });
  if (!login.ok) return `đăng nhập ${login.status}`;
  const { accessToken } = (await login.json()) as { accessToken: string };
  const chon = await goi('/identity/select-company', { method: 'POST', token: accessToken, json: { companyId: c.companyId } });
  if (!chon.ok) return `chọn công ty ${chon.status}`;
  const { accessToken: token } = (await chon.json()) as { accessToken: string };
  const xoa = await goi('/platform/company', { method: 'DELETE', token });
  // 404: server không bật đăng ký thử, không có gì để dọn
  if (xoa.status === 204 || xoa.status === 404) return null;
  return `DELETE ${xoa.status} ${(await xoa.text()).slice(0, 200)}`;
}

/** Xoá mọi công ty còn trong sổ; công ty xoá được thì gạch. Còn công ty không xoá được thì ném, kèm id và lý do. */
export async function donSo(): Promise<{ daXoa: number }> {
  const conLai = docSo();
  const loi: string[] = [];
  let daXoa = 0;
  for (const c of conLai) {
    const lyDo = await xoaMot(c);
    if (lyDo) loi.push(`${c.companyId}: ${lyDo}`);
    else {
      gachCongTy(c.companyId);
      daXoa++;
    }
  }
  console.log(`Dọn công ty thử cuối lượt: đã xoá ${daXoa}, còn ${loi.length}`);
  if (loi.length) throw new Error(`Không xoá được ${loi.length} công ty thử:\n${loi.join('\n')}`);
  return { daXoa };
}

// Chạy thẳng (bước CI `if: always()`)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  donSo().catch((err: unknown) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
