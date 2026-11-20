import { useEffect, useRef, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlatformCategories } from '@/api/shops.api';
import { problemMessage } from '@/api/problemMessages';
import { cn } from '@/lib/utils';
import type { PlatformCategory } from '@/types/shop';
import { RemovedBadge } from './PlatformCategoryTree';

/*
 * Bộ chọn category dạng cột lồng nhau như Seller Center (commerio-backend#467): mỗi cột tải một cấp (`parentId`), bấm
 * category cha mở cột kế và đóng các cột sau, bấm category cấp cuối là chọn. Bàn phím: ← → đổi cột, ↑ ↓ trong cột, Enter chọn
 */

interface CategoryColumnsProps {
  platform: string;
  label: string;
  /** Category đang chọn */
  selected: string | null;
  /** Cha các cột đang mở, từ cột 2 trở đi (cột gốc luôn mở) */
  trail: string[];
  onTrail: (trail: string[]) => void;
  onSelect: (category: PlatformCategory) => void;
}

interface PendingFocus {
  col: number;
  index: number;
}

export function CategoryColumns({ platform, label, selected, trail, onTrail, onSelect }: CategoryColumnsProps) {
  const pending = useRef<PendingFocus | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const parents: (string | null)[] = [null, ...trail];
  // Tên nhánh đang mở cho nút quay lại trên điện thoại: đọc từ cột chứa nó (cùng khoá truy vấn với cột đó, không gọi thêm)
  const openParent = trail.length >= 2 ? trail[trail.length - 2]! : null;
  const openLevel = usePlatformCategories(platform, openParent ? { parentId: openParent } : {}, trail.length > 0);
  const openName = openLevel.data?.items.find((c) => c.externalId === trail.at(-1))?.name;

  // Cột vừa mở có thể nằm khuất bên phải khung: cuộn khung tới cột cuối. Gọi khi trail đổi và khi cột cuối tải xong
  // (mở trang với category đã chọn thì trail có sẵn, các cột còn đang tải nên lúc đầu khung chưa rộng)
  const scrollToLast = () => {
    const el = root.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
  };
  useEffect(scrollToLast, [trail.length]);

  const focusItem = (col: number, index: number) => {
    const el = root.current?.querySelector<HTMLElement>(`[data-col="${col}"][data-index="${index}"]`);
    el?.focus();
    return Boolean(el);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (!target.dataset.col) return;
    const col = Number(target.dataset.col);
    const index = Number(target.dataset.index);
    const parentOf = target.dataset.parent === '1';
    const id = target.dataset.id ?? '';
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(col, index + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusItem(col, index - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (parentOf) {
        onTrail([...trail.slice(0, col), id]);
        pending.current = { col: col + 1, index: 0 };
        // Cột kế đã mở sẵn và đã có dữ liệu thì chuyển ngay; chưa thì cột đó tự chuyển khi tải xong
        if (trail[col] === id && focusItem(col + 1, 0)) pending.current = null;
      }
    } else if (e.key === 'ArrowLeft' && col > 0) {
      e.preventDefault();
      const parent = trail[col - 1];
      const siblings = root.current?.querySelectorAll<HTMLElement>(`[data-col="${col - 1}"]`);
      const at = [...(siblings ?? [])].find((el) => el.dataset.id === parent);
      at?.focus();
    }
  };

  return (
    <div>
      {trail.length > 0 && (
        <Button type="button" variant="ghost" size="sm" className="mb-1 sm:hidden" onClick={() => onTrail(trail.slice(0, -1))}>
          <ChevronLeft className="size-4" aria-hidden /> {openName ?? 'Quay lại cấp trên'}
          {openName && <span className="sr-only"> (quay lại cấp trên)</span>}
        </Button>
      )}
      <div
        ref={root}
        onKeyDown={onKeyDown}
        className="flex h-[300px] overflow-x-auto overflow-y-hidden rounded-lg border"
        role="group"
        aria-label={`Cây category ${label}`}
      >
        {parents.map((parentId, col) => (
          <Column
            key={`${col}:${parentId ?? 'root'}`}
            platform={platform}
            col={col}
            parentId={parentId}
            opened={trail[col] ?? null}
            selected={selected}
            // Điện thoại: chỉ cột cuối hiện
            hiddenOnMobile={col < parents.length - 1}
            pending={pending}
            focusItem={focusItem}
            onOpen={(id) => onTrail([...trail.slice(0, col), id])}
            onSelect={onSelect}
            onLoaded={col === parents.length - 1 ? scrollToLast : undefined}
          />
        ))}
      </div>
    </div>
  );
}

interface ColumnProps {
  platform: string;
  col: number;
  parentId: string | null;
  opened: string | null;
  selected: string | null;
  hiddenOnMobile: boolean;
  pending: React.RefObject<PendingFocus | null>;
  focusItem: (col: number, index: number) => boolean;
  onOpen: (id: string) => void;
  onSelect: (category: PlatformCategory) => void;
  /** Cột cuối: gọi khi có dữ liệu để khung cuộn tới nó */
  onLoaded?: () => void;
}

function Column({ platform, col, parentId, opened, selected, hiddenOnMobile, pending, focusItem, onOpen, onSelect, onLoaded }: ColumnProps) {
  const level = usePlatformCategories(platform, parentId ? { parentId } : {});
  const items = level.data?.items;

  // Người dùng ấn → trong lúc cột này còn đang tải: chuyển focus khi có dữ liệu
  useEffect(() => {
    if (items?.length) onLoaded?.();
    if (items?.length && pending.current?.col === col) {
      const at = pending.current;
      pending.current = null;
      requestAnimationFrame(() => focusItem(col, at.index));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy khi cột có dữ liệu
  }, [items]);

  const frame = cn('min-w-[210px] max-w-[260px] flex-1 overflow-y-auto border-r p-1 last:border-r-0', hiddenOnMobile && 'hidden sm:block', 'max-sm:max-w-none max-sm:min-w-full');

  if (level.isLoading) {
    return (
      <div className={frame} aria-busy aria-label={`Cấp ${col + 1}`}>
        <div className="grid gap-1.5 p-1">
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-5/6" />
          <Skeleton className="h-7 w-2/3" />
        </div>
      </div>
    );
  }
  if (level.isError) {
    return (
      <div className={frame} aria-label={`Cấp ${col + 1}`}>
        <p className="p-2 text-sm text-destructive-text">{problemMessage(level.error)}</p>
        <Button type="button" variant="outline" size="sm" className="mx-2" onClick={() => void level.refetch()}>
          Thử lại
        </Button>
      </div>
    );
  }
  if (!items?.length) {
    return (
      <div className={cn(frame, 'flex items-center justify-center text-center text-sm text-muted-foreground')} aria-label={`Cấp ${col + 1}`}>
        {col === 0 && !level.data?.syncedAt
          ? 'Cây category của sàn chưa đồng bộ lần nào. Đồng bộ ở trang Nhóm hàng & thuộc tính.'
          : 'Chưa có category con.'}
      </div>
    );
  }
  // Mục để tab vào: mục đang mở/chọn, không thì mục đầu
  const tabbable = Math.max(
    0,
    items.findIndex((c) => c.externalId === opened || c.externalId === selected),
  );
  return (
    <div className={frame} role="listbox" aria-label={`Cấp ${col + 1}`}>
      {items.map((c, index) => {
        const isOpen = !c.isLeaf && opened === c.externalId;
        const isSelected = c.isLeaf && selected === c.externalId;
        return (
          <button
            key={c.externalId}
            type="button"
            role="option"
            aria-selected={isSelected}
            data-col={col}
            data-index={index}
            data-id={c.externalId}
            data-parent={c.isLeaf ? '0' : '1'}
            tabIndex={index === tabbable ? 0 : -1}
            onClick={() => (c.isLeaf ? onSelect(c) : onOpen(c.externalId))}
            className={cn(
              'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
              isOpen && 'bg-accent font-semibold text-primary-text',
              isSelected && 'bg-primary font-semibold text-primary-foreground hover:bg-primary',
            )}
          >
            <span className="min-w-0 break-words">{c.name}</span>
            <RemovedBadge category={c} />
            {!c.isLeaf && <ChevronRight className={cn('size-4 flex-none text-muted-foreground', isOpen && 'text-primary-text')} aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
