import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import './styles/index.css';
import { USE_MOCKS, appPath, BASE_PATH } from './utils/env';
import { bootstrapSession } from './hooks/useAuth';

async function bootstrap() {
  // Bật MSW (xem utils/env.ts)
  if (USE_MOCKS) {
    const { worker } = await import('./mocks/browser');
    await worker.start({
      onUnhandledRequest: 'bypass',
      serviceWorker: { url: appPath('mockServiceWorker.js'), options: { scope: BASE_PATH } },
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
