import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ROUTES } from '@/router/routes';
import { MISSING_LABELS, type VariantMissing } from '@/types/catalog';
import type { PurchaseRequest } from '@/types/purchasing';
import { requestClosed } from './productDraft';

/**
 * Khối "Sản phẩm mới trên đề nghị" ở chi tiết đề nghị nhập hàng (bản phác `soan-truoc-va-phieu-nhap-kho.html` màn 1;
 * Documents/21 §16.3 `PurchaseRequest.productDrafts`). Mỗi cha mới một bản soạn; dòng thêm biến thể vào sản phẩm có sẵn
 * không có bản soạn.
 */
export function NewProductDraftsCard({ request, companyId }: { request: PurchaseRequest; companyId: string }) {
  const drafts = request.productDrafts ?? [];
  const hasExistingParent = request.lines.some((l) => l.newProduct && l.newProduct.parentId !== null && l.newProduct.draftId === null);
  if (!drafts.length && !hasExistingParent) return null;

  const closed = requestClosed(request.status);
  return (
    <Card className="py-4" data-testid="product-drafts">
      <CardHeader>
        <CardTitle className="text-base">Sản phẩm mới trên đề nghị</CardTitle>
        <p className="text-sm text-muted-foreground">
          Sản phẩm và biến thể được tạo khi nhập kho. Soạn trước ảnh, mô tả, thuộc tính để khi hàng về là gần đủ thông tin.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3">
        {drafts.length > 0 && (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead>Danh mục sản phẩm</TableHead>
                  <TableHead>Biến thể theo</TableHead>
                  <TableHead>Còn thiếu</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {drafts.map((d) => {
                  const lines = request.lines.filter((l) => l.newProduct?.draftId === d.id);
                  const axes = lines.length ? Object.keys(lines[0]!.newProduct!.optionValues) : [];
                  const missing = d.readiness.missing.map((m) => MISSING_LABELS[m as VariantMissing] ?? m);
                  const done = Boolean(d.productId) || closed;
                  return (
                    <TableRow key={d.id}>
                      <TableCell>
                        <span className="font-medium">{d.parentName}</span>
                        <Badge variant="info" className="ms-2">
                          {d.productId ? 'Đã tạo' : 'Sản phẩm mới'}
                        </Badge>
                      </TableCell>
                      <TableCell>{d.groupName}</TableCell>
                      <TableCell>
                        {axes.length ? axes.join(', ') : 'Không có biến thể'} · {lines.length} biến thể
                      </TableCell>
                      <TableCell className="text-sm">
                        {d.productId ? (
                          <span className="text-muted-foreground">Sửa ở trang sản phẩm</span>
                        ) : missing.length ? (
                          missing.join(', ')
                        ) : (
                          <span className="text-success-text">Đủ thông tin</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant={done || !missing.length ? 'ghost' : 'outline'} size="sm">
                          <Link to={ROUTES.company.productDraft(companyId, d.id)}>
                            {done || !missing.length ? 'Xem bản soạn' : 'Soạn trước'}
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {hasExistingParent && (
          <p className="text-xs text-muted-foreground">Dòng thêm biến thể vào sản phẩm có sẵn không có bản soạn; sửa ở trang sản phẩm.</p>
        )}
      </CardContent>
    </Card>
  );
}
