import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/router/routes';

export function NotFoundPage() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-[7rem] leading-tight font-bold text-primary">404</h1>
        <p className="text-lg font-semibold">Không tìm thấy trang</p>
        <p className="text-muted-foreground">
          Trang bạn truy cập không tồn tại hoặc đã bị di chuyển.
        </p>
        <Button asChild className="mt-4">
          <Link to={ROUTES.home}>Về trang chính</Link>
        </Button>
      </div>
    </div>
  );
}
