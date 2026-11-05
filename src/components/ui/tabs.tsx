import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

/*
 * Tab theo Test_UI v4, FE#129:
 *  - `line` (mặc định, .tabs): chữ 14px, cách nhau 32px, gạch chân xanh 2px chạy theo tab đang chọn.
 *  - `segmented` (.seg): bộ lọc nhỏ, nền xám nhạt, nút cao 28px, ô trắng trượt theo lựa chọn.
 * Vạch/ô trượt đo vị trí tab đang chọn; prefers-reduced-motion tắt chuyển động (styles/index.css).
 */
type TabsVariant = 'line' | 'segmented';

const TabsVariantContext = React.createContext<TabsVariant>('line');

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col gap-2', className)}
      {...props}
    />
  );
}

/** Đo tab đang chọn trong danh sách để đặt vạch gạch chân / ô trượt */
function useActiveIndicator(listRef: React.RefObject<HTMLDivElement | null>) {
  const [box, setBox] = React.useState<{ left: number; width: number } | null>(null);

  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const active = list.querySelector<HTMLElement>('[data-slot=tabs-trigger][data-state=active]');
      setBox((prev) => {
        if (!active) return null;
        const next = { left: active.offsetLeft, width: active.offsetWidth };
        return prev && prev.left === next.left && prev.width === next.width ? prev : next;
      });
    };
    measure();
    const mo = new MutationObserver(measure);
    mo.observe(list, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(list);
    list.querySelectorAll('[data-slot=tabs-trigger]').forEach((t) => ro?.observe(t));
    return () => {
      mo.disconnect();
      ro?.disconnect();
    };
  }, [listRef]);

  return box;
}

function TabsList({
  className,
  children,
  variant = 'line',
  ref,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & { variant?: TabsVariant }) {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const box = useActiveIndicator(listRef);
  const setRef = (node: HTMLDivElement | null) => {
    listRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };

  return (
    <TabsVariantContext.Provider value={variant}>
      <TabsPrimitive.List
        ref={setRef}
        data-slot="tabs-list"
        data-variant={variant}
        className={cn(
          'relative',
          variant === 'line'
            ? 'flex w-full min-w-max items-center gap-8 border-b text-foreground'
            : 'inline-flex w-fit items-center rounded-md bg-muted p-0.5 text-foreground-2',
          className,
        )}
        {...props}
      >
        {box && (
          <span
            aria-hidden
            data-slot="tabs-indicator"
            className={cn(
              'pointer-events-none absolute start-0 transition-[transform,width] duration-300 ease-ant',
              variant === 'line'
                ? '-bottom-px h-0.5 bg-primary'
                : 'inset-y-0.5 rounded-sm bg-card shadow-card dark:bg-fill',
            )}
            style={{ width: box.width, transform: `translateX(${box.left}px)` }}
          />
        )}
        {children}
      </TabsPrimitive.List>
    </TabsVariantContext.Provider>
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = React.useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative z-[1] inline-flex items-center justify-center gap-1.5 text-sm whitespace-nowrap transition-colors duration-300 ease-ant focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:text-faint [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        variant === 'line'
          ? 'h-[46px] text-foreground hover:text-primary-hover data-[state=active]:text-primary-text data-[state=active]:[text-shadow:0_0_.25px_currentcolor]'
          : 'h-7 rounded-sm px-[11px] hover:text-foreground data-[state=active]:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('flex-1', className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
export type { TabsVariant };
