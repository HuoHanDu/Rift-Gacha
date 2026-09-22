# 部署文档

> 目标：把这个项目部署成一个**纯静态站点**。
> 没有后端进程、没有数据库、没有密钥、没有运行时数据请求——构建产物扔到任何能发静态文件的地方就能用。
>
> **当前线上地址：<https://lol.huohandu.cn/>**（部署记录见第 1 节）

---

## 1. 线上部署现状（2026-09-22 实装）

| 项 | 值 |
| --- | --- |
| 域名 | `lol.huohandu.cn`（A 记录 → `58.87.93.111`） |
| 服务器 | `ssh tencent` → `58.87.93.111`，Ubuntu 22.04 LTS，nginx 1.18.0 |
| 站点根 | `/var/www/lol.huohandu.cn/current`（软链） |
| 版本目录 | `/var/www/lol.huohandu.cn/releases/<yyyyMMdd-HHmmss>/`，保留最近 5 个 |
| nginx 配置 | `/etc/nginx/sites-available/lol.huohandu.cn` → 软链到 `sites-enabled/` |
| TLS | Let's Encrypt，`/etc/letsencrypt/live/lol.huohandu.cn/`，到期 2026-12-20，已配置自动续期 |
| HTTP | 301 跳转到 HTTPS |
| 一键发布 | `pwsh scripts/deploy.ps1` |

沿用这台服务器上 `huohandu.cn` 已有的约定：**每个版本一个目录 + `current` 软链**，所以回滚不需要重新上传。

### 发布

```powershell
pwsh scripts/deploy.ps1                 # 构建 → 打包 → 上传 → 校验 → 切软链 → 健康检查
pwsh scripts/deploy.ps1 -SkipBuild      # 复用已有产物，只做发布
```

脚本会拦住这几类事故：

- 构建失败（`npm run build:h5` 非 0）
- 上传被截断（比对本地与远端 `sha256`）
- 少传文件（把 `dist/build/h5` 的文件清单与远端版本目录逐一对齐）
- 上线后打不开（`https://<域名>/` 与入口 HTML 里引用的每个 `src`/`href` 资源都要 200）

### 回滚

```bash
ssh tencent
ls -1dt /var/www/lol.huohandu.cn/releases/*/     # 找上一个版本
sudo ln -sfn /var/www/lol.huohandu.cn/releases/<时间戳> /var/www/lol.huohandu.cn/current
```

静态站点无状态，切软链即刻生效，不需要 reload nginx。

### 已验证的行为（线上实测）

```
https://lol.huohandu.cn/                → 200，TLS 校验通过，0.52s
http://lol.huohandu.cn/                 → 301 → https://lol.huohandu.cn/
/assets/index-*.js                      → 200，Content-Encoding: gzip，Cache-Control: immutable
/assets/不存在.js                        → 404（不会误回退成首页）
/whatever                               → 200（回退入口，配合 hash 路由）
```

---

## 2. 本机已验证 / 未验证

写文档的时候不能只写「应该可以」。下表说明每条命令的实际验证情况：

| 项 | 状态 |
| --- | --- |
| `npm ci`、`npm run fetch:data`、`npm run test`、`npm run typecheck`、`npm run build:h5` | ✅ 本机实跑通过 |
| `npm run serve:dist`（零依赖静态服务器，端口 4180） | ✅ 实测 200、缓存头正确、未知路径回退入口页 |
| `npm run preview:h5`（vite preview，端口 4173） | ✅ 实测 200 |
| 子路径部署（`h5.router.base`） | ✅ 实测产物资源路径随之变成 `/lol-random/assets/...` |
| nginx（第 5 节的配置） | ✅ 已实装到 `lol.huohandu.cn`，`nginx -t` 通过并正在承载线上流量 |
| `scripts/deploy.ps1` 全流程 | ✅ 实跑 2 次，含 sha256 校验、文件清单对齐、资源可达性检查 |
| Docker 镜像构建与运行 | ⚠️ **未验证**——本机装了 Docker CLI（v29.4.0）但 daemon 没运行，`docker build` 报 `failed to connect to the docker API`。容器化只是为了换环境部署方便，线上走的是静态文件 + nginx |

---

## 3. 构建产物

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

## 4. 本地验证产物

```bash
npm run serve:dist            # → http://127.0.0.1:4180/
npm run serve:dist -- 9000    # 换端口
```

这是项目自带的零依赖静态服务器（`scripts/serve-dist.mjs`），行为和生产环境的 nginx 一致：带哈希的 `/assets/*` 长缓存，`index.html` 不缓存，未知路径回退到入口页。

---

## 5. 部署到 nginx（推荐）

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

## 6. 部署到子路径

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

## 7. 部署到 Docker（本机未验证）

仓库里有 `Dockerfile`（多阶段：`node:22-alpine` 构建 → `nginx:1.27-alpine` 服务）与 `.dockerignore`。

```bash
docker build -t lol-random-build .
docker run -d --name lol-random -p 8080:80 --restart unless-stopped lol-random-build
# → http://localhost:8080/
```

镜像里只有静态文件与 nginx，没有 Node 运行时。

---

## 8. 部署到其它静态托管

产物是纯静态文件，以下都可以直接拖上去，无需任何配置：

- **Vercel / Netlify**：构建命令 `npm run build:h5`，发布目录 `dist/build/h5`。
- **GitHub Pages / Gitee Pages**：注意这类站点在子路径下（`/repo-name/`），**必须**按第 6 节改 `base`。
- **对象存储 + CDN**（OSS / COS / S3）：整目录上传，入口文件设为 `index.html`，把 `assets/` 的缓存时间设长、`index.html` 设短。

---

## 9. 数据刷新与发版流程

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

## 10. 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 页面全白 | 用 `file://` 直接打开 `index.html` 不行（ES module 会被 CORS 拦）。必须通过 HTTP 提供服务 |
| 图标全是首字占位块 | 浏览器取不到 `game.gtimg.cn`。检查用户侧网络/代理；内网部署需要在出口放通该域名 |
| 子路径下资源 404 | 没改 `h5.router.base`，见第 6 节 |
| 刷新后 404 | 不该发生（hash 路由）。若把路由改成了 history 模式，需要 `try_files ... /index.html` |
| 改了代码线上没变化 | `index.html` 是不缓存的，但如果你套了 CDN，记得刷新 CDN 上 `index.html` 的缓存 |
| 想固定某次随机结果 | 页面上的「种子」可复现：同一 seed + 同一份快照 + 同一份输入 ⇒ 同一份结果 |

---

## 11. 运维要点

- **无状态**：随时可以整目录替换，不需要灰度或迁移。
- **无密钥**：没有环境变量、没有 `.env`。
- **无第三方运行时依赖**：唯一的外部请求是浏览器的图片请求（官方 CDN）。
- **体积**：产物约 0.5 MB（不含图片），首屏只需 3 个文件。
- **合规**：项目是非官方娱乐工具，页面已标注数据来源与版权声明；不要把官方美术资源打包进镜像或仓库。

---

## 12. 让服务器自己拉取部署（CI / CD 方案）

问：能不能把代码传到 GitHub 或 Docker Hub，让服务器自己拉取部署？

**能，四条路都可行。** 目标服务器 `58.87.93.111` 已实测具备：`git`、`node`(npm)、`rsync`、`docker` + `docker compose v2.27.1`，且 **Docker Hub 可直连**，磁盘余量 25 GB。所以限制不在工具，而在「你想让谁承担构建」和「谁来触发」。

### 方案对比

| 方案 | 谁构建 | 触发方式 | 服务器需要什么 | 适合本项目的程度 |
| --- | --- | --- | --- | --- |
| **A. GitHub Actions 构建 + SSH 推送** | GitHub Runner | push tag / 手动 | 只要目标目录 + SSH key（**不需要 Node**） | ⭐ 推荐 |
| **B. 服务器 `git pull` + 本地构建** | 服务器 | cron / 手动 / webhook | Node + 完整源码 + 依赖安装 | 可行但重 |
| **C. Docker Hub / ghcr 镜像 + 定时拉取** | 本地或 CI | cron `compose pull && up -d` | Docker（已有） | 适合要跑多个实例 |
| **D. Watchtower 自动更新** | CI | 镜像更新即自动重启 | Docker + watchtower 容器 | 最自动，也最不可控 |

### A. GitHub Actions 构建 + SSH 推送（推荐）

**仓库里已经放好了：`.github/workflows/deploy.yml`。** 逻辑与 `scripts/deploy.ps1` 完全一致，只是把「本机构建」换成 runner 构建。它的结构是：

- `verify` job（每次 push / PR）：`npm ci` → `npm run typecheck` → `npm run test` → `npm run build:h5` → 检查产物非空且数据快照确实打进了 JS → 上传 artifact。
- `deploy` job（非 PR 时）：下载 artifact → 比对本地与远端 sha256 → 解到 `releases/<时间戳>/` → 切 `current` 软链 → 清理旧版本 → 健康检查（首页 200 + 入口 HTML 引用的每个资源 200）。

**服务器上不需要装 Node**——构建在 GitHub Runner 上完成，服务器只收一个约 90KB 的 tar。CI 也是自足的：数据快照 `src/data/*.json` 是提交进仓库的，所以构建过程不访问 `game.gtimg.cn`。

要做的只有两件事：

1. 把仓库推到 GitHub。
2. 在 `Settings → Secrets and variables → Actions` 配 4 个 secrets：

| Secret | 值 |
| --- | --- |
| `SSH_HOST` | `58.87.93.111` |
| `SSH_USER` | `ubuntu` |
| `SSH_KEY` | **专用部署私钥**（下面生成），不要用你自己的登录私钥 |
| `SSH_KNOWN_HOSTS` | `ssh-keyscan -p 22 58.87.93.111` 的输出 |

生成专用部署密钥：

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ./deploy_key -N ""
# 公钥追加到服务器（这一步需要你自己的登录权限）
ssh tencent 'cat >> ~/.ssh/authorized_keys' < ./deploy_key.pub
# 私钥内容整段粘进 SSH_KEY secret，然后删掉本地私钥
rm ./deploy_key
```

> ⚠️ 该服务器上 `ubuntu` 用户有**免密 sudo**，所以这把私钥等价于服务器写权限。只放进 repo secrets，不要复用、不要提交。

> 手头没有 Node 或想在本机直接发，用 `pwsh scripts/deploy.ps1` 也是一样的效果。

> 若仓库是私有的，GitHub 侧要确认没有把 `src/data/*.json` 加进 `.gitignore`——快照是**入库**的，构建不依赖网络抓取。

### B. 服务器 `git pull` + 构建

```bash
# 服务器上
cd /srv && git clone <repo> lol && cd lol
npm ci && npm run build:h5
# 然后同样切 releases/current 软链
```

配一条 cron 或 systemd timer 定时执行。代价：服务器上要有完整 `node_modules`（本项目 ~500 个包），每次发版都要在服务器上跑一遍构建。**本项目产物才 90 KB、构建只要几秒**，所以更推荐在本地或 CI 构建完再推。

### C. Docker Hub / ghcr 镜像 + 定时拉取

`Dockerfile` 已经写好（多阶段：`node:22-alpine` 构建 → `nginx:1.27-alpine` 服务）。

```bash
# 本地或 CI
docker build -t <user>/lol-random:latest .
docker push <user>/lol-random:latest

# 服务器
docker run -d --name lol-random -p 8081:80 --restart unless-stopped <user>/lol-random:latest
```

**这里有个必须注意的坑**：服务器 80/443 已经被**宿主机 nginx** 占着（它还托管着 `huohandu.cn`、`dsh.huohandu.cn` 等 7 个站点）。所以容器不能再抢 80，只有两条路：

1. 容器映射到 8081，宿主 nginx 用 `proxy_pass http://127.0.0.1:8081;` 转发 —— 简单，但多一跳；
2. 容器接入宿主 nginx 所在的 docker 网络，由 nginx 直接 `proxy_pass http://lol-random:80;` —— 少一跳，但要改现有网络拓扑。

**对当前这个纯静态站点，容器化其实没有收益**：产物就是 5 个静态文件，用宿主 nginx 直接发比多跑一个容器更省资源，也不用改现有网络。除非你打算在同一台机器上跑多个版本或做蓝绿发布，否则建议留在方案 A。

### D. Watchtower 自动更新

```bash
docker run -d --name watchtower --restart unless-stopped \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower --interval 300 lol-random
```

镜像一更新，容器自动重启。最省事，但也意味着**一次有问题的 push 会自动上线**——对娱乐站点可以接受，前提是 CI 里先跑通 `npm run test`。

### 结论

- **想要「推代码就自动上线」** → 方案 A（GitHub Actions + SSH），服务器零 Node 依赖，且 CI 里能先跑测试拦一道。
- **想要「服务器自己拉」** → 方案 B（git pull）能跑，但对这个体量是过度设计。
- **想要容器化** → 方案 C 可行，但注意 80/443 冲突，且对本项目没有实际收益。
- 无论选哪个，`releases/<时间戳> + current 软链` 的目录约定都保持不变，回滚依旧是切一条软链。
