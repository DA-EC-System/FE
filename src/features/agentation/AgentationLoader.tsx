import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { MessageSquareDashed } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  agentationEndpoint,
  isAgentationShortcut,
  readAgentationOn,
  resolveAgentationFlag,
  safeStorage,
  writeAgentationOn,
} from './agentationFlag';

// Tách chunk riêng: trình duyệt chỉ tải gói agentation lần đầu bật
const Agentation = lazy(() => import('agentation').then((m) => ({ default: m.Agentation })));

// Cờ "được phép dùng" đọc một lần lúc tải trang (?agentation=1 / ?agentation=0)
const allowed = resolveAgentationFlag(window.location.search, safeStorage('localStorage'), import.meta.env.DEV);
const endpoint = agentationEndpoint(import.meta.env.VITE_AGENTATION_ENDPOINT);

/** Nút và phím tắt bật/tắt thanh ghi chú UI. Không có cờ thì không render gì, không gắn listener. */
export function AgentationLoader() {
  return allowed ? <AgentationToggle /> : null;
}

function AgentationToggle() {
  const [on, setOn] = useState(() => readAgentationOn(safeStorage('sessionStorage')));

  const toggle = useCallback(() => {
    setOn((prev) => {
      writeAgentationOn(safeStorage('sessionStorage'), !prev);
      return !prev;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isAgentationShortcut(e)) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const label = on ? 'Tắt ghi chú UI (Ctrl+Alt+A)' : 'Bật ghi chú UI (Ctrl+Alt+A)';
  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        aria-label={label}
        title={label}
        className={cn(
          'fixed bottom-3 left-3 z-[60] flex size-11 cursor-pointer items-center justify-center rounded-full border shadow-sm transition-colors',
          'focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2',
          on
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-background/80 text-muted-foreground hover:text-foreground backdrop-blur',
        )}
      >
        <MessageSquareDashed className="size-5" aria-hidden />
      </button>
      {/* Tắt thì unmount hẳn: component tự gỡ listener, observer của nó */}
      {on && (
        <Suspense fallback={null}>
          <Agentation endpoint={endpoint} />
        </Suspense>
      )}
    </>
  );
}
