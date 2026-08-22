import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] },
    },
  },
  // Prettier tient la mise en forme : on désactive les règles de style qui
  // entreraient en conflit avec lui.
  prettier,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          // Autorise `const { champ: _, ...reste } = objet` pour retirer une clé.
          ignoreRestSiblings: true,
        },
      ],
      // Les composants d'une application (par opposition à une bibliothèque)
      // portent des noms d'écran : GameView, DartPad. Le nom composé n'apporte
      // rien ici.
      'vue/multi-word-component-names': 'off',
    },
  },
)
