import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// uni-app 的内置组件在 SSR 测试里当作自定义元素处理，避免「未解析组件」告警。
const UNI_TAGS = new Set(['view', 'text', 'image', 'input', 'scroll-view', 'picker'])

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => UNI_TAGS.has(tag),
        },
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
