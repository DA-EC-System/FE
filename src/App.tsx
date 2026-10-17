import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import { router } from '@/router';
import { AppThemeProvider } from '@/theme/ColorModeContext';
import { Toaster } from '@/components/ui/sonner';
import { PageSpinner } from '@/components/common/PageSpinner';
import { useAuth } from '@/hooks/useAuth';

/** Chờ khôi phục phiên bằng cookie refresh xong mới cho router quyết định chuyển trang */
function SessionGate() {
  const { status } = useAuth();
  if (status === 'loading') return <PageSpinner fullScreen />;
  return <RouterProvider router={router} />;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // Lỗi 4xx (404, 403...) thử lại cũng vậy, chỉ làm chậm thông báo
      retry: (count, error) => {
        const status = axios.isAxiosError(error) ? (error.response?.status ?? 0) : 0;
        return count < 1 && !(status >= 400 && status < 500);
      },
      staleTime: 30_000,
    },
  },
});

export default function App() {
  return (
    <AppThemeProvider>
      <QueryClientProvider client={queryClient}>
        <SessionGate />
      </QueryClientProvider>
      <Toaster position="bottom-right" richColors />
    </AppThemeProvider>
  );
}
