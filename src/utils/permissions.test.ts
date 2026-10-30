import { describe, expect, it } from 'vitest';
import type { CompanyContext } from '@/types/auth';
import { db } from '@/mocks/db';
import { FINANCE_VIEW_ANY, PERMISSIONS, canViewFinance, hasAllPermissions, hasAnyPermission } from './permissions';

const contextOf = (permissions: string[]): CompanyContext => ({
  companyId: 'cmp-001',
  companyName: 'Công ty thử',
  roles: [],
  permissions,
  enabledModules: ['finance', 'channel'],
});

const roleNamed = (name: string) => db.roles.find((r) => r.name === name)!;

/** Quyền tiền của vai trò dựng sẵn ở BE (src/modules/core/access/domain/catalog.ts, BUILTIN_ROLES) */
const BACKEND_FINANCE: Record<string, string[]> = {
  CEO: [
    'finance.invoice.view',
    'finance.voucher.create',
    'finance.reversal.create',
    'finance.config.manage',
    'finance.config.approve',
    'finance.settlement.resolve',
    'finance.settlement.approve',
  ],
  Admin: ['finance.config.manage', 'finance.settlement.resolve'],
  Sale: [],
  'Nhân viên kho': [],
};

// Guard trang ở router/index.tsx: sổ tiền theo FINANCE_VIEW_ANY, đối soát theo finance.invoice.view (BE settlement-routes.ts)
const canOpenLedger = (c: CompanyContext) => hasAnyPermission(c, FINANCE_VIEW_ANY);
const canOpenSettlements = (c: CompanyContext) => hasAllPermissions(c, PERMISSIONS.financeView);

describe('canViewFinance', () => {
  it('khớp financeView của BE: một quyền tiền bất kỳ là đủ', () => {
    for (const p of FINANCE_VIEW_ANY) expect(canViewFinance(contextOf([p]))).toBe(true);
    expect([...FINANCE_VIEW_ANY].sort()).toEqual([
      'finance.config.approve',
      'finance.config.manage',
      'finance.invoice.view',
      'finance.settlement.approve',
      'finance.settlement.resolve',
    ]);
  });

  it('lập phiếu chi hay quyền ngoài tiền không mở được sổ tiền', () => {
    expect(canViewFinance(contextOf([PERMISSIONS.voucherCreate, PERMISSIONS.orderView]))).toBe(false);
    expect(canViewFinance(contextOf([]))).toBe(false);
    expect(canViewFinance(null)).toBe(false);
  });
});

describe('quyền tiền của vai trò mock khớp BE', () => {
  it.each(Object.entries(BACKEND_FINANCE))('%s', (name, expected) => {
    const actual = roleNamed(name).permissions.filter((p) => p.startsWith('finance.'));
    expect(actual.sort()).toEqual([...expected].sort());
  });

  it('không còn mã finance.ledger.* (BE không có)', () => {
    for (const role of db.roles) expect(role.permissions.some((p) => p.startsWith('finance.ledger.'))).toBe(false);
  });
});

describe('ai mở được sổ tiền, đối soát', () => {
  it.each([
    ['CEO', true, true],
    ['Admin', true, false],
    ['Sale', false, false],
    ['Nhân viên kho', false, false],
    ['Kế toán', true, true],
  ])('%s: sổ tiền %s, đối soát %s', (name, ledger, settlements) => {
    const c = contextOf(roleNamed(name).permissions);
    expect(canOpenLedger(c)).toBe(ledger);
    expect(canOpenSettlements(c)).toBe(settlements);
  });
});
