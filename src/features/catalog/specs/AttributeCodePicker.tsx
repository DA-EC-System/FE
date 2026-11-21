import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAttributeCatalog, type CatalogAttribute } from '@/api/channelSpecMappings.api';

interface AttributeCodePickerProps {
  platform: string;
  platformName: string;
  kind: 'sales' | 'property';
  /** Mã đã chọn, ẩn khỏi kết quả */
  exclude: string[];
  onPick: (a: CatalogAttribute) => void;
}

/** Tìm attribute của sàn đã gặp ở các category đã lấy (GET …/attribute-catalog, Documents/21 §18.8.1) */
export function AttributeCodePicker({ platform, platformName, kind, exclude, onPick }: AttributeCodePickerProps) {
  const [search, setSearch] = useState('');
  const query = useAttributeCatalog(platform, search, kind);
  const items = (query.data ?? []).filter((a) => !exclude.includes(a.code));
  const typed = search.trim().length >= 2;

  return (
    <div className="grid gap-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Tìm attribute ${platformName} theo tên hoặc mã`}
          aria-label={`Tìm attribute ${platformName}`}
          className="pl-8"
        />
      </div>
      {typed && (
        <div className="max-h-48 overflow-y-auto rounded-md border" role="listbox" aria-label="Kết quả">
          {query.isError ? (
            <p className="p-2 text-sm text-destructive">Không tìm được, thử lại sau.</p>
          ) : query.isLoading ? (
            <p className="p-2 text-sm text-muted-foreground">Đang tìm...</p>
          ) : items.length ? (
            items.map((a) => (
              <button
                key={a.code}
                type="button"
                role="option"
                aria-selected={false}
                className="flex min-h-9 w-full cursor-pointer items-center gap-2 px-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onPick(a);
                  setSearch('');
                }}
              >
                <Plus className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{a.label}</span>
                <span className="font-mono text-xs text-muted-foreground">{a.code}</span>
              </button>
            ))
          ) : (
            <p className="p-2 text-sm text-muted-foreground">
              Không thấy. Chỉ có attribute của category {platformName} đã từng mở; mở thêm category ở tab {platformName} rồi tìm lại.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
