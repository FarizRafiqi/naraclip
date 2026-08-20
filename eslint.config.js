import { configApp } from '@adonisjs/eslint-config'
import { react } from '@adonisjs/eslint-config/react'

export default [
  ...configApp(...react),
  {
    ignores: ['database/schema.ts'],
  },
  {
    rules: {
      // NaraClip intentionally uses direct Inertia URLs without a generated Tuyau registry.
      '@adonisjs/prefer-adonisjs-inertia-link': 'off',
      '@adonisjs/prefer-adonisjs-inertia-form': 'off',
      'react-hooks/set-state-in-effect': 'off',
      '@unicorn/filename-case': 'off',
    },
  },
]
