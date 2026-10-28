import { z } from 'zod';

/** Câu báo lỗi mặc định của zod bằng tiếng Việt, cho các trường schema không tự đặt message */
z.config(z.locales.vi());
