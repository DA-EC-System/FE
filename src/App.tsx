import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
      retry: 1,
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
