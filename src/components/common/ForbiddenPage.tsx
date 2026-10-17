import { Link } from 'react-router-dom';
import { ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/router/routes';

interface ForbiddenPageProps {
  title?: string;
  message: string;
  backTo?: string;
  backLabel?: string;
}

export function ForbiddenPage({
  title = '403 — Không có quyền truy cập',
  message,
  backTo = ROUTES.home,
  backLabel = 'Về trang chính',
}: ForbiddenPageProps) {
  return (
    <div className="flex justify-center p-4 md:p-8">
      <div className="flex max-w-md flex-col items-center gap-2 rounded-xl border bg-card p-8 text-center">
        <ShieldX className="mb-2 size-10 text-muted-foreground" />
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mb-4 text-muted-foreground">{message}</p>
        <Button asChild>
          <Link to={backTo}>{backLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
