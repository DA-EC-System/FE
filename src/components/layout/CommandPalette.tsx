import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleHelp, Search } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
  Command,
} from '@/components/ui/command';
import { useGuideStore } from '@/guides/guideStore';
import { useAuth } from '@/hooks/useAuth';
import { filterCommands, matchRange, pageCommands, quickActions, type PaletteCommand } from './paletteCommands';
import type { NavSection } from './navigation';

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const SHORTCUT = IS_MAC ? '⌘K' : 'Ctrl K';

/** Tô xanh phần chữ khớp như `.cmd mark` của Test_UI */
function Highlight({ text, query }: { text: string; query: string }) {
  const range = matchRange(text, query);
  if (!range) return <>{text}</>;
  const [a, b] = range;
  return (
    <>
      {text.slice(0, a)}
      <mark className="bg-transparent font-semibold text-primary">{text.slice(a, b)}</mark>
      {text.slice(b)}
    </>
  );
}

/**
 * Ô tìm kiếm trên header và bảng lệnh Ctrl K / ⌘K (FE#133, `.search` và `.cmd` của Test_UI).
 * Nhóm "Trang" lấy từ menu đã lọc theo quyền và phân hệ nên không hiện trang người dùng không vào được.
 */
export function CommandPalette({ sections }: { sections: NavSection[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const guideKey = useGuideStore((s) => s.page?.key);
  const openIntro = useGuideStore((s) => s.openIntro);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const pages = useMemo(() => pageCommands(sections), [sections]);
  const actions = useMemo(() => quickActions(companyContext), [companyContext]);
  const shownPages = filterCommands(pages, query);
  const shownActions = filterCommands(actions, query);
  const guideLabel = 'Hướng dẫn trang này';
  const showGuide = Boolean(guideKey) && (!query.trim() || matchRange(guideLabel, query) !== null);

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery('');
  };
  const run = (c: PaletteCommand) => {
    changeOpen(false);
    navigate(c.to, c.state ? { state: c.state } : undefined);
  };

  const item = (c: PaletteCommand) => (
    <CommandItem key={c.id} value={c.id} onSelect={() => run(c)} data-command={c.id}>
      <c.icon />
      <span className="truncate">
        <Highlight text={c.label} query={query} />
      </span>
      {c.hint && <CommandShortcut>{c.hint}</CommandShortcut>}
    </CommandItem>
  );

  return (
    <>
      <button
        type="button"
        data-testid="open-command-palette"
        aria-label={`Tìm trang, thao tác (${SHORTCUT})`}
        aria-keyshortcuts={IS_MAC ? 'Meta+K' : 'Control+K'}
        onClick={() => setOpen(true)}
        className="ms-auto flex h-8 min-w-0 items-center gap-2 rounded-md border border-input bg-card ps-2.5 pe-2 text-sm text-muted-foreground transition-colors hover:border-primary max-sm:flex-1 sm:min-w-60"
      >
        <Search aria-hidden className="size-4 shrink-0" />
        <span className="truncate max-sm:hidden">Tìm trang, thao tác</span>
        <span className="truncate sm:hidden">Tìm kiếm</span>
        <kbd className="ms-auto rounded border bg-fill px-1.5 font-sans text-xs max-sm:hidden">{SHORTCUT}</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={changeOpen} title="Tìm và chạy lệnh">
        <Command shouldFilter={false} loop>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            aria-label="Tìm trang, thao tác"
            placeholder="Gõ để tìm, thử: kho, don hang, doi soat"
          />
          <CommandList>
            <CommandEmpty>Không thấy trang hay thao tác nào khớp.</CommandEmpty>
            {shownActions.length > 0 && <CommandGroup heading="Thao tác nhanh">{shownActions.map(item)}</CommandGroup>}
            {shownPages.length > 0 && <CommandGroup heading="Trang">{shownPages.map(item)}</CommandGroup>}
            {showGuide && guideKey && (
              <CommandGroup heading="Trợ giúp">
                <CommandItem
                  value="guide"
                  data-command="guide"
                  onSelect={() => {
                    changeOpen(false);
                    openIntro(guideKey);
                  }}
                >
                  <CircleHelp />
                  <Highlight text={guideLabel} query={query} />
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
          <div className="flex gap-4 border-t px-4 py-2 text-xs text-muted-foreground max-sm:hidden">
            <span>
              <kbd>↑</kbd> <kbd>↓</kbd> chọn
            </span>
            <span>
              <kbd>Enter</kbd> mở
            </span>
            <span>
              <kbd>Esc</kbd> đóng
            </span>
          </div>
        </Command>
      </CommandDialog>
    </>
  );
}
