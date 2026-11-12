import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CORE_MODULES, OPTIONAL_MODULES } from '@/utils/modules';
import { PERMISSIONS } from '@/utils/permissions';
import { BUILTIN_ONLY_PERMISSIONS, db, permissionCatalog } from './db';
import { MATRIX_PERMISSIONS, MATRIX_ROLES } from './permissionMatrix.generated';

// @ts-expect-error script .mjs không có kiểu
import { parseMatrix, render } from '../../scripts/sinh-quyen-mock.mjs';

/** FE#152: mock quyền, vai trò có sẵn phải trùng ma trận (Documents/kiem-thu/ma-tran-quyen.md) */
describe('mock quyền theo ma trận', () => {
  const codes = MATRIX_PERMISSIONS.map((p) => p.code);

  it('ma trận 53 quyền, không trùng mã', () => {
    expect(codes).toHaveLength(53);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('danh mục cấp được = ma trận trừ platform.*', () => {
    expect(BUILTIN_ONLY_PERMISSIONS).toEqual(['platform.module.manage', 'platform.audit.view', 'platform.job.manage']);
    expect(permissionCatalog.map((p) => p.code)).toEqual(codes.filter((c) => !c.startsWith('platform.')));
  });

  it('4 vai trò có sẵn trùng ma trận', () => {
    const builtin = db.roles.filter((r) => r.companyId === null);
    expect(builtin.map((r) => [r.name, r.permissions])).toEqual([
      ['CEO', [...MATRIX_ROLES.ceo]],
      ['Admin', [...MATRIX_ROLES.admin]],
      ['Sale', [...MATRIX_ROLES.sale]],
      ['Kho', [...MATRIX_ROLES.kho]],
    ]);
    expect([MATRIX_ROLES.ceo, MATRIX_ROLES.admin, MATRIX_ROLES.sale, MATRIX_ROLES.kho].map((r) => r.length)).toEqual([
      53, 36, 14, 10,
    ]);
  });

  it('vai trò tuỳ biến chỉ mang quyền trong danh mục cấp được', () => {
    const allowed = new Set(permissionCatalog.map((p) => p.code));
    for (const r of db.roles.filter((x) => x.companyId !== null)) {
      expect(r.permissions.filter((p) => !allowed.has(p)), r.id).toEqual([]);
    }
  });

  it('phân hệ của mọi quyền là phân hệ FE biết', () => {
    const known: readonly string[] = [...CORE_MODULES, ...OPTIONAL_MODULES];
    expect([...new Set(MATRIX_PERMISSIONS.map((p) => p.module))].filter((m) => !known.includes(m))).toEqual([]);
  });

  it('mọi mã trong PERMISSIONS của FE có trong ma trận', () => {
    expect(Object.values(PERMISSIONS).filter((c) => !codes.includes(c))).toEqual([]);
  });

  it('script đọc lại ma trận mẫu ra đúng file', () => {
    const md = [
      '53 quyền, 4 vai trò có sẵn.',
      '| Phân hệ | Quyền | Việc | CEO | Admin | Sale | Kho |',
      '|---|---|---|:-:|:-:|:-:|:-:|',
      "| catalog | `catalog.product.view` | Xem 'sản phẩm' | ✓ | ✓ | ✓ | ✓ |",
      '|  | `catalog.product.manage` | Sửa | ✓ | ✓ |  |  |',
    ].join('\n');
    expect(() => parseMatrix(md)).toThrow(/53 quyền/);
    const parsed = parseMatrix(md.replace('53 quyền', '2 quyền'));
    expect(parsed.roles.kho).toEqual(['catalog.product.view']);
    expect(render(parsed)).toContain("label: 'Xem \\'sản phẩm\\''");
  });

  it('file sinh ra khớp script hiện tại (không sửa tay)', () => {
    const file = readFileSync(resolve(__dirname, 'permissionMatrix.generated.ts'), 'utf8').replace(/\r\n/g, '\n');
    expect(file).toBe(render({ permissions: [...MATRIX_PERMISSIONS], roles: MATRIX_ROLES }));
  });
});
