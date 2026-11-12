#!/usr/bin/env node
/**
 * Sinh danh mục quyền và 4 vai trò có sẵn cho mock từ Documents/kiem-thu/ma-tran-quyen.md (FE#152).
 *
 *   node scripts/sinh-quyen-mock.mjs <đường dẫn ma-tran-quyen.md>          ghi src/mocks/permissionMatrix.generated.ts
 *   node scripts/sinh-quyen-mock.mjs <đường dẫn ma-tran-quyen.md> --check  so với file đã có, lệch thì thoát mã 1
 *
 * Ma trận do BE sinh từ BUILTIN_ROLES nên mock theo ma trận là theo BE. Không sửa tay file sinh ra.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/mocks/permissionMatrix.generated.ts');
const ROLE_KEYS = { CEO: 'ceo', Admin: 'admin', Sale: 'sale', Kho: 'kho' };

export function parseMatrix(md) {
  const lines = md.split(/\r?\n/).filter((l) => l.trim().startsWith('|'));
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const headerIdx = lines.findIndex((l) => /\|\s*Quyền\s*\|/.test(l));
  if (headerIdx < 0) throw new Error('Không thấy dòng tiêu đề có cột "Quyền"');
  const header = cells(lines[headerIdx]);
  const roleCols = header
    .map((h, i) => [h, i])
    .filter(([h]) => h in ROLE_KEYS)
    .map(([h, i]) => [ROLE_KEYS[h], i]);
  if (roleCols.length !== 4) throw new Error(`Cần 4 cột vai trò, thấy ${roleCols.length}`);

  const permissions = [];
  const roles = Object.fromEntries(roleCols.map(([k]) => [k, []]));
  let module = '';
  for (const line of lines.slice(headerIdx + 2)) {
    const c = cells(line);
    const code = /^`([a-z]+\.[a-z]+\.[a-z]+)`$/.exec(c[1] ?? '')?.[1];
    if (!code) continue;
    if (c[0]) module = c[0];
    if (!code.startsWith(`${module}.`)) throw new Error(`Quyền ${code} không thuộc phân hệ ${module}`);
    permissions.push({ code, module, label: c[2] });
    for (const [k, i] of roleCols) if (c[i] === '✓') roles[k].push(code);
  }
  const declared = /(\d+) quyền, (\d+) vai trò/.exec(md);
  if (declared && Number(declared[1]) !== permissions.length) {
    throw new Error(`Ma trận ghi ${declared[1]} quyền nhưng đọc được ${permissions.length}`);
  }
  return { permissions, roles };
}

export function render({ permissions, roles }) {
  const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const perm = permissions.map((p) => `  { code: ${q(p.code)}, module: ${q(p.module)}, label: ${q(p.label)} },`);
  const role = Object.entries(roles).map(
    ([k, codes]) => `  ${k}: [\n${codes.map((c) => `    ${q(c)},`).join('\n')}\n  ],`,
  );
  return `// File sinh bằng scripts/sinh-quyen-mock.mjs từ Documents/kiem-thu/ma-tran-quyen.md. Không sửa tay (FE#152).
// Cập nhật: node scripts/sinh-quyen-mock.mjs <Documents>/kiem-thu/ma-tran-quyen.md

export interface MatrixPermission {
  code: string;
  module: string;
  label: string;
}

/** ${permissions.length} quyền theo ma trận, gồm cả platform.* (chỉ vai trò có sẵn mang) */
export const MATRIX_PERMISSIONS: readonly MatrixPermission[] = [
${perm.join('\n')}
];

/** Quyền của 4 vai trò có sẵn (BUILTIN_ROLES ở BE) */
export const MATRIX_ROLES = {
${role.join('\n')}
} as const satisfies Record<string, readonly string[]>;
`;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [src, flag] = process.argv.slice(2);
  if (!src) {
    console.error('Cách dùng: node scripts/sinh-quyen-mock.mjs <ma-tran-quyen.md> [--check]');
    process.exit(2);
  }
  const out = render(parseMatrix(readFileSync(src, 'utf8')));
  if (flag === '--check') {
    const current = readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n');
    if (current !== out) {
      console.error('Mock quyền lệch ma trận. Chạy lại script không có --check rồi commit.');
      process.exit(1);
    }
    console.log('Mock quyền khớp ma trận.');
  } else {
    writeFileSync(OUT, out);
    console.log(`Đã ghi ${OUT}`);
  }
}
