#!/usr/bin/env node
/**
 * 零依赖的静态服务器，用来在本地验证 `dist/build/h5` 的产物。
 *
 *   npm run serve:dist            # http://127.0.0.1:4180
 *   npm run serve:dist -- 9000    # 换端口
 *
 * 存在的意义是让「部署文档里的本地验证」不依赖任何额外包，
 * 也不必用 `vite preview`（那会连带跑一遍 uni 编译器）。
 */

import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'dist',
  'build',
  'h5',
)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

const port = Number(process.argv[2] ?? 4180)

if (!existsSync(ROOT)) {
  process.stderr.write(`找不到产物目录：${ROOT}\n请先执行 npm run build:h5\n`)
  process.exit(1)
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  let filePath = path.join(ROOT, decodeURIComponent(url.pathname))

  // 防目录穿越
  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403).end('Forbidden')
    return
  }

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html')
  }
  // hash 路由：未知路径一律回入口
  if (!existsSync(filePath)) {
    filePath = path.join(ROOT, 'index.html')
  }

  const type = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
  const immutable = url.pathname.startsWith('/assets/')
  response.writeHead(200, {
    'content-type': type,
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  createReadStream(filePath).pipe(response)
})

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`静态产物预览：http://127.0.0.1:${port}/（根目录 ${ROOT}）\n`)
})
