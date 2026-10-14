import { Paper, Stack, Typography } from '@mui/material';
import ConstructionIcon from '@mui/icons-material/Construction';

interface PlaceholderPageProps {
  title: string;
  phase?: string;
  description?: string;
}

export function PlaceholderPage({
  title,
  phase = 'Sắp ra mắt',
  description = 'Module này đang được phát triển trong giai đoạn tiếp theo.',
}: PlaceholderPageProps) {
  return (
    <Stack alignItems="center" justifyContent="center" sx={{ py: 8 }}>
      <Paper
        elevation={0}
        sx={{
          p: 5,
          textAlign: 'center',
          maxWidth: 480,
          border: 1,
          borderColor: 'divider',
          borderStyle: 'dashed',
        }}
      >
        <ConstructionIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
        <Typography variant="h6" fontWeight={700} gutterBottom>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {phase}
        </Typography>
        <Typography variant="caption" color="text.disabled">
          {description}
        </Typography>
      </Paper>
    </Stack>
  );
}
