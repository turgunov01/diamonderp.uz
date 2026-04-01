// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@pinia/nuxt',
    '@vueuse/nuxt'
  ],

  devtools: {
    // Keep Nuxt devtools for local dev; disable in production to save build memory.
    enabled: process.env.NODE_ENV !== 'production'
  },

  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    supabase: {
      url: import.meta.env.SUPABASE_URL || '',
      serviceRoleKey: import.meta.env.SUPABASE_SERVICE_ROLE_KEY || '',
      avatarBucket: import.meta.env.SUPABASE_AVATAR_BUCKET || 'customer-avatars',
      passportBucket: import.meta.env.SUPABASE_PASSPORT_BUCKET || 'customer-passports',
      documentTemplateBucket: import.meta.env.SUPABASE_DOCUMENT_TEMPLATE_BUCKET || 'document-templates',
      documentTemplateUploadBucket: import.meta.env.SUPABASE_DOCUMENT_TEMPLATE_UPLOAD_BUCKET || 'document-template-uploads',
      documentSignatureBucket: import.meta.env.SUPABASE_DOCUMENT_SIGNATURE_BUCKET || 'document-signatures',
      taskPhotoBucket: import.meta.env.SUPABASE_TASK_PHOTO_BUCKET || 'object-task-photos'
    },
    public: {
      supabaseUrl: import.meta.env.NUXT_PUBLIC_SUPABASE_URL || import.meta.env.SUPABASE_URL || '',
      supabaseAnonKey: import.meta.env.NUXT_PUBLIC_SUPABASE_ANON_KEY || ''
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
