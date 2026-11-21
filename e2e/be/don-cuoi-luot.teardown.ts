// Teardown của project `be` (playwright.config.ts): chạy sau mọi spec BE thật, kể cả khi spec đỏ. Xoá công ty thử còn
// trong sổ (`soCongTyThu.ts`); còn công ty không xoá được thì lượt chạy đỏ.
import { test } from '@playwright/test';
import { donSo } from './soCongTyThu';

test('dọn công ty thử còn sót của lượt chạy', async () => {
  await donSo();
});
