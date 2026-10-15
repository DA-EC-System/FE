import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useReturnOrders } from '@/api/inventory.api';
import { getErrorMessage } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/router/routes';
import { formatDateTime } from '@/utils/format';
import type { ReturnOrder } from '@/types/inventory';
import { ReturnReceiptDialog } from './ReturnReceiptDialog';
import { formatQty, type Toast } from './shared';

interface ReturnsTabProps {
  onToast: (toast: Toast) => void;
}

/** UC-IN-03: đơn giao không thành công chờ nhập hoàn; mỗi đơn chỉ nhập hoàn một lần */
export function ReturnsTab({ onToast }: ReturnsTabProps) {
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const query = useReturnOrders();
  const [processing, setProcessing] = useState<ReturnOrder | null>(null);
  const orders = query.data ?? [];

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Đơn giao không thành công, hàng đã quay về kho. Kiểm số thực nhận rồi lập phiếu nhập hoàn; phiếu được ghi sổ
        ngay và cộng lại tồn theo giá vốn hiện tại.
      </Typography>
      {query.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(query.error)}
        </Alert>
      )}
      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', overflowX: 'auto' }}>
        {query.isLoading ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress />
          </Stack>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Đơn</TableCell>
                <TableCell>Khách hàng</TableCell>
                <TableCell>Giao không thành công</TableCell>
                <TableCell align="right">Số lượng</TableCell>
                <TableCell align="right" sx={{ width: 200 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {!orders.length && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                      Không có đơn nào chờ nhập hoàn.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {orders.map((o) => (
                <TableRow key={o.orderId}>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {o.orderCode}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Vận đơn {o.shipmentCode}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{o.customerName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {o.customerPhone}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{formatDateTime(o.failedAt)}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {o.failedReason}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {formatQty(o.lines.reduce((s, l) => s + l.quantity, 0))}
                    <Typography variant="caption" color="text.secondary" display="block">
                      {o.lines.length} biến thể
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {o.receipt ? (
                      <Chip
                        size="small"
                        color="success"
                        variant="outlined"
                        label={`Đã xử lý · ${o.receipt.number}`}
                        component={RouterLink}
                        to={ROUTES.company.inventoryDoc(companyId, o.receipt.id)}
                        clickable
                      />
                    ) : (
                      <Button size="small" variant="contained" onClick={() => setProcessing(o)}>
                        Nhập hoàn
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      <ReturnReceiptDialog
        order={processing}
        onClose={() => {
          setProcessing(null);
          query.refetch();
        }}
        onDone={(doc) => {
          setProcessing(null);
          onToast({ severity: 'success', msg: `Đã lập và ghi sổ ${doc.number}; tồn kho đã cộng lại` });
        }}
      />
    </Box>
  );
}
