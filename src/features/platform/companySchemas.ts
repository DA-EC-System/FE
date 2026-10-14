import { z } from 'zod';

export const companySchema = z.object({
  name: z
    .string()
    .min(2, 'Tên công ty tối thiểu 2 ký tự')
    .max(200, 'Tên công ty tối đa 200 ký tự'),
  taxCode: z
    .string()
    .regex(/^[0-9\-]{10,14}$/, 'Mã số thuế 10-14 chữ số (có thể có dấu gạch ngang)'),
  status: z.enum(['active', 'locked']),
  lockReason: z.string().optional(),
});

export type CompanyFormValues = z.infer<typeof companySchema>;
