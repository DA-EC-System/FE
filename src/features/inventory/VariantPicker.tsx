import { useState } from 'react';
import { Autocomplete, Stack, TextField, Typography } from '@mui/material';
import { useStock } from '@/api/inventory.api';
import { useDebounce } from '@/hooks/useDebounce';
import type { StockLevel } from '@/types/inventory';
import { formatQty } from './shared';

interface VariantPickerProps {
  /** Biến thể đã có trên phiếu: hiện mờ, không chọn lại */
  taken: Set<string>;
  disabled?: boolean;
  onPick: (level: StockLevel) => void;
}

/** Tìm biến thể đang bán theo tên hoặc SKU để thêm vào phiếu; kèm số khả dụng để lập phiếu xuất */
export function VariantPicker({ taken, disabled, onPick }: VariantPickerProps) {
  const [input, setInput] = useState('');
  const search = useDebounce(input.trim());
  const query = useStock({ page: 1, pageSize: 20, search: search || undefined }, { enabled: !disabled });

  return (
    <Autocomplete<StockLevel>
      options={query.data?.items ?? []}
      value={null}
      inputValue={input}
      onInputChange={(_, value, reason) => {
        if (reason !== 'reset') setInput(value);
      }}
      onChange={(_, level) => {
        if (level) {
          onPick(level);
          setInput('');
        }
      }}
      // Lọc ở BE theo tên hoặc SKU
      filterOptions={(x) => x}
      getOptionLabel={(o) => o.sku}
      getOptionDisabled={(o) => taken.has(o.variantId)}
      isOptionEqualToValue={(a, b) => a.variantId === b.variantId}
      loading={query.isFetching}
      disabled={disabled}
      noOptionsText={search ? 'Không tìm thấy biến thể' : 'Gõ tên sản phẩm hoặc SKU'}
      loadingText="Đang tìm..."
      renderOption={({ key, ...props }, o) => (
        <li key={key} {...props}>
          <Stack sx={{ width: '100%' }} direction="row" justifyContent="space-between" spacing={2}>
            <div>
              <Typography variant="body2" fontWeight={600}>
                {o.sku}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {o.productName}
                {o.attributesLabel && ` · ${o.attributesLabel}`}
              </Typography>
            </div>
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
              {taken.has(o.variantId) ? 'Đã có trên phiếu' : `Khả dụng ${formatQty(o.available)}`}
            </Typography>
          </Stack>
        </li>
      )}
      renderInput={(params) => (
        <TextField {...params} size="small" label="Thêm biến thể" placeholder="Tìm theo tên hoặc SKU" />
      )}
      sx={{ maxWidth: 520 }}
    />
  );
}
