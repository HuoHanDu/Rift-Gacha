import { defineConfig } from 'vitest/config'

// 只测纯逻辑层。core/ 不依赖 Vue / uni-app / DOM，所以跑在 node 环境即可。
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
