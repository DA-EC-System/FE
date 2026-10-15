import { forwardRef, useState } from 'react';
import { IconButton, InputAdornment, TextField, type TextFieldProps } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

/** Ô mật khẩu có nút hiện/ẩn; dùng được trực tiếp với `register()` của react-hook-form. */
export const PasswordField = forwardRef<HTMLInputElement, TextFieldProps>(function PasswordField(
  props,
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      fullWidth
      {...props}
      inputRef={ref}
      type={visible ? 'text' : 'password'}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton
              onClick={() => setVisible((v) => !v)}
              edge="end"
              aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              {visible ? <VisibilityOffIcon /> : <VisibilityIcon />}
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );
});
