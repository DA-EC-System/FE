import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';
import { bootstrapSession } from './hooks/useAuth';
import './lib/zod';

async function bootstrap() {
  // Khôi phục phiên bằng cookie refresh
  void bootstrapSession();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
