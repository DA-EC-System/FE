import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useStockDetail } from '@/api/inventory.api';
import { getErrorMessage } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/router/routes';
import { formatCurrency, formatDateTime } from '@/utils/format';
import { DOC_KIND_LABELS, formatQty } from './shared';

interface StockDetailDrawerProps {
  variantId: string | null;
  canCost: boolean;
  onClose: () => void;
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'error' }) {
  return (
    <Paper elevation={0} sx={{ p: 1.5, border: 1, borderColor: 'divider' }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6" color={tone === 'error' ? 'error.main' : undefined}>
        {value}
      </Typography>
    </Paper>
  );
}

/** UC-IN-01 bước 4: số tồn, đang giữ, khả dụng và lịch sử biến động của một biến thể */
export function StockDetailDrawer({ variantId, canCost, onClose }: StockDetailDrawerProps) {
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const query = useStockDetail(variantId);
  const level = query.data?.level;
  const moves = query.data?.moves ?? [];

  return (
    <Drawer anchor="right" open={Boolean(variantId)} onClose={onClose}>
      <Box sx={{ width: { xs: '100vw', sm: 560 }, p: 3 }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="h6">{level?.sku ?? 'Tồn kho'}</Typography>
            {level && (
              <Typography variant="body2" color="text.secondary">
                {level.productName}
                {level.attributesLabel && ` · ${level.attributesLabel}`}
              </Typography>
            )}
          </Box>
          <IconButton onClick={onClose} aria-label="Đóng">
            <CloseIcon />
          </IconButton>
        </Stack>

        {query.isLoading && (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress />
          </Stack>
        )}
        {query.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {getErrorMessage(query.error)}
          </Alert>
        )}

        {level && (
          <>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 1.5,
                mt: 2,
              }}
            >
              <Figure label="Tồn thực" value={formatQty(level.onHand)} />
              <Figure label="Đang giữ cho đơn" value={formatQty(level.reserved)} />
              <Figure
                label="Khả dụng"
                value={formatQty(level.available)}
                tone={level.belowMin ? 'error' : undefined}
              />
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
              <Chip
                size="small"
                color={level.belowMin ? 'error' : 'default'}
                label={
                  level.minQty === null
                    ? 'Chưa đặt ngưỡng'
                    : `Ngưỡng ${formatQty(level.minQty)}${level.belowMin ? ' · dưới ngưỡng' : ''}`
                }
              />
              {canCost && level.avgCost !== null && (
                <Chip size="small" label={`Giá vốn BQ ${formatCurrency(level.avgCost)}`} />
              )}
              {canCost && level.stockValue !== null && (
                <Chip size="small" label={`Giá trị tồn ${formatCurrency(level.stockValue)}`} />
              )}
            </Stack>

            <Divider sx={{ my: 2.5 }} />
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Lịch sử biến động
            </Typography>
            {!moves.length ? (
              <Typography variant="body2" color="text.secondary">
                Chưa có biến động nào.
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Thời gian</TableCell>
                    <TableCell>Chứng từ</TableCell>
                    <TableCell align="right">Biến động</TableCell>
                    <TableCell align="right">Tồn sau</TableCell>
                    {canCost && <TableCell align="right">Đơn giá vốn</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {moves.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {formatDateTime(m.doneAt)}
                        <Typography variant="caption" color="text.secondary" display="block">
                          {m.doneBy}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Link component={RouterLink} to={ROUTES.company.inventoryDoc(companyId, m.document.id)}>
                          {m.document.number}
                        </Link>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {DOC_KIND_LABELS[m.document.kind]}
                        </Typography>
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{ fontWeight: 600, color: m.qtyChange > 0 ? 'success.main' : 'error.main' }}
                      >
                        {m.qtyChange > 0 ? '+' : '−'}
                        {formatQty(Math.abs(m.qtyChange))}
                      </TableCell>
                      <TableCell align="right">{formatQty(m.onHandAfter)}</TableCell>
                      {canCost && (
                        <TableCell align="right">
                          {m.unitCost === null ? '—' : formatCurrency(m.unitCost)}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </Box>
    </Drawer>
  );
}
