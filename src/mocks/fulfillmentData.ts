/**
 * Kiện (sơ đồ D2, FE#59) cho MSW. Seed sinh ở salesData cùng lúc chuyển đơn cũ sang mô hình kiện;
 * thay lô nhặt của FE#10.
 */

import { seedPackages, type MockPackage } from './salesData';

export type { MockPackage };

export const packages: MockPackage[] = seedPackages;
