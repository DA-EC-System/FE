import { CircleCheck, CircleX, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge, type StatusMeta } from '@/components/common/StatusBadge';
import { useCategorySync, useRetryCategorySync } from '@/api/setupDraft.api';
import { problemMessage } from '@/api/problemMessages';

const SYNC_STATUS: Record<'running' | 'ready', StatusMeta> = {
  running: { label: 'Đang chạy', variant: 'info' },
  ready: { label: 'Sẵn sàng', variant: 'success' },
};

/**
 * Khối tiến độ category của sàn ở bước 3, 4 (Documents/21 §18.5 `GET category-sync`; design v2.html `catSync`). Không chặn
 * bước nào: cây chưa có thì danh mục gợi ý là null, người dùng chọn tay.
 */
export function CategorySyncBlock({ shopId, platform, platformName }: { shopId: string; platform: string; platformName: string }) {
  const sync = useCategorySync(shopId);
  const retry = useRetryCategorySync(shopId, platform);
  const d = sync.data;
  if (sync.isPending) return null;
  if (sync.isError || !d) {
    return (
      <Row icon={<CircleX className="text-destructive" />} title={`Chưa đọc được trạng thái category ${platformName}`} hint={problemMessage(sync.error)} />
    );
  }
  const tree = d.tree.state;
  const perm = d.permissions?.state;
  if (tree === 'unsupported') {
    return <Row icon={<CircleX className="text-muted-foreground" />} title="Sàn này chưa hỗ trợ đọc category; chọn danh mục tay ở bước 4." />;
  }
  if (tree === 'failed' || perm === 'failed') {
    return (
      <Row
        icon={<CircleX className="text-destructive" />}
        title={`Chưa tải được category ${platformName}`}
        hint={`${d.tree.error ?? d.permissions?.error ?? 'Sàn chưa trả cây category.'} Thử lại; vẫn lỗi thì chọn danh mục bằng tay ở bước 4.`}
        action={
          <Button size="sm" variant="outline" disabled={retry.isPending} onClick={() => retry.mutate()}>
            <RefreshCw className={retry.isPending ? 'animate-spin motion-reduce:animate-none' : undefined} />
            Thử lại
          </Button>
        }
      />
    );
  }
  if (tree !== 'ready' || (perm && perm !== 'ready')) {
    return (
      <Row
        icon={<Loader2 className="animate-spin text-primary motion-reduce:animate-none" />}
        title={`Đang tải category ${platformName}...`}
        hint="Chạy một lần cho sàn vừa nối. Làm tiếp các bước được; đóng trang thì việc vẫn chạy."
        action={<StatusBadge status="running" statuses={SYNC_STATUS} />}
      />
    );
  }
  const counts = `Đã tải ${d.tree.leafCount.toLocaleString('vi-VN')} category${
    d.permissions ? `, gian hàng được bán ${d.permissions.availableCount.toLocaleString('vi-VN')}` : ''
  }. Dùng để gợi ý danh mục ở bước 4.`;
  return (
    <Row
      icon={<CircleCheck className="text-success-text" />}
      title={`Category của ${platformName} đã sẵn sàng`}
      hint={counts}
      action={<StatusBadge status="ready" statuses={SYNC_STATUS} />}
    />
  );
}

function Row({ icon, title, hint, action }: { icon: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm [&>svg]:size-4" aria-live="polite" data-testid="category-sync">
      <span className="shrink-0 [&>svg]:size-4" aria-hidden>
        {icon}
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="font-medium">{title}</span>
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </span>
      {action}
    </div>
  );
}
