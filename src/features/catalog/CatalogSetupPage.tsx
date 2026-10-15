import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Tooltip,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { PageHeader } from '@/components/common/PageHeader';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import {
  useAttributes,
  useCategories,
  useDeleteAttribute,
  useDeleteCategory,
} from '@/api/catalog.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { useCan } from '@/hooks/usePermission';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import type { Attribute, Category } from '@/types/catalog';
import { CategoryFormDialog } from './CategoryFormDialog';
import { AttributeFormDialog } from './AttributeFormDialog';
import type { Toast } from './shared';

type Deleting = { kind: 'category'; item: Category } | { kind: 'attribute'; item: Attribute };

/** UC-CP-01: danh mục kèm quy tắc SKU, thuộc tính và giá trị */
export function CatalogSetupPage() {
  const can = useCan();
  const canManage = can(PERMISSIONS.catalogSetup);
  const [tab, setTab] = useState<'categories' | 'attributes'>('categories');

  const categoriesQuery = useCategories();
  const attributesQuery = useAttributes();
  const deleteCategory = useDeleteCategory();
  const deleteAttribute = useDeleteAttribute();

  const [categoryForm, setCategoryForm] = useState<{ item: Category | null } | null>(null);
  const [attributeForm, setAttributeForm] = useState<{ item: Attribute | null } | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const handleDelete = useCallback(async () => {
    if (!deleting) return;
    const { id, version, name } = deleting.item;
    try {
      if (deleting.kind === 'category') await deleteCategory.mutateAsync({ id, version });
      else await deleteAttribute.mutateAsync({ id, version });
      setToast({ severity: 'success', msg: `Đã xoá ${name}` });
    } catch (e) {
      const code = getProblem(e)?.code;
      setToast({
        severity: code === 'in_use' || code === 'version_conflict' ? 'warning' : 'error',
        msg: getErrorMessage(e),
      });
    }
    setDeleting(null);
  }, [deleting, deleteCategory, deleteAttribute]);

  const actions = useCallback(
    (onEdit: () => void, onDelete: () => void, inUse: number) => (
      <Stack direction="row" spacing={0.5}>
        <Tooltip title="Sửa">
          <IconButton size="small" onClick={onEdit}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={inUse ? `Đang có ${inUse} sản phẩm dùng, không xoá được` : 'Xoá'}>
          <span>
            <IconButton size="small" color="error" disabled={inUse > 0} onClick={onDelete}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    ),
    [],
  );

  const categoryColumns: GridColDef<Category>[] = useMemo(
    () => [
      { field: 'name', headerName: 'Danh mục', flex: 1, minWidth: 160 },
      {
        field: 'skuPattern',
        headerName: 'Quy tắc SKU',
        flex: 1,
        minWidth: 180,
        renderCell: ({ value }) => <Box sx={{ fontFamily: 'monospace' }}>{value as string}</Box>,
      },
      { field: 'skuNextSeq', headerName: 'Số kế tiếp', width: 110 },
      { field: 'productCount', headerName: 'Số sản phẩm', width: 120 },
      {
        field: 'updatedAt',
        headerName: 'Cập nhật',
        width: 150,
        valueGetter: (value) => formatDateTime(value as string),
      },
      ...(canManage
        ? [
            {
              field: 'actions',
              headerName: 'Hành động',
              width: 110,
              sortable: false,
              renderCell: ({ row }) =>
                actions(
                  () => setCategoryForm({ item: row }),
                  () => setDeleting({ kind: 'category', item: row }),
                  row.productCount,
                ),
            } satisfies GridColDef<Category>,
          ]
        : []),
    ],
    [actions, canManage],
  );

  const attributeColumns: GridColDef<Attribute>[] = useMemo(
    () => [
      { field: 'name', headerName: 'Thuộc tính', width: 180 },
      {
        field: 'values',
        headerName: 'Giá trị',
        flex: 1,
        minWidth: 260,
        sortable: false,
        renderCell: ({ row }) => (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap alignItems="center" sx={{ height: '100%' }}>
            {row.values.map((v) => (
              <Chip key={v.id} size="small" label={v.value} variant={v.inUse ? 'filled' : 'outlined'} />
            ))}
          </Stack>
        ),
      },
      { field: 'productCount', headerName: 'Số sản phẩm', width: 120 },
      ...(canManage
        ? [
            {
              field: 'actions',
              headerName: 'Hành động',
              width: 110,
              sortable: false,
              renderCell: ({ row }) =>
                actions(
                  () => setAttributeForm({ item: row }),
                  () => setDeleting({ kind: 'attribute', item: row }),
                  row.productCount,
                ),
            } satisfies GridColDef<Attribute>,
          ]
        : []),
    ],
    [actions, canManage],
  );

  const query = tab === 'categories' ? categoriesQuery : attributesQuery;
  const done = (msg: string) => {
    setCategoryForm(null);
    setAttributeForm(null);
    setToast({ severity: 'success', msg });
  };

  return (
    <Box>
      <PageHeader
        title="Danh mục & thuộc tính"
        subtitle="Danh mục quyết định quy tắc SKU; thuộc tính dùng để tạo tổ hợp biến thể."
        action={
          canManage ? (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() =>
                tab === 'categories' ? setCategoryForm({ item: null }) : setAttributeForm({ item: null })
              }
            >
              {tab === 'categories' ? 'Thêm danh mục' : 'Thêm thuộc tính'}
            </Button>
          ) : null
        }
      />

      {query.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(query.error)}
        </Alert>
      )}

      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tab value="categories" label="Danh mục" />
          <Tab value="attributes" label="Thuộc tính" />
        </Tabs>
        {tab === 'categories' ? (
          <DataGrid
            rows={categoriesQuery.data ?? []}
            columns={categoryColumns}
            loading={categoriesQuery.isLoading}
            disableRowSelectionOnClick
            hideFooter
            autoHeight
          />
        ) : (
          <DataGrid
            rows={attributesQuery.data ?? []}
            columns={attributeColumns}
            loading={attributesQuery.isLoading}
            disableRowSelectionOnClick
            hideFooter
            autoHeight
            getRowHeight={() => 'auto'}
            sx={{ '& .MuiDataGrid-cell': { py: 1 } }}
          />
        )}
      </Paper>

      <CategoryFormDialog
        open={Boolean(categoryForm)}
        category={categoryForm?.item ?? null}
        onClose={() => setCategoryForm(null)}
        onDone={done}
      />
      <AttributeFormDialog
        open={Boolean(attributeForm)}
        attribute={attributeForm?.item ?? null}
        onClose={() => setAttributeForm(null)}
        onDone={done}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={deleting?.kind === 'category' ? 'Xoá danh mục?' : 'Xoá thuộc tính?'}
        message={
          <>
            Bạn sắp xoá <strong>{deleting?.item.name}</strong>. Hành động này không thể hoàn tác.
          </>
        }
        confirmLabel="Xoá"
        destructive
        loading={deleteCategory.isPending || deleteAttribute.isPending}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} variant="filled">
            {toast.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
