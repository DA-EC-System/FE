// ESLint 9 (flat config), theo mẫu của Vite react-ts. Chạy: pnpm lint
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'playwright-report', 'test-results'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      // Hai luật cổ điển; bộ luật React Compiler của react-hooks 7 chưa bật
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // FE#247: useMutation chặn bấm đúp ở src/api/useMutation.ts
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@tanstack/react-query',
              importNames: ['useMutation'],
              message: "Dùng useMutation của '@/api/useMutation' (chặn bấm đúp, FE#247).",
            },
          ],
        },
      ],
      // FE#247: lời gọi trùng bị bỏ trả promise không bao giờ xong, toast.promise sẽ treo "đang tải" mãi
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='toast'][callee.property.name='promise']",
          message:
            "Không dùng toast.promise: useMutation bỏ lời gọi trùng bằng promise không bao giờ xong, toast sẽ treo 'đang tải'. Dùng await rồi toast.success/toast.error (FE#247).",
        },
      ],
    },
  },
  {
    // E2E, cấu hình chạy ngoài React
    files: ['e2e/**/*.ts', 'scripts/**/*.{ts,mjs,js}', '*.config.{ts,mjs,js}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // shadcn xuất kèm biến thể (buttonVariants, useSidebar…)
    files: ['src/components/ui/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
);
