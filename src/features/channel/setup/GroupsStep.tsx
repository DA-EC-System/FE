import { useEffect, useMemo, useState } from 'react';
import { CircleHelp, Search, Sparkles, UserPen } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useGroups } from '@/api/catalog.api';
import { problemMessage } from '@/api/problemMessages';
import { foldVi } from '@/components/layout/paletteCommands';
import { GroupFormDialog } from '@/features/catalog/GroupFormDialog';
import { cn } from '@/lib/utils';
import { isPlatform, type ProductGroup } from '@/types/catalog';
import { filterGroupRows, type GroupFilter, type GroupRow } from './setupDraft';
import type { GroupStepData } from './useGroupStep';
import { SetupPager } from './SetupPager';
import type { SetupDraftState } from './useSetupDraft';

const PAGE_SIZE = 20;
const NEW_GROUP = '__new';

const FILTERS: { key: GroupFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'missing', label: 'Chưa có danh mục' },
  { key: 'suggested', label: 'Có gợi ý' },
  { key: 'user', label: 'Bạn đã chọn' },
];

/**
 * Bước 4 Danh mục sản phẩm (design v2.html s4a, s4wait; Documents/21 §18.7.5 `createGroups`): mỗi sản phẩm sàn sắp tạo
 * chọn một danh mục. Chọn tay được ngay dù category sàn chưa tải xong. `focusProductId`: dòng cần đưa ra (lỗi hoàn tất,
 * nút "Tới dòng đầu tiên").
 */
export function GroupsStep({
  data,
  state,
  focusProductId,
  focusNonce,
}: {
  data: GroupStepData;
  state: SetupDraftState;
  focusProductId?: string | null;
  /** Đổi mỗi lần bấm "Tới dòng" để đưa lại dù cùng dòng */
  focusNonce?: number;
}) {
  const groups = useGroups();
  const [filter, setFilter] = useState<GroupFilter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkGroup, setBulkGroup] = useState('');
  const [creatingFor, setCreatingFor] = useState<string[] | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = foldVi(search.trim());
    return filterGroupRows(data.rows, filter).filter((r) => !q || foldVi(r.title).includes(q));
  }, [data.rows, filter, search]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageNow = Math.min(page, pages);
  const shown = visible.slice((pageNow - 1) * PAGE_SIZE, pageNow * PAGE_SIZE);

  // Đưa dòng cần sửa ra: bỏ lọc, nhảy tới trang chứa dòng, cuộn và tô
  useEffect(() => {
    if (!focusProductId) return;
    const idx = data.rows.findIndex((r) => r.externalProductId === focusProductId);
    if (idx < 0) return;
    setFilter('all');
    setSearch('');
    setPage(Math.floor(idx / PAGE_SIZE) + 1);
    requestAnimationFrame(() =>
      document.getElementById(`group-row-${focusProductId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
    );
  }, [focusProductId, focusNonce, data.rows]);

  const write = async (ids: string[], groupId: string) => {
    setRowError(null);
    const out = await state.writeGroups(ids.map((externalProductId) => ({ externalProductId, groupId })));
    if (!out.ok && out.invalid) setRowError(problemMessage(out.error));
    return out.ok;
  };

  const onPick = (row: GroupRow, value: string) => {
    if (value === NEW_GROUP) setCreatingFor([row.externalProductId]);
    else if (value) void write([row.externalProductId], value);
  };

  const all = groups.data ?? [];
  const options = (
    <>
      <optgroup label="Mặc định của hệ thống">
        {all.filter(isPlatform).map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </optgroup>
      {all.some((g) => !isPlatform(g)) && (
        <optgroup label="Tự tạo">
          {all
            .filter((g) => !isPlatform(g))
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
        </optgroup>
      )}
      <option value={NEW_GROUP}>+ Tạo danh mục mới...</option>
    </>
  );

  if (data.products.isPending) return <Skeleton className="h-40 w-full" />;
  if (data.products.isError) return <AlertMessage severity="error">{problemMessage(data.products.error)}</AlertMessage>;
  if (!data.rows.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Không có sản phẩm nào sẽ tạo mới từ sàn, nên bước này không cần chọn danh mục. Bấm Tiếp để sang bước sau.
      </p>
    );
  }

  const pageIds = shown.map((r) => r.externalProductId);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => picked.has(id));

  return (
    <div className="grid gap-3">
      <p className="text-sm">
        Commerio gợi ý danh mục cho {data.rows.length.toLocaleString('vi-VN')} sản phẩm sẽ tạo từ sàn, theo category của sản phẩm trên sàn.
        Xem lại, sửa dòng sai. Danh mục dùng để quản lý, lọc, gợi ý giá và ngưỡng tồn trong Commerio; không đổi gì trên sàn.
      </p>
      {data.applied !== null && (
        <AlertMessage severity="info">
          Đã áp danh mục gợi ý cho {data.applied.toLocaleString('vi-VN')} sản phẩm. Dòng nào sai thì chọn lại; gợi ý không đè dòng bạn đã chọn.
        </AlertMessage>
      )}
      {rowError && <AlertMessage severity="error">{rowError}</AlertMessage>}

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm theo tên sản phẩm"
            aria-label="Tìm sản phẩm"
            className="ps-8"
          />
        </label>
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? 'default' : 'outline'}
            aria-pressed={filter === f.key}
            onClick={() => {
              setFilter(f.key);
              setPage(1);
            }}
          >
            {f.label} <span className="tabular-nums">{data.counts[f.key].toLocaleString('vi-VN')}</span>
          </Button>
        ))}
      </div>

      {picked.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2.5 text-sm" role="region" aria-label="Thao tác hàng loạt">
          <b className="font-semibold">Đã chọn {picked.size.toLocaleString('vi-VN')} sản phẩm</b>
          <span className="flex-1" />
          <label htmlFor="bulk-group" className="text-xs">
            Áp một danh mục
          </label>
          <select
            id="bulk-group"
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={bulkGroup}
            onChange={(e) => {
              if (e.target.value === NEW_GROUP) setCreatingFor([...picked]);
              else setBulkGroup(e.target.value);
            }}
          >
            <option value="">Chọn danh mục sản phẩm</option>
            {options}
          </select>
          <Button
            size="sm"
            disabled={!bulkGroup || state.saving}
            onClick={async () => {
              if (await write([...picked], bulkGroup)) {
                setPicked(new Set());
                setBulkGroup('');
              }
            }}
          >
            Áp
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPicked(new Set())}>
            Bỏ chọn
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm" data-testid="setup-groups">
          <thead className="bg-table-head text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2">
                <Checkbox
                  aria-label="Chọn mọi sản phẩm trên trang"
                  checked={allOnPage}
                  onCheckedChange={(v) =>
                    setPicked((s) => {
                      const next = new Set(s);
                      pageIds.forEach((id) => (v ? next.add(id) : next.delete(id)));
                      return next;
                    })
                  }
                />
              </th>
              <th className="px-3 py-2 text-start font-normal">Sản phẩm</th>
              <th className="px-3 py-2 text-start font-normal">Danh mục sản phẩm</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr
                key={r.externalProductId}
                id={`group-row-${r.externalProductId}`}
                className={cn('border-t align-top', r.externalProductId === focusProductId && 'bg-info-soft')}
                data-source={r.source}
              >
                <td className="px-3 py-2.5">
                  <Checkbox
                    aria-label={`Chọn ${r.title}`}
                    checked={picked.has(r.externalProductId)}
                    onCheckedChange={(v) =>
                      setPicked((s) => {
                        const next = new Set(s);
                        if (v) next.add(r.externalProductId);
                        else next.delete(r.externalProductId);
                        return next;
                      })
                    }
                  />
                </td>
                <td className="px-3 py-2.5">
                  <b className="font-medium">{r.title}</b>
                  <span className="block text-xs text-muted-foreground">{r.createCount} biến thể sẽ tạo</span>
                </td>
                <td className="px-3 py-2.5">
                  <select
                    aria-label={`Danh mục sản phẩm của ${r.title}`}
                    className={cn(
                      'h-8 w-full max-w-xs rounded-md border bg-background px-2 text-sm',
                      r.source === 'none' && 'border-warning',
                    )}
                    value={r.groupId ?? ''}
                    disabled={groups.isPending}
                    onChange={(e) => onPick(r, e.target.value)}
                  >
                    <option value="" disabled>
                      {groups.isPending ? 'Đang tải danh mục sản phẩm...' : 'Chọn danh mục sản phẩm'}
                    </option>
                    {options}
                  </select>
                  <RowNote row={r} />
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                  Không có sản phẩm nào khớp.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <SetupPager page={pageNow} pageSize={PAGE_SIZE} total={visible.length} unit="sản phẩm" onPage={setPage} />

      <GroupFormDialog
        open={creatingFor !== null}
        group={null}
        onClose={() => setCreatingFor(null)}
        onDone={(_message: string, created?: ProductGroup) => {
          const ids = creatingFor ?? [];
          setCreatingFor(null);
          if (created && ids.length) {
            void write(ids, created.id).then((ok) => ok && ids.length > 1 && setPicked(new Set()));
          }
        }}
      />
    </div>
  );
}

function RowNote({ row }: { row: GroupRow }) {
  if (row.source === 'suggested')
    return (
      <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="size-3.5" aria-hidden />
        Gợi ý từ category sàn
      </span>
    );
  if (row.source === 'user')
    return (
      <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <UserPen className="size-3.5" aria-hidden />
        Bạn đã chọn
      </span>
    );
  return (
    <span className="mt-1 flex items-center gap-1.5 text-xs text-warning-text" role="note">
      <CircleHelp className="size-3.5 shrink-0" aria-hidden />
      {row.externalCategoryId
        ? 'Chưa có gợi ý cho category sàn của sản phẩm này. Chọn danh mục.'
        : 'Chưa có gợi ý: chưa đọc được category của sản phẩm này. Chọn danh mục.'}
    </span>
  );
}
