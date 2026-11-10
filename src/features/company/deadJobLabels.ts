/** Nhãn tiếng Việt của hàng việc nền (§14.5). BE chỉ trả tên hàng, FE tự giữ nhãn */
export const DEAD_JOB_QUEUE_LABELS: Record<string, string> = {
  'channel.order_pull': 'Lấy đơn',
  'channel.open_order_pull': 'Lấy đơn còn mở',
  'channel.listing_sync': 'Đồng bộ listing',
  'channel.token_refresh': 'Làm mới token sàn',
};

/** Gặp tên hàng lạ thì hiện nguyên tên */
export const queueLabel = (queue: string) => DEAD_JOB_QUEUE_LABELS[queue] ?? queue;
