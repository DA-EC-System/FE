import { ChevronDown, ChevronRight, Dot } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlatformCategories } from '@/api/shops.api';
import { problemMessage } from '@/api/problemMessages';
import { cn } from '@/lib/utils';
import type { PlatformCategory } from '@/types/shop';
import { CategoryPath } from './CategoryPath';

/*
 * Cây category của sàn theo cấp (parentId) và danh sách kết quả tìm, dùng chung cho tab sàn ở Nhóm hàng & thuộc tính
 * và bước Category của trang đẩy lên sàn (commerio-backend#400, Documents/21 §18.5)
 */

export interface TreeLevelProps {
  platform: string;
  parentId: string | null;
  depth: number;
  open: ReadonlySet<string>;
  selected: string | null;
  onToggle: (id: string) => void;
  onSelect: (category: PlatformCategory) => void;
}

export function TreeLevel({ platform, parentId, depth, open, selected, onToggle, onSelect }: TreeLevelProps) {
  const level = usePlatformCategories(platform, parentId ? { parentId } : {});
  const indent = { paddingLeft: 8 + depth * 16 };
  if (level.isLoading) {
    return (
      <div className="grid gap-1 py-1" style={indent}>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-5 w-2/3" />
      </div>
    );
  }
  if (level.isError) {
    return (
      <p className="py-1 text-sm text-destructive-text" style={indent}>
        {problemMessage(level.error)}{' '}
        <button type="button" className="underline" onClick={() => void level.refetch()}>
          Thử lại
        </button>
      </p>
    );
  }
  return (
    <>
      {level.data?.items.map((c) => {
        const isOpen = open.has(c.externalId);
        return (
          <div key={c.externalId} role="treeitem" aria-expanded={c.isLeaf ? undefined : isOpen} aria-selected={selected === c.externalId}>
            <button
              type="button"
              onClick={() => (c.isLeaf ? onSelect(c) : onToggle(c.externalId))}
              className={cn(
                'flex w-full items-center gap-1 rounded-sm py-1 pr-2 text-left text-sm hover:bg-muted',
                selected === c.externalId && 'bg-accent text-primary-text',
              )}
              style={indent}
            >
              <span className="flex size-4 flex-none items-center justify-center text-muted-foreground">
                {c.isLeaf ? <Dot className="size-5 text-primary" /> : isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </span>
              <span className="truncate">{c.name}</span>
              <RemovedBadge category={c} />
            </button>
            {!c.isLeaf && isOpen && (
              <TreeLevel
                platform={platform}
                parentId={c.externalId}
                depth={depth + 1}
                open={open}
                selected={selected}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

export function RemovedBadge({ category }: { category: PlatformCategory }) {
  return category.status === 'removed' ? (
    <Badge variant="destructive" className="ml-auto">
      Sàn đã ngừng dùng
    </Badge>
  ) : null;
}

interface SearchResultsProps {
  loading: boolean;
  error: unknown;
  items: PlatformCategory[];
  selected: string | null;
  onSelect: (category: PlatformCategory) => void;
}

export function SearchResults({ loading, error, items, selected, onSelect }: SearchResultsProps) {
  if (loading) {
    return (
      <div className="grid gap-2 px-2 py-1">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }
  if (error) return <AlertMessage severity="error" className="mx-1.5">{problemMessage(error)}</AlertMessage>;
  if (!items.length) return <EmptyState compact title="Không thấy category cấp cuối nào" description="Thử từ khác, hoặc xoá ô tìm để duyệt cây." />;
  return (
    <div role="group">
      {items.map((c) => (
        <button
          key={c.externalId}
          type="button"
          role="treeitem"
          aria-selected={selected === c.externalId}
          onClick={() => onSelect(c)}
          className={cn(
            'block w-full rounded-sm px-2 py-1.5 text-left hover:bg-muted',
            selected === c.externalId && 'bg-accent',
          )}
        >
          <span className="flex items-start gap-2 text-sm">
            <CategoryPath path={c.path} />
            <RemovedBadge category={c} />
          </span>
        </button>
      ))}
    </div>
  );
}

