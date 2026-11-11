import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Khung chi tiết `.dt-grid` của Test_UI (FE#137, FE#138): cột chính và cột phải rộng 300px gồm khối phụ
 * (`aside`, ví dụ Thanh toán) rồi Lịch sử. Dưới 1100px hai cột xếp dọc. Không có cột phải thì chỉ có cột chính.
 */
export function DetailGrid({
  children,
  history,
  aside,
}: {
  children: ReactNode;
  history?: ReactNode;
  aside?: ReactNode;
}) {
  if (!history && !aside) return <div className="grid min-w-0 gap-4">{children}</div>;
  return (
    <div className="grid items-start gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_300px]">
      <div className="grid min-w-0 gap-4">{children}</div>
      <div className="grid min-w-0 gap-4">
        {aside}
        {history && (
          <Card className="py-4" data-guide="detail-history">
            <CardHeader>
              <CardTitle className="text-base">Lịch sử</CardTitle>
            </CardHeader>
            <CardContent>{history}</CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
