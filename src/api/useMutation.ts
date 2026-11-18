/**
 * useMutation chặn bấm đúp (FE#247; Documents/25 N5: bấm hai lần thì kết quả như một lần).
 *
 * Nút chỉ `disabled={mutation.isPending}` thì lần bấm thứ hai có thể tới trước khi React vẽ lại, ra hai request, hai bản ghi,
 * hai toast. Bản này khoá ngay trong lời gọi `mutate`/`mutateAsync`: lời gọi trùng biến với lời gọi đang chạy bị bỏ, không gọi
 * API, không chạy onSuccess/onError, `mutateAsync` trả promise không bao giờ xong nên đoạn sau `await` không chạy lần nữa.
 * Biến khác nhau (bấm hai dòng khác nhau của một bảng) vẫn chạy song song. Mọi hook trong `src/api` dùng bản này thay cho
 * `useMutation` của react-query (ESLint chặn import thẳng).
 *
 * Vì lời gọi trùng trả promise không bao giờ xong, đừng bọc `mutateAsync` trong thứ hiện trạng thái chờ theo promise
 * (như `toast.promise` của sonner): lần bấm thứ hai sẽ treo "đang tải" mãi. Dùng `await` rồi `toast.success`/`toast.error`.
 */
import {
  // eslint-disable-next-line no-restricted-imports -- chỗ duy nhất được dùng bản gốc
  useMutation as useQueryMutation,
  type DefaultError,
  type QueryClient,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useCallback, useRef } from 'react';

let unkeyable = 0;
/** Blob không có tên, ngày sửa: so theo chính đối tượng, hai Blob khác nhau không bao giờ trùng khoá */
const blobIds = new WeakMap<Blob, number>();
let nextBlobId = 0;
const blobId = (blob: Blob) => {
  let id = blobIds.get(blob);
  if (id === undefined) {
    nextBlobId += 1;
    id = nextBlobId;
    blobIds.set(blob, id);
  }
  return id;
};

/** Khoá so trùng của biến gửi đi; biến không đổi ra JSON được thì coi mỗi lần là một lời gọi riêng */
export function variablesKey(variables: unknown): string {
  try {
    return (
      JSON.stringify(variables, (_key, value: unknown) => {
        if (typeof value === 'bigint') return `${value}n`;
        if (typeof File !== 'undefined' && value instanceof File) return `file:${value.name}:${value.size}:${value.lastModified}`;
        if (typeof Blob !== 'undefined' && value instanceof Blob) return `blob:${blobId(value)}`;
        return value;
      }) ?? ''
    );
  } catch {
    unkeyable += 1;
    return `\u0000unkeyable:${unkeyable}`;
  }
}

/** Promise không bao giờ xong: lời gọi trùng bị bỏ, đoạn sau `await` của nó không chạy */
const never = <T>() => new Promise<T>(() => undefined);

/** Bộ chặn lời gọi trùng: biến trùng với lời gọi đang chạy thì không gọi `start`; xong (thành công hay lỗi) thì mở lại */
export function createSingleFlight() {
  const inFlight = new Set<string>();
  return function run<T>(variables: unknown, start: () => Promise<T>): Promise<T> {
    const key = variablesKey(variables);
    if (inFlight.has(key)) return never<T>();
    inFlight.add(key);
    let pending: Promise<T>;
    try {
      pending = start();
    } catch (error) {
      inFlight.delete(key);
      throw error;
    }
    return pending.finally(() => inFlight.delete(key));
  };
}

export function useMutation<TData = unknown, TError = DefaultError, TVariables = void, TOnMutateResult = unknown>(
  options: UseMutationOptions<TData, TError, TVariables, TOnMutateResult>,
  queryClient?: QueryClient,
): UseMutationResult<TData, TError, TVariables, TOnMutateResult> {
  const result = useQueryMutation(options, queryClient);
  const flight = useRef<ReturnType<typeof createSingleFlight> | null>(null);
  flight.current ??= createSingleFlight();
  const { mutateAsync: rawMutateAsync } = result;

  type Result = UseMutationResult<TData, TError, TVariables, TOnMutateResult>;
  const mutateAsync = useCallback<Result['mutateAsync']>(
    (...args) => flight.current!(args[0], () => rawMutateAsync(...args)),
    [rawMutateAsync],
  );
  // Như react-query: mutate là mutateAsync nuốt lỗi (lỗi đã qua onError)
  const mutate = useCallback<Result['mutate']>(
    (...args) => {
      mutateAsync(...args).catch(() => undefined);
    },
    [mutateAsync],
  );

  return { ...result, mutate, mutateAsync } as Result;
}
