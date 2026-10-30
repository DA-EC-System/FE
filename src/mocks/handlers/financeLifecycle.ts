import { listings } from '../channelData';
import { toListing } from './channel';
import type { ChannelListing, PendingPrice } from '@/types/shop';
import { http, HttpResponse, delay } from 'msw';
import { z } from 'zod';
import { API, LATENCY, requireCompany, buildContext, problem, pageParams, paginate } from './utils';
import { FINANCE_PERMISSIONS, PERMISSIONS as P } from '@/utils/permissions';
import { db } from '../db';
import { configs, payments, runs, bankLines, publicRow } from '../financeLifecycleData';
import type { CreateFinanceConfig, FinanceConfig, FinanceConfigSummary, ConfigAction } from '@/types/finance';
import type { OrderPayment, OrderPaymentDetail, OrderPaymentPage, SettlementRun, SettlementLedgerLine } from '@/types/settlement';
import type { PageResult } from '@/api/types';
import { feeConfigMachine } from '@/lib/machines/feeConfig';
import { resolveBlock, settlementMachine } from '@/lib/machines/settlement';
import { bankRefSchema, configRecord, reasonSchema, todayVn, validateConfig } from '@/features/finance/lifecycleShared';

function guard(request: Request, permission?: string) {
  const result = requireCompany(request, permission ?? null);
  if (result.ok && !buildContext(result.value.membership).enabledModules.includes('finance')) return { ok: false as const, response: fail('module_disabled', 403) };
  if (result.ok && !FINANCE_PERMISSIONS.some((p) => result.value.permissions.includes(p))) return { ok: false as const, response: problem(403, 'Không có quyền', { code: 'forbidden' }) };
  return result;
}
const fail = (code: string, status = 409) => problem(status, 'Không thực hiện được', { code });
const versionOk = (version: unknown, current: number) => version === current;
const now = () => new Date().toISOString();
function activateDue() {
  for (const config of [...configs].sort((a, b) => (a.effectiveFrom ?? '').localeCompare(b.effectiveFrom ?? ''))) {
    if (config.status !== 'scheduled' || !config.effectiveFrom || config.effectiveFrom > todayVn()) continue;
    for (const old of configs) if (old.companyId === config.companyId && old.kind === config.kind && old.shopId === config.shopId && old.status === 'active') {
      if (!(old.effectiveTo && old.effectiveTo < config.effectiveFrom) && old.id !== config.supersedesId) continue;
      old.statusHistory.push({ from: 'active', to: 'expired', at: now(), by: null, source: 'system', reason: null });
      old.status = 'expired'; old.effectiveTo ??= old.effectiveFrom! < config.effectiveFrom ? previousDay(config.effectiveFrom) : old.effectiveFrom; old.version++;
    }
    config.statusHistory.push({ from: 'scheduled', to: 'active', at: now(), by: null, source: 'system', reason: null });
    config.status = 'active'; config.version++;
  }
}

const previousDay = (day: string) => new Date(Date.parse(day) - 86400000).toISOString().slice(0, 10);
// Giá gắn với listing, không đổi theo vị trí sau khi lọc/xác nhận dòng khác.
const pendingPrices = new Map(listings.filter((l) => l.status === 'live').map((l, i) => [l.id, { pendingPrice: i % 2 ? 100000 : 160000, belowFloor: i % 2 === 1 }]));
export const financeLifecycleHandlers = [
  http.get(`${API}/channel/listings/pending-prices`, async ({ request }) => {
    const g = requireCompany(request, P.listingManage); if (!g.ok) return g.response;
    const url = new URL(request.url); const { page, pageSize } = pageParams(url);
    const rows = listings.filter((l) => l.companyId === g.value.companyId && pendingPrices.has(l.id) && (!url.searchParams.get('shopId') || l.shopId === url.searchParams.get('shopId'))).map((l): PendingPrice => ({
      listing: toListing(l), price: l.lastPushedPrice ?? 150000, ...pendingPrices.get(l.id)!,
      configVersionId: `cfg-${l.companyId}`,
    }));
    return HttpResponse.json<PageResult<PendingPrice>>(paginate(rows, page, pageSize));
  }),
  http.post(`${API}/channel/listings/:id/confirm-price`, async ({ request, params }) => {
    const g = requireCompany(request, P.listingManage); if (!g.ok) return g.response;
    const row = listings.find((l) => l.companyId === g.value.companyId && l.id === params.id); if (!row) return fail('not_found', 404);
    const body = await request.json() as { version: number }; if (body.version !== row.version) return fail('version_conflict');
    if (!pendingPrices.has(row.id)) return fail('invalid_transition');
    pendingPrices.delete(row.id); row.version++; return HttpResponse.json<ChannelListing>(toListing(row));
  }),
  http.get(`${API}/finance/payments`, async ({ request }) => {
    await delay(LATENCY); const g = guard(request); if (!g.ok) return g.response;
    const url = new URL(request.url); const { page, pageSize } = pageParams(url);
    const own = payments.filter((p) => p.companyId === g.value.companyId && (!url.searchParams.get('shopId') || p.shopId === url.searchParams.get('shopId')));
    const counts = { none: 0, pending: 0, settled: 0, mismatch: 0, resolved: 0 }; own.forEach((p) => counts[p.status]++);
    const items = own.filter((p) => !url.searchParams.get('status') || p.status === url.searchParams.get('status')).map((p): OrderPayment => {
      const { statusHistory: _history, lines: _lines, ...summary } = publicRow(p); return summary;
    });
    return HttpResponse.json<OrderPaymentPage>({ ...paginate(items, page, pageSize), counts });
  }),
  http.get(`${API}/finance/payments/:id`, async ({ request, params }) => {
    const g = guard(request); if (!g.ok) return g.response;
    const row = payments.find((p) => p.companyId === g.value.companyId && p.orderId === params.id);
    if (!row) return fail('not_found', 404);
    const result = publicRow(row); if (!g.value.permissions.includes(P.costView)) result.lines = result.lines.filter((l) => l.kind !== 'cogs' && l.kind !== 'cogs_reversal');
    return HttpResponse.json<OrderPaymentDetail>(result);
  }),
  http.post(`${API}/finance/payments/:id/:action`, async ({ request, params }) => {
    const action = params.action; if (action !== 'resolve' && action !== 'ceo-approve') return fail('not_found', 404);
    const g = guard(request, action === 'resolve' ? P.settlementResolve : P.settlementApprove); if (!g.ok) return g.response;
    const row = payments.find((p) => p.companyId === g.value.companyId && p.orderId === params.id); if (!row) return fail('not_found', 404);
    const body = await request.json() as { version: number; reason?: string }; if (!versionOk(body.version, row.version)) return fail('version_conflict');
    if (row.status !== 'mismatch') return fail('invalid_transition');
    const by = { id: g.value.account.id, name: g.value.account.fullName };
    if (action === 'ceo-approve') {
      if (!row.needsCeoApproval) return fail('approval_not_needed'); row.ceoApproval = { by, at: now() };
    } else {
      const actor = { accountId: by.id, permissions: g.value.permissions };
      const block = resolveBlock(row, actor); if (block) return fail(block);
      const reason = reasonSchema.safeParse(body.reason); if (!reason.success) return fail('reason_required', 422);
      const step = settlementMachine.check(row.status, 'resolve', { actor, reason: reason.data }); if (!step.ok) return fail(step.code);
      row.statusHistory.push({ from: row.status, to: step.to, by, at: now(), source: 'user', reason: reason.data });
      row.status = step.to; row.resolved = { by, at: now(), reason: reason.data };
      if (row.ceoApproval?.by?.id === by.id) row.ceoApproval = null;
    }
    row.version++; return HttpResponse.json<OrderPayment>(publicRow(row));
  }),
  http.get(`${API}/finance/settlement-runs`, async ({ request }) => {
    const g = guard(request); if (!g.ok) return g.response; const url = new URL(request.url); const { page, pageSize } = pageParams(url);
    for (const run of runs) if (run.companyId === g.value.companyId && run.status === 'running' && Date.now() - Date.parse(run.createdAt) > 1500) { run.status = 'done'; run.lineCount = 12; run.duplicates = 2; }
    const rows = runs.filter((r) => r.companyId === g.value.companyId && (!url.searchParams.get('shopId') || r.shopId === url.searchParams.get('shopId'))).map(publicRow);
    return HttpResponse.json<PageResult<SettlementRun>>(paginate(rows, page, pageSize));
  }),
  http.post(`${API}/finance/settlement-runs`, async ({ request }) => {
    const g = guard(request, P.settlementResolve); if (!g.ok) return g.response;
    const body = await request.json() as { shopId: string; fileId?: string }; if (body.fileId) return fail('file_import_unsupported', 422);
    const shop = db.shops.find((s) => s.companyId === g.value.companyId && s.id === body.shopId); if (!shop) return fail('not_found', 404);
    if (shop.status === 'disconnected') return fail('shop_not_connected');
    if (runs.some((r) => r.companyId === g.value.companyId && r.shopId === shop.id && r.status === 'running')) return fail('settlement_running');
    const row = { id: crypto.randomUUID(), companyId: g.value.companyId, shopId: shop.id, source: 'api' as const, fileId: null,
      from: runs.find((r) => r.shopId === shop.id && r.status === 'done')?.to ?? now(), to: now(), status: 'running' as const,
      lineCount: 0, duplicates: 0, walletDiff: null, error: null, createdBy: g.value.account.id, createdAt: now() };
    runs.unshift(row); return HttpResponse.json<SettlementRun>(publicRow(row), { status: 202 });
  }),
  http.get(`${API}/finance/bank-matching`, async ({ request }) => {
    const g = guard(request); if (!g.ok) return g.response; const url = new URL(request.url); const { page, pageSize } = pageParams(url);
    const rows = bankLines.filter((l) => l.companyId === g.value.companyId && (!url.searchParams.get('kind') || l.kind === url.searchParams.get('kind')) && (!url.searchParams.has('matched') || Boolean(l.bankMatch) === (url.searchParams.get('matched') === 'true'))).map(publicRow);
    return HttpResponse.json<PageResult<SettlementLedgerLine>>(paginate(rows, page, pageSize));
  }),
  http.post(`${API}/finance/ledger/:id/bank-match`, async ({ request, params }) => {
    const g = guard(request, P.settlementResolve); if (!g.ok) return g.response;
    const row = bankLines.find((r) => r.companyId === g.value.companyId && r.id === params.id); if (!row) return fail('not_found', 404);
    if (row.bankMatch) return fail('already_matched');
    if (row.estimated || !['withdrawal', 'supplier_refund', 'lost_compensation'].includes(row.kind)) return fail('not_bank_matchable', 422);
    const body = await request.json() as { bankRef?: string }; const result = bankRefSchema.safeParse(body.bankRef); if (!result.success) return fail('validation_failed', 422);
    row.bankMatch = { bankRef: result.data, by: { id: g.value.account.id, name: g.value.account.fullName }, at: now() };
    return HttpResponse.json<SettlementLedgerLine>(publicRow(row));
  }),
  http.get(`${API}/finance/configs`, async ({ request }) => {
    const g = guard(request); if (!g.ok) return g.response; activateDue(); const url = new URL(request.url); const { page, pageSize } = pageParams(url);
    const rows = configs.filter((c) => c.companyId === g.value.companyId && ['kind', 'shopId', 'status'].every((key) => !url.searchParams.get(key) || c[key as 'kind'] === url.searchParams.get(key))).map((c): FinanceConfigSummary => { const { statusHistory: _history, ...summary } = publicRow(c); return summary; });
    return HttpResponse.json<PageResult<FinanceConfigSummary>>(paginate(rows, page, pageSize));
  }),
  http.get(`${API}/finance/configs/:id`, async ({ request, params }) => {
    const g = guard(request); if (!g.ok) return g.response; activateDue(); const row = configs.find((c) => c.companyId === g.value.companyId && c.id === params.id);
    return row ? HttpResponse.json<FinanceConfig>(publicRow(row)) : fail('not_found', 404);
  }),
  http.post(`${API}/finance/configs`, async ({ request }) => {
    const g = guard(request, P.configManage); if (!g.ok) return g.response; const body = await request.json() as CreateFinanceConfig;
    if (!['fee', 'tax_regime', 'tax_rules', 'mismatch_threshold', 'min_margin'].includes(body.kind)) return fail('validation_failed', 422);
    const errors = validateConfig(body); if (Object.keys(errors).length) return problem(422, 'Kiểm tra dữ liệu', { errors });
    if (body.kind === 'fee' && !db.shops.some((s) => s.id === body.shopId && s.companyId === g.value.companyId)) return fail('not_found', 404);
    if (body.isCorrection && !configs.some((c) => c.id === body.supersedesId && c.companyId === g.value.companyId && c.kind === body.kind && c.shopId === (body.shopId ?? null))) return fail('not_found', 404);
    const row = { id: crypto.randomUUID(), companyId: g.value.companyId, kind: body.kind, shopId: body.kind === 'fee' ? body.shopId! : null,
      payload: body.payload, effectiveFrom: body.effectiveFrom, effectiveTo: null, supersedesId: body.supersedesId ?? null,
      isCorrection: body.isCorrection ?? false, retroactiveFrom: body.retroactiveFrom ?? null, status: 'draft' as const, statusReason: null,
      createdBy: { id: g.value.account.id, name: g.value.account.fullName }, approvedBy: null, selfApproved: false, dryRun: null,
      version: 1, createdAt: now(), statusHistory: [] };
    configs.unshift(row); return HttpResponse.json<FinanceConfig>(publicRow(row), { status: 201 });
  }),
  http.put(`${API}/finance/configs/:id`, async ({ request, params }) => {
    const g = guard(request, P.configManage); if (!g.ok) return g.response;
    const row = configs.find((c) => c.id === params.id && c.companyId === g.value.companyId); if (!row) return fail('not_found', 404);
    const body = await request.json() as { version: number; payload: Record<string, unknown>; effectiveFrom: string };
    if (!versionOk(body.version, row.version)) return fail('version_conflict'); if (row.status !== 'draft') return fail('invalid_transition');
    const errors = validateConfig({ kind: row.kind, shopId: row.shopId ?? undefined, payload: body.payload, effectiveFrom: body.effectiveFrom });
    if (Object.keys(errors).length) return problem(422, 'Kiểm tra dữ liệu', { errors });
    Object.assign(row, { payload: body.payload, effectiveFrom: body.effectiveFrom, dryRun: null, version: row.version + 1 }); return HttpResponse.json<FinanceConfig>(publicRow(row));
  }),
  http.post(`${API}/finance/configs/:id/:action`, async ({ request, params }) => {
    const action = String(params.action).replace(/-/g, '_'); const permission = ['approve', 'reject', 'request_changes'].includes(action) ? P.configApprove : P.configManage;
    const g = guard(request, permission); if (!g.ok) return g.response;
    const row = configs.find((c) => c.id === params.id && c.companyId === g.value.companyId); if (!row) return fail('not_found', 404);
    const body = await request.json() as { version: number; reason?: string }; if (!versionOk(body.version, row.version)) return fail('version_conflict');
    if (action === 'dry_run') {
      if (row.status !== 'draft') return fail('invalid_transition');
      const feePct = row.kind === 'fee' ? ['fixedPct', 'transactionPct', 'servicePct', 'optionalPct'].reduce((n, key) => n + Number(row.payload[key]), 0) : null;
      const taxPct = row.kind === 'tax_rules' ? Number(row.payload.vatPct) + Number(row.payload.pitPct) : null;
      row.dryRun = { at: now(), rows: db.shops.filter((s) => s.companyId === row.companyId && (!row.shopId || s.id === row.shopId)).map((s) => ({ shopId: s.id, shopName: s.shopName, feePct, taxPct, listingsRepriced: null, belowFloor: null })), profit30: { now: 2000000, next: 2000000 - Math.round((feePct ?? taxPct ?? 0) * 10000) } };
    } else {
      if (!['submit', 'approve', 'request_changes', 'reject', 'cancel'].includes(action)) return fail('not_found', 404);
      const actor = { accountId: g.value.account.id, permissions: g.value.permissions, canSelfApprove: g.value.canSelfApprove };
      const step = feeConfigMachine.check(row.status, action as ConfigAction, { actor, record: configRecord(row), reason: body.reason }); if (!step.ok) return fail(step.code, step.code === 'dry_run_required' || step.code === 'reason_required' ? 422 : 409);
      if (body.reason && !z.string().max(500).safeParse(body.reason).success) return fail('validation_failed', 422);
      if (action === 'approve' || action === 'submit') {
        if (configs.some((c) => c.id !== row.id && c.companyId === row.companyId && c.kind === row.kind && c.shopId === row.shopId && ['active', 'scheduled'].includes(c.status) && c.effectiveFrom === row.effectiveFrom && !(row.isCorrection && row.supersedesId === c.id))) return fail('config_overlap');
        if (action === 'approve') {
          const live = configs.filter((c) => c.id !== row.id && c.id !== row.supersedesId && c.companyId === row.companyId && c.kind === row.kind && c.shopId === row.shopId && ['active', 'scheduled'].includes(c.status));
          const before = live.filter((c) => c.effectiveFrom! < row.effectiveFrom!).sort((a, b) => b.effectiveFrom!.localeCompare(a.effectiveFrom!))[0];
          const after = live.filter((c) => c.effectiveFrom! > row.effectiveFrom!).sort((a, b) => a.effectiveFrom!.localeCompare(b.effectiveFrom!))[0];
          if (before) before.effectiveTo = previousDay(row.effectiveFrom!);
          row.effectiveTo = after ? previousDay(after.effectiveFrom!) : null;
          row.approvedBy = { id: actor.accountId, name: g.value.account.fullName }; row.selfApproved = Boolean(step.selfApproved);
        }
      }
      if (action === 'cancel' && row.status === 'scheduled') {
        const before = configs.find((c) => c.id !== row.id && c.companyId === row.companyId && c.kind === row.kind && c.shopId === row.shopId && ['active', 'scheduled'].includes(c.status) && c.effectiveTo === previousDay(row.effectiveFrom!));
        if (before) before.effectiveTo = row.effectiveTo;
      }
      row.statusHistory.push({ from: row.status, to: step.to, at: now(), by: { id: actor.accountId, name: g.value.account.fullName }, source: 'user', reason: body.reason?.trim() ?? null });
      if (action === 'request_changes') row.dryRun = null;
      row.status = step.to; row.statusReason = body.reason?.trim() ?? null;
    }
    row.version++; activateDue(); return HttpResponse.json<FinanceConfig>(publicRow(row));
  }),
];
