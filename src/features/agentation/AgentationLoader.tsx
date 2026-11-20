import { lazy, Suspense } from 'react';
import { agentationEndpoint, resolveAgentationFlag, safeLocalStorage } from './agentationFlag';

// Tách chunk riêng: không bật cờ thì trình duyệt không tải gói agentation
const Agentation = lazy(() => import('agentation').then((m) => ({ default: m.Agentation })));

// Đọc cờ một lần lúc tải trang; đổi cờ bằng ?agentation=1 hoặc ?agentation=0 rồi tải lại
const enabled = resolveAgentationFlag(window.location.search, safeLocalStorage(), import.meta.env.DEV);
const endpoint = agentationEndpoint(import.meta.env.VITE_AGENTATION_ENDPOINT);

/** Thanh ghi chú UI cho AI agent; MCP server chạy trên máy người ghi chú: npx agentation-mcp server */
export function AgentationLoader() {
  if (!enabled) return null;
  return (
    <Suspense fallback={null}>
      <Agentation endpoint={endpoint} />
    </Suspense>
  );
}
