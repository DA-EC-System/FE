/**
 * Nguồn nhắc việc theo hạn (Documents/so-do-vong-doi: 24 giờ, 7 ngày, 14 ngày).
 * Mỗi phân hệ đăng ký nguồn của mình trong file handler; GET /tasks gom theo quyền người xem.
 */

import type { TaskItem, TaskSeverity } from '@/types/tasks';

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/** Hạn nhắc theo sơ đồ vòng đời */
export const REMIND = {
  /** Phiếu nhận còn đang kiểm */
  goodsReceiptCounting: 24 * HOUR,
  /** NCC giao thiếu chưa ghi kết quả */
  shortDelivery: 7 * DAY,
  /** Phiếu trả NCC đã gửi chưa có kết quả */
  supplierReturnSent: 14 * DAY,
  /** Đơn còn chờ xử lý */
  orderPending: 24 * HOUR,
} as const;

/** Còn ít hơn phần này của hạn thì tính là sắp tới hạn */
const DUE_SOON_SHARE = 0.25;

export function dueState(startAt: string, limitMs: number, now = Date.now()): { dueAt: string; severity: TaskSeverity } {
  const due = new Date(startAt).getTime() + limitMs;
  const severity: TaskSeverity = now >= due ? 'overdue' : due - now <= limitMs * DUE_SOON_SHARE ? 'due_soon' : 'info';
  return { dueAt: new Date(due).toISOString(), severity };
}

interface TaskSource {
  kind: string;
  /** Người xem cần quyền này mới thấy việc */
  permission: string;
  collect(companyId: string, now: number): TaskItem[];
}

const sources: TaskSource[] = [];

export function registerTaskSource(source: TaskSource) {
  if (!sources.some((s) => s.kind === source.kind)) sources.push(source);
}

const RANK: Record<TaskSeverity, number> = { overdue: 0, due_soon: 1, info: 2 };

export function collectTasks(companyId: string, permissions: readonly string[], now = Date.now()): TaskItem[] {
  return sources
    .filter((s) => permissions.includes(s.permission))
    .flatMap((s) => s.collect(companyId, now))
    .sort((a, b) => RANK[a.severity] - RANK[b.severity] || (a.dueAt ?? '~').localeCompare(b.dueAt ?? '~'));
}
