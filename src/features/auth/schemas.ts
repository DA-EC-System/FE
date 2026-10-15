import { z } from 'zod';
import { OPTIONAL_MODULES } from '@/utils/modules';

export const emailSchema = z.string().trim().toLowerCase().email('Email không hợp lệ');

/** Quy tắc mật khẩu mới (đăng ký, đổi mật khẩu). Cần chốt lại với BE#6. */
export const newPasswordSchema = z
  .string()
  .min(8, 'Mật khẩu tối thiểu 8 ký tự')
  .max(72, 'Mật khẩu tối đa 72 ký tự')
  .regex(/[A-Za-z]/, 'Mật khẩu cần có ít nhất một chữ cái')
  .regex(/\d/, 'Mật khẩu cần có ít nhất một chữ số');

/** Mã số thuế doanh nghiệp: 10 số, hoặc 13 số dạng 0123456789-001 (chi nhánh). */
export const taxCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{10}(-\d{3})?$/, 'Mã số thuế gồm 10 số, hoặc dạng 0123456789-001');

export const registerSchema = z
  .object({
    companyName: z.string().trim().min(2, 'Nhập tên công ty').max(200, 'Tên tối đa 200 ký tự'),
    taxCode: taxCodeSchema,
    fullName: z.string().trim().min(2, 'Nhập họ tên').max(100, 'Họ tên tối đa 100 ký tự'),
    email: emailSchema,
    password: newPasswordSchema,
    confirmPassword: z.string(),
    optionalModules: z.array(z.enum(OPTIONAL_MODULES)),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Mật khẩu nhập lại không khớp',
  });

export type RegisterForm = z.infer<typeof registerSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Nhập mật khẩu hiện tại'),
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Mật khẩu nhập lại không khớp',
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'Mật khẩu mới phải khác mật khẩu hiện tại',
  });

export type ChangePasswordForm = z.infer<typeof changePasswordSchema>;
