import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getErrorMessage } from '@/api/client';
import { useProductDrafts } from '@/api/purchasing.api';
import { ROUTES } from '@/router/routes';
import { MISSING_LABELS, type VariantMissing } from '@/types/catalog';
import { formatDate } from '@/utils/format';

const PAGE_SIZE = 20;

/**
 * Tab "Hàng mới sắp về cần soạn" ở trang Sản phẩm (Thành chốt 21/11/2026 câu 1; `GET /purchasing/product-drafts`,
 * Documents/21 §16.3). Không có giá nhập, số lượng: Admin không có quyền nhập hàng vẫn soạn được.
 */
export function ProductDraftsTab({ companyId }: { companyId: string }) {
  const [showCreated, setShowCreated] = useState(false);
  const [page, setPage] = useState(1);
  const query = useProductDrafts({ pending: !showCreated, page, pageSize: PAGE_SIZE });
  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center gap-3 border-b p-4">
        <p className="flex-1 text-sm text-muted-foreground">
          Sản phẩm mới trên đề nghị nhập hàng, chưa nhập kho. Soạn trước ảnh, mô tả, thuộc tính; khi nhập kho nội dung được chép
          sang sản phẩm.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={showCreated}
            onCheckedChange={(v) => {
              setShowCreated(v === true);
              setPage(1);
            }}
          />
          Hiện cả bản đã tạo sản phẩm
        </label>
      </div>
      {query.isError && (
        <AlertMessage severity="error" className="m-4">
          {getErrorMessage(query.error)}
        </AlertMessage>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sản phẩm</TableHead>
              <TableHead>Danh mục sản phẩm</TableHead>
              <TableHead>Đề nghị nhập hàng</TableHead>
              <TableHead>Ngày hẹn giao</TableHead>
              <TableHead>Còn thiếu</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  Đang tải…
                </TableCell>
              </TableRow>
            )}
            {!query.isLoading && !rows.length && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  Không có hàng mới nào sắp về cần soạn.
                </TableCell>
              </TableRow>
            )}
            {rows.map((d) => {
              const missing = d.readiness.missing.map((m) => MISSING_LABELS[m as VariantMissing] ?? m);
              return (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.parentName}</TableCell>
                  <TableCell>{d.groupName}</TableCell>
                  <TableCell>
                    {d.requestNumber} · {d.supplierName}
                  </TableCell>
                  <TableCell>{d.expectedDeliveryDate ? formatDate(d.expectedDeliveryDate) : '—'}</TableCell>
                  <TableCell className="text-sm">
                    {d.productId ? (
                      <span className="text-muted-foreground">Đã tạo sản phẩm</span>
                    ) : missing.length ? (
                      missing.join(', ')
                    ) : (
                      <span className="text-success-text">Đủ thông tin</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant={d.productId || !missing.length ? 'ghost' : 'outline'} size="sm">
                      <Link to={ROUTES.company.productDraft(companyId, d.id)}>
                        {d.productId || !missing.length ? 'Xem bản soạn' : 'Soạn trước'}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 border-t p-3 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Trang trước
          </Button>
          <span>
            {page} / {pages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Trang sau
          </Button>
        </div>
      )}
    </Card>
  );
}
