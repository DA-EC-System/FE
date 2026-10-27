import { http, HttpResponse, delay } from 'msw';
import { db } from '../db';
import * as sales from '../salesData';
import { PERMISSIONS } from '@/utils/permissions';
import { collectTasks, dueState, registerTaskSource, REMIND } from '../engine/tasks';
import { API, LATENCY, requireCompany } from './utils';

// ---------- Việc cần làm theo hạn (FE#55); phiếu nhận, giao thiếu, trả NCC đăng ký ở các PR sau ----------

registerTaskSource({
  kind: 'shop.reauth',
  permission: PERMISSIONS.shopConnect,
  collect: (companyId) =>
    db.shops
      .filter((s) => s.companyId === companyId && (s.status === 'deauthorized' || s.status === 'expiring'))
      .map((s) => ({
        id: `shop.reauth:${s.id}`,
        kind: 'shop.reauth',
        group: 'Gian hàng',
        title: `Kết nối lại ${s.shopName}`,
        detail:
          s.status === 'deauthorized'
            ? 'Sàn đã thu hồi quyền. Chưa kéo đơn, chưa đẩy tồn được.'
            : 'Quyền truy cập sàn sắp hết hạn.',
        dueAt: s.accessExpiresAt,
        severity: s.status === 'deauthorized' ? 'overdue' : 'due_soon',
        ref: { type: 'shop', id: s.id },
      })),
});

registerTaskSource({
  kind: 'order.pending',
  permission: PERMISSIONS.orderCreate,
  collect: (companyId, now) =>
    sales.orders
      .filter((o) => o.companyId === companyId && o.status === 'pending_confirmation')
      .map((o) => ({
        id: `order.pending:${o.id}`,
        kind: 'order.pending',
        group: 'Bán hàng',
        title: `Xác nhận đơn ${o.code}`,
        detail: 'Đơn đang chờ xác nhận.',
        ...dueState(o.createdAt, REMIND.orderPending, now),
        ref: { type: 'order', id: o.id },
      })),
});

export const taskHandlers = [
  http.get(`${API}/tasks`, async ({ request }) => {
    await delay(LATENCY);
    // Mọi thành viên xem được; mỗi nguồn nhắc tự lọc theo quyền
    const guard = requireCompany(request, null);
    if (!guard.ok) return guard.response;
    return HttpResponse.json({ items: collectTasks(guard.value.companyId, guard.value.permissions) });
  }),
];
