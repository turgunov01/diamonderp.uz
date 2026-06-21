// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@pinia/nuxt',
    '@vueuse/nuxt'
  ],

  hooks: {
    'imports:extend'(imports) {
      for (let index = imports.length - 1; index >= 0; index--) {
        const item: any = imports[index]
        const importedName = item?.as || item?.name

        if (importedName !== 'options' || typeof item?.from !== 'string') {
          continue
        }

        if (item.from.includes('@nuxt/ui') && item.from.includes('useResizable')) {
          imports.splice(index, 1)
        }
      }
    }
  },

  devtools: {
    // Keep Nuxt devtools for local dev; disable in production to save build memory.
    enabled: process.env.NODE_ENV !== 'production'
  },

  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    internalApiSecret: process.env.APP_INTERNAL_API_SECRET || '',
    database: {
      url: process.env.DATABASE_URL || '',
      host: process.env.POSTGRES_HOST || '',
      port: process.env.POSTGRES_PORT || '5432',
      name: process.env.POSTGRES_DATABASE || '',
      user: process.env.POSTGRES_USER || '',
      password: process.env.POSTGRES_PASSWORD || '',
      ssl: process.env.POSTGRES_SSL || ''
    },
    storage: {
      root: process.env.STORAGE_ROOT || '.data/storage',
      baseUrl: process.env.STORAGE_BASE_URL || '',
      avatarBucket: process.env.STORAGE_AVATAR_BUCKET || 'customer-avatars',
      passportBucket: process.env.STORAGE_PASSPORT_BUCKET || 'customer-passports',
      documentTemplateBucket: process.env.STORAGE_DOCUMENT_TEMPLATE_BUCKET || 'document-templates',
      documentTemplateUploadBucket: process.env.STORAGE_DOCUMENT_TEMPLATE_UPLOAD_BUCKET || 'document-template-uploads',
      documentSignatureBucket: process.env.STORAGE_DOCUMENT_SIGNATURE_BUCKET || 'document-signatures',
      taskPhotoBucket: process.env.STORAGE_TASK_PHOTO_BUCKET || 'object-task-photos'
    },
    public: {
      storageBaseUrl: process.env.NUXT_PUBLIC_STORAGE_BASE_URL || process.env.STORAGE_BASE_URL || '',
      storagePassportBucket:
        process.env.NUXT_PUBLIC_STORAGE_PASSPORT_BUCKET
        || process.env.STORAGE_PASSPORT_BUCKET
        || 'customer-passports'
    }
  },

  routeRules: {
    '/api/**': {
      cors: true
    }
  },

  compatibilityDate: '2024-07-11',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
