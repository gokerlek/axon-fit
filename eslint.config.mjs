import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * ESLint (düz yapılandırma). Next 16'da `next lint` kalktı; `npm run lint` doğrudan `eslint .` çalıştırır
 * (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/03-eslint.md`). Kurallar Next'in önerdiği
 * takımlar: Core Web Vitals ve TypeScript.
 */
export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      // Kullanılmayan değişken: yapı bozmayla atılan alanlar (`{ skip: _skip, ...rest }`) alt çizgiyle başlar.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    // shadcn kaydından gelen bileşenler (`npx shadcn add`) olduğu gibi kalır; yeniden eklenince üzerine yazılır.
    files: ['src/components/ui/**'],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  globalIgnores([
    // eslint-config-next'in varsayılanları:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Bağımlılıklar, yerel çalışma kopyaları ve araç durumu:
    'node_modules/**',
    '.claude/**',
    '.omc/**',
    'public/**',
  ]),
]);
