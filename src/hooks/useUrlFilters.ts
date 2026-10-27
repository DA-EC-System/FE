import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDebounce } from '@/hooks/useDebounce';

/**
 * Bộ lọc, ô tìm và trang nằm trên URL để tải lại hay chia sẻ link vẫn giữ nguyên.
 * Ô tìm gõ vào state riêng rồi đẩy lên URL sau debounce.
 */
export function useUrlFilters(pageSizes: number[], defaultPageSize = pageSizes[0]) {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  const pageSize = pageSizes.includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : defaultPageSize;
  const q = params.get('q') ?? '';

  const [searchInput, setSearchInput] = useState(q);
  const debouncedSearch = useDebounce(searchInput.trim());

  const update = (patch: Record<string, string | number | undefined>) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined || value === '') next.delete(key);
          else next.set(key, String(value));
        }
        return next;
      },
      { replace: true },
    );
  };

  useEffect(() => {
    if (debouncedSearch !== q) update({ q: debouncedSearch, page: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  /** Đổi một bộ lọc thì về trang 1 */
  const setFilter = (key: string) => (value: string) => update({ [key]: value, page: undefined });

  return {
    params,
    page,
    pageSize,
    q,
    searchInput,
    setSearchInput,
    setFilter,
    update,
    onPageChange: (p: number, size: number) => update({ page: size === pageSize ? p : undefined, pageSize: size }),
  };
}
