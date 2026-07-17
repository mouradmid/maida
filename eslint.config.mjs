// Règles de qualité du code — communes aux deux applications.
// Le style (indentation, guillemets...) est du ressort de Prettier.
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dev-dist/**',
      'apps/api/src/generated/**',
      'apps/web/public/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Les paramètres volontairement ignorés commencent par _
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // catch {} vide autorisé quand l'échec est assumé (caches, best-effort)
      'no-empty': ['error', { allowEmptyCatch: true }],
      // declare global { namespace Express ... } est LA façon d'étendre les types Express
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Règle de l'ère React Compiler : elle interdit le pattern « charger les
      // données dans un useEffect au montage », qui est notre standard assumé
      // (pas de Suspense/framework de données ici).
      'react-hooks/set-state-in-effect': 'off',
    },
  },
);
