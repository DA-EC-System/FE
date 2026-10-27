import { http, HttpResponse, delay } from 'msw';
import { db } from '../db';
import { PERMISSIONS } from '@/utils/permissions';
import * as sales from '../salesData';
import * as payment from '../paymentData';
import type { Gateway, GatewayConfig, OrderPayment, PaymentLink, PaymentStatus } from '@/types/payment';
import { API, LATENCY, problem, requireCompany } from './utils';
import { versionConflict, writeCompanyLog } from './identity';
import { findOwned, rid } from './catalog';
import { userRef } from './sales';
import { recordGatewayPayment } from './finance';

// ---------- Thanh toán: cổng, mã thanh toán (UC-PF-01, UC-PF-11; Documents/21 mục 12.3) ----------

export const GATEWAY_NAMES: Record<Gateway, string> = { vnpay: 'VNPay', momo: 'MoMo', zalopay: 'ZaloPay', vietqr: 'VietQR' };
export const SEPAY_WEBHOOK_BASE = 'https://api.commerio.vn/api/v1/payment/webhooks/sepay';

export function gatewayConfigOf(companyId: string, gateway: Gateway) {
  return payment.gatewayConfigs.find((g) => g.companyId === companyId && g.gateway === gateway);
}

/** Không bao giờ trả khoá đầy đủ (T4) */
export function toGatewayConfig(companyId: string, gateway: Gateway): GatewayConfig {
  const cfg = gatewayConfigOf(companyId, gateway);
  if (!cfg) {
    return { gateway, configured: false, version: 0, updatedAt: null, updatedBy: null, credentials: null, display: null, webhookUrl: null };
  }
  return {
    gateway,
    configured: true,
    version: cfg.version,
    updatedAt: cfg.updatedAt,
    updatedBy: userRef(cfg.updatedBy),
    credentials: Object.fromEntries(
      Object.entries(cfg.credentials).map(([field, value]) => [field, { last4: value.slice(-4) }]),
    ),
    display:
      gateway === 'vietqr'
        ? {
            bankBin: cfg.credentials.bankBin,
            bankName: payment.BANK_NAMES[cfg.credentials.bankBin] ?? cfg.credentials.bankBin,
            accountName: cfg.credentials.accountName,
          }
        : null,
    webhookUrl: cfg.receiverKey ? `${SEPAY_WEBHOOK_BASE}/${cfg.receiverKey}` : null,
  };
}

export function toPaymentLink(l: payment.MockPaymentLink): PaymentLink {
  const cfg = l.gateway === 'vietqr' ? gatewayConfigOf(l.companyId, 'vietqr') : undefined;
  return {
    id: l.id,
    orderId: l.orderId,
    gateway: l.gateway,
    paymentCode: l.paymentCode,
    amount: l.amount,
    payUrl: l.payUrl,
    qrContent: l.qrContent,
    bankTransfer: cfg
      ? {
          bankBin: cfg.credentials.bankBin,
          bankName: payment.BANK_NAMES[cfg.credentials.bankBin] ?? cfg.credentials.bankBin,
          accountNo: cfg.credentials.accountNo,
          accountName: cfg.credentials.accountName,
          content: l.paymentCode,
        }
      : null,
    expiresAt: l.expiresAt,
    status: l.status,
    createdAt: l.createdAt,
    createdBy: userRef(l.createdBy) ?? { id: l.createdBy, name: '—' },
  };
}

/** Đơn chưa có dòng order_payments thì suy trạng thái từ đơn, không 404 (A8) */
export function toOrderPayment(o: sales.MockOrder): OrderPayment {
  const row = payment.orderPayments.find((p) => p.orderId === o.id);
  const method = row?.method ?? o.paymentMethod ?? 'prepaid';
  const own = payment.links
    .filter((l) => l.orderId === o.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const active = own.find((l) => l.status === 'active');
  return {
    orderId: o.id,
    method,
    status: row?.status ?? (method === 'cod' ? 'cod_pending' : 'unpaid'),
    refundStatus: row?.refundStatus ?? 'none',
    amount: sales.totalOf(o),
    paidAt: row?.paidAt ?? null,
    activeLink: active ? toPaymentLink(active) : null,
    links: own.slice(0, 20).map((l) => ({
      id: l.id,
      gateway: l.gateway,
      paymentCode: l.paymentCode,
      amount: l.amount,
      status: l.status,
      expiresAt: l.expiresAt,
      createdAt: l.createdAt,
    })),
  };
}

export function gatewayPayUrl(gateway: Gateway, code: string, amount: number) {
  switch (gateway) {
    case 'vnpay':
      return `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=${code}&vnp_Amount=${amount * 100}`;
    case 'momo':
      return `https://test-payment.momo.vn/v2/gateway/pay?orderId=${code}`;
    case 'zalopay':
      return `https://sbgateway.zalopay.vn/openinapp?order=${code}`;
    default:
      return null;
  }
}

export function paymentNotAllowed(o: sales.MockOrder, status: PaymentStatus): string | null {
  if (o.source === 'marketplace') return 'Đơn sàn do sàn thu hộ, không tạo mã thanh toán.';
  if (o.paymentMethod === 'cod') return 'Đơn thu tiền khi giao (COD) không cần mã thanh toán.';
  if (o.status === 'cancelled') return 'Đơn đã huỷ.';
  if (status === 'paid') return 'Đơn đã được thanh toán.';
  if (!Number.isInteger(sales.totalOf(o))) return 'Tổng đơn có phần lẻ đồng.';
  return null;
}

export const paymentHandlers = [
  http.get(`${API}/payment/gateways`, async ({ request }) => {
    await delay(LATENCY);
    let guard = requireCompany(request, PERMISSIONS.gatewayManage);
    const full = guard.ok;
    if (!guard.ok) guard = requireCompany(request, PERMISSIONS.paymentLinkCreate);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    return HttpResponse.json(
      payment.GATEWAYS.map((gateway) => {
        const cfg = toGatewayConfig(companyId, gateway);
        return full ? cfg : { gateway, configured: cfg.configured };
      }),
    );
  }),

  http.put(`${API}/payment/gateways/:gateway`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.gatewayManage);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    const gateway = params.gateway as Gateway;
    if (!payment.GATEWAYS.includes(gateway)) {
      return problem(404, 'Không tìm thấy cổng thanh toán', { code: 'not_found' });
    }
    const body = (await request.json()) as { credentials?: Record<string, string>; version?: number };
    const current = gatewayConfigOf(companyId, gateway);
    if (body.version !== (current?.version ?? 0)) {
      return versionConflict(toGatewayConfig(companyId, gateway), 'Khoá vừa được người khác đổi.');
    }
    const errors: Record<string, string> = {};
    const credentials: Record<string, string> = {};
    for (const field of payment.CREDENTIAL_FIELDS[gateway]) {
      const value = body.credentials?.[field]?.trim() ?? '';
      if (!value) errors[`credentials.${field}`] = 'Bắt buộc nhập';
      credentials[field] = value;
    }
    if (gateway === 'vietqr' && credentials.bankBin && !/^\d{6}$/.test(credentials.bankBin)) {
      errors['credentials.bankBin'] = 'Mã ngân hàng (BIN) gồm 6 chữ số';
    }
    if (Object.keys(errors).length > 0) return problem(422, 'Dữ liệu không hợp lệ', { errors });

    const at = db.now();
    const accountId = guard.value.account.id;
    if (current) {
      current.credentials = credentials;
      current.version += 1;
      current.updatedAt = at;
      current.updatedBy = accountId;
    } else {
      payment.gatewayConfigs.push({
        companyId,
        gateway,
        credentials,
        receiverKey: gateway === 'vietqr' ? payment.newReceiverKey() : null,
        version: 1,
        updatedAt: at,
        updatedBy: accountId,
      });
    }
    // Nhật ký chỉ ghi "đổi khoá", không ghi giá trị khoá (T4)
    writeCompanyLog(
      guard.value,
      current ? 'update' : 'create',
      { type: 'payment.gateway_configs', id: gateway, label: GATEWAY_NAMES[gateway] },
      null,
      { credentials: 'đổi khoá' },
    );
    return HttpResponse.json(toGatewayConfig(companyId, gateway));
  }),

  http.post(`${API}/payment/orders/:orderId/links`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.paymentLinkCreate);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    const found = findOwned(sales.orders, params.orderId, companyId, 'đơn hàng');
    if (!found.ok) return found.response;
    const order = found.value;
    const body = (await request.json()) as { gateway?: Gateway };
    const state = toOrderPayment(order);
    const reason = paymentNotAllowed(order, state.status);
    if (reason) return problem(409, 'Không tạo được mã thanh toán', { code: 'payment_not_allowed', detail: reason });

    const at = db.now();
    // Đơn đã có mã còn hạn (kể cả cổng khác): trả mã đó (T10)
    const active = payment.links.find((l) => l.orderId === order.id && l.status === 'active');
    if (active && active.expiresAt > at) return HttpResponse.json(toPaymentLink(active));

    const gateway = body.gateway;
    if (!gateway || !payment.GATEWAYS.includes(gateway)) {
      return problem(422, 'Dữ liệu không hợp lệ', { errors: { gateway: 'Chọn cổng thanh toán' } });
    }
    const cfg = gatewayConfigOf(companyId, gateway);
    if (!cfg) {
      return problem(422, 'Cổng chưa cấu hình', {
        code: 'gateway_not_configured',
        errors: { gateway: 'Cổng này chưa được cấu hình' },
      });
    }
    if (active) active.status = 'expired';
    const code = payment.newPaymentCode();
    const amount = sales.totalOf(order);
    const payUrl = gatewayPayUrl(gateway, code, amount);
    const link: payment.MockPaymentLink = {
      id: rid('pay'),
      companyId,
      orderId: order.id,
      gateway,
      paymentCode: code,
      amount,
      payUrl,
      qrContent:
        gateway === 'vietqr'
          ? payment.vietQrContent(cfg.credentials.bankBin, cfg.credentials.accountNo, amount, code)
          : (payUrl ?? code),
      expiresAt: new Date(Date.now() + payment.LINK_TTL_MS).toISOString(),
      status: 'active',
      createdAt: at,
      createdBy: guard.value.account.id,
    };
    payment.links.push(link);
    if (!payment.orderPayments.some((p) => p.orderId === order.id)) {
      payment.orderPayments.push({
        companyId,
        orderId: order.id,
        method: 'prepaid',
        status: 'unpaid',
        refundStatus: 'none',
        paidAt: null,
      });
    }
    writeCompanyLog(
      guard.value,
      'create',
      { type: 'payment.payment_links', id: link.id, label: `${order.code} · ${code}` },
      null,
      { gateway, paymentCode: code, amount },
    );
    return HttpResponse.json(toPaymentLink(link), { status: 201 });
  }),

  http.get(`${API}/payment/orders/:orderId`, async ({ params, request }) => {
    await delay(150);
    const guard = requireCompany(request, PERMISSIONS.orderView);
    if (!guard.ok) return guard.response;
    const found = findOwned(sales.orders, params.orderId, guard.value.companyId, 'đơn hàng');
    if (!found.ok) return found.response;
    if (found.value.source === 'marketplace') {
      return problem(404, 'Đơn sàn không có thanh toán trong hệ thống', { code: 'not_found' });
    }
    return HttpResponse.json(toOrderPayment(found.value));
  }),

  // Giả lập khách đã trả tiền (12.11): chạy như webhook, bỏ bước kiểm chữ ký; chỉ có ở môi trường dev
  http.post(`${API}/payment/dev/simulate/:paymentCode`, async ({ params }) => {
    await delay(100);
    const link = payment.links.find((l) => l.paymentCode === params.paymentCode);
    if (!link) return problem(404, 'Không tìm thấy mã thanh toán', { code: 'not_found' });
    const row = payment.orderPayments.find((p) => p.orderId === link.orderId);
    if (link.status === 'active' || (link.status === 'expired' && row?.status === 'unpaid')) {
      link.status = 'paid';
      if (row) {
        row.status = 'paid';
        row.paidAt = db.now();
      }
      recordGatewayPayment(link);
    }
    return HttpResponse.json({ paymentCode: link.paymentCode, status: link.status });
  }),
];
