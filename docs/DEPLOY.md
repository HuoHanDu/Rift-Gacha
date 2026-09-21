# 部署文档

> 目标：把这个项目部署成一个**纯静态站点**。
> 没有后端进程、没有数据库、没有密钥、没有运行时数据请求——构建产物扔到任何能发静态文件的地方就能用。

---

## 0. 本机已验证 / 未验证

写文档的时候不能只写「应该可以」。下表说明每条命令的实际验证情况：

| 项 | 状态 |
| --- | --- |
| `npm ci`、`npm run fetch:data`、`npm run test`、`npm run typecheck`、`npm run build:h5` | ✅ 本机实跑通过 |
| `npm run serve:dist`（零依赖静态服务器，端口 4180） | ✅ 实测 200、缓存头正确、未知路径回退入口页 |
| `npm run preview:h5`（vite preview，端口 4173） | ✅ 实测 200 |
| 子路径部署（`h5.router.base`） | ✅ 实测产物资源路径随之变成 `/lol-random/assets/...` |
| nginx 配置 | ⚠️ **未在本机验证**——本机没有 nginx。配置是常规写法，但要按常见问题那一节自查 |
| Docker 镜像构建与运行 | ⚠️ **未在本机验证**——本机装了 Docker CLI 但 daemon（Docker Desktop）没运行。命令按标准写法给出 |

---

## 1. 构建产物

```bash
npm ci                 # 或 npm install
npm run fetch:data     # 可选：只在需要刷新数据快照时跑
npm run build:h5
```

产物在 **`dist/build/h5/`**：

```
dist/build/h5/
├── index.html                       # 入口，893 B
├── assets/
│   ├── index-<hash>.js              # 运行时 + 页面框架（约 140 KB）
│   ├── pages-index-index-<hash>.js  # 首页 + 随机引擎 + 数据快照（约 180 KB）
│   ├── index-<hash>.css
│   └── uni.<hash>.css
└── static/
```

几个要点：

- **数据快照是打进 JS 的**，运行时不会去请求 `game.gtimg.cn` 的 JSON。已验证产物里能搜到「无尽之刃」「海克斯科技闪现罗网」「风行狐幼体」等字符串。
- **图片全部是外链** `https://game.gtimg.cn/...`，由浏览器直连官方 CDN。所以：站点本身很小，但**用户必须能访问 `game.gtimg.cn`**。图标取不到时会退化成带首字的占位块，页面不会崩。
- **路由是 hash 模式**（`src/manifest.json` 里 `h5.router.mode = "hash"`），所以服务端永远只看到 `/`，不需要 history 回退配置。

---

## 2. 本地验证产物

```bash
npm run serve:dist            # → http://127.0.0.1:4180/
npm run serve:dist -- 9000    # 换端口
```

这是项目自带的零依赖静态服务器（`scripts/serve-dist.mjs`），行为和生产环境的 nginx 一致：带哈希的 `/assets/*` 长缓存，`index.html` 不缓存，未知路径回退到入口页。

---

## 3. 部署到 nginx（推荐）

```bash
# 在构建机
npm ci && npm run build:h5
# 上传产物
rsync -av --delete dist/build/h5/ user@server:/var/www/lol-random/
```

服务器上的站点配置（`/etc/nginx/conf.d/lol-random.conf`）：

```nginx
server {
    listen 80;
    server_name your.domain.com;

    root /var/www/lol-random;
    index index.html;

    gzip on;
    gzip_min_length 1024;
    gzip_types text/css application/javascript application/json image/svg+xml;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
nginx -t && systemctl reload nginx
```

仓库根目录的 `nginx.conf` 就是这份配置（Docker 镜像用的也是它）。

HTTPS 用 certbot 一行搞定：`certbot --nginx -d your.domain.com`。

---

## 4. 部署到子路径

要把站点放在 `https://your.domain.com/lol-random/` 下，**必须改 base**，否则 `/assets/*` 会 404。

编辑 `src/manifest.json`：

```json
{
  "h5": {
    "title": "峡谷全随机构筑器",
    "router": {
      "mode": "hash",
      "base": "/lol-random/"
    }
  }
}
```

重新构建后，产物里的资源路径会变成 `/lol-random/assets/...`（已实测）。nginx 侧：

```nginx
location /lol-random/ {
    alias /var/www/lol-random/;
    try_files $uri $uri/ /lol-random/index.html;
}
```

---

## 5. 部署到 Docker（未在本机验证）

仓库里有 `Dockerfile`（多阶段：`node:22-alpine` 构建 → `nginx:1.27-alpine` 服务）与 `.dockerignore`。

```bash
docker build -t lol-random-build .
docker run -d --name lol-random -p 8080:80 --restart unless-stopped lol-random-build
# → http://localhost:8080/
```

镜像里只有静态文件与 nginx，没有 Node 运行时。

---

## 6. 部署到其它静态托管

产物是纯静态文件，以下都可以直接拖上去，无需任何配置：

- **Vercel / Netlify**：构建命令 `npm run build:h5`，发布目录 `dist/build/h5`。
- **GitHub Pages / Gitee Pages**：注意这类站点在子路径下（`/repo-name/`），**必须**按第 4 节改 `base`。
- **对象存储 + CDN**（OSS / COS / S3）：整目录上传，入口文件设为 `index.html`，把 `assets/` 的缓存时间设长、`index.html` 设短。

---

## 7. 数据刷新与发版流程

数据快照提交在仓库里（`src/data/*.json`），**不会自动更新**。游戏出新版本时：

```bash
npm run fetch:data    # 重新抓取并校验，覆盖 src/data/
npm run test          # 口径变了的话这里会先炸
npm run build:h5
```

`fetch:data` 的校验分两级（详见 `docs/DATA.md` §4）：

- **结构性不变量**不满足 → 脚本非 0 退出、**保留旧快照不覆盖**。
- 装备/英雄条数这类随版本变化的量 → 只打印新旧差异，不失败。

如果它失败了，说明官方数据结构或口径变了，需要人工看：改 `scripts/lib/normalize.mjs` 里的 `SPEC` 常量，并同步 `docs/DATA.md` 与 `docs/RULES.md`。

页面右下角的「补丁 <版本>」徽标就是快照的版本，可用来确认线上跑的是哪一版数据。

---

## 8. 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 页面全白 | 用 `file://` 直接打开 `index.html` 不行（ES module 会被 CORS 拦）。必须通过 HTTP 提供服务 |
| 图标全是首字占位块 | 浏览器取不到 `game.gtimg.cn`。检查用户侧网络/代理；内网部署需要在出口放通该域名 |
| 子路径下资源 404 | 没改 `h5.router.base`，见第 4 节 |
| 刷新后 404 | 不该发生（hash 路由）。若把路由改成了 history 模式，需要 `try_files ... /index.html` |
| 改了代码线上没变化 | `index.html` 是不缓存的，但如果你套了 CDN，记得刷新 CDN 上 `index.html` 的缓存 |
| 想固定某次随机结果 | 页面上的「种子」可复现：同一 seed + 同一份快照 + 同一份输入 ⇒ 同一份结果 |

---

## 9. 运维要点

- **无状态**：随时可以整目录替换，不需要灰度或迁移。
- **无密钥**：没有环境变量、没有 `.env`。
- **无第三方运行时依赖**：唯一的外部请求是浏览器的图片请求（官方 CDN）。
- **体积**：产物约 0.5 MB（不含图片），首屏只需 3 个文件。
- **合规**：项目是非官方娱乐工具，页面已标注数据来源与版权声明；不要把官方美术资源打包进镜像或仓库。
