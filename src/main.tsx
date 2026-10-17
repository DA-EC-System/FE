import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './styles/index.css';
import { USE_MOCKS } from './utils/env';
import { bootstrapSession } from './hooks/useAuth';

async function bootstrap() {
  // Bật MSW (xem utils/env.ts)
  if (USE_MOCKS) {
    const { worker } = await import('./mocks/browser');
    await worker.start({
      onUnhandledRequest: 'bypass',
      serviceWorker: { url: '/mockServiceWorker.js' },
    });
  }

  // Khôi phục phiên bằng cookie refresh (sau khi MSW đã chặn request)
  void bootstrapSession();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
