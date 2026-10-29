import type { StatusChange } from '@/lib/stateMachine';
import type { StatusMeta } from './StatusBadge';

export type StepTone = 'done' | 'cur' | 'bad' | 'next';

export interface LifecycleInput<S extends string> {
  /** Các bước chính của chứng từ, theo PATHS của Test_UI */
  path: readonly S[];
  current: S;
  history?: readonly StatusChange<S>[];
  statuses: Record<S, StatusMeta>;
  /** Trạng thái kết thúc thì không vẽ các bước sau nó */
  isFinal?: (state: S) => boolean;
}

/**
 * Dựng các bước của thanh tiến trình (theo `lifecycle()` của Test_UI):
 * trạng thái nằm trên đường chính thì các bước trước là đã qua; trạng thái ngoài đường chính
 * (cần sửa, bị từ chối…) chen vào sau bước cuối đã qua, và dừng ở đó nếu là trạng thái kết thúc.
 */
export function lifecycleSteps<S extends string>({
  path,
  current,
  history = [],
  statuses,
  isFinal = () => false,
}: LifecycleInput<S>): { status: S; tone: StepTone }[] {
  const i = path.indexOf(current);
  if (i >= 0) {
    return path.map((status, k) => ({ status, tone: k < i ? 'done' : k === i ? 'cur' : 'next' }));
  }
  const seen = new Set<string>(history.map((h) => h.to));
  const last = path.reduce((acc, s, k) => (seen.has(s) ? k : acc), 0);
  const tone: StepTone = statuses[current]?.variant === 'destructive' ? 'bad' : 'cur';
  return [
    ...path.slice(0, last + 1).map((status) => ({ status, tone: 'done' as const })),
    { status: current, tone },
    ...(isFinal(current) ? [] : path.slice(last + 1).map((status) => ({ status, tone: 'next' as const }))),
  ];
}
