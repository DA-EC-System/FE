/** Nhãn tiếng Việt của hàng tác vụ (§14.5). BE chỉ trả tên hàng, FE tự giữ nhãn */
export const DEAD_JOB_QUEUE_LABELS: Record<string, string> = {
  'channel.order_pull': 'Đồng bộ đơn',
  'channel.open_order_pull': 'Đồng bộ đơn đang xử lý',
  'channel.listing_sync': 'Đồng bộ listing',
  'channel.token_refresh': 'Gia hạn uỷ quyền gian hàng',
};

/** Gặp tên hàng lạ thì hiện nguyên tên */
export const queueLabel = (queue: string) => DEAD_JOB_QUEUE_LABELS[queue] ?? queue;
