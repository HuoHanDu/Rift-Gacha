# 峡谷全随机构筑器

[![build-and-deploy](https://github.com/HuoHanDu/Rift-Gacha/actions/workflows/deploy.yml/badge.svg)](https://github.com/HuoHanDu/Rift-Gacha/actions/workflows/deploy.yml)

> **在线地址：<https://lol.huohandu.cn/>** —— push 到 `main` 会自动跑测试、构建并发布。

一个用于《英雄联盟》召唤师峡谷的**娱乐向全随机构筑生成器**。输入人数和位置，一键随机出：

> 位置 · 英雄 · 两个召唤师技能 · 出门装 · 六件成装 + 一双鞋 · 主副系符文与详细点法 · 三个小符文

支持单人一把，也支持最多 10 人的双队（队长可以先分队，也可以让它随机分）。

数据取自官方公开接口的静态快照（`game.gtimg.cn`，即 101 数据站使用的同一批数据），图片实时热链官方 CDN。

> 非官方娱乐项目。数据版权归 Riot Games 与腾讯所有。

---

## 快速开始

```bash
npm ci
npm run dev:h5      # → http://localhost:5173/
```

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev:h5` | 启动 Web 开发服务器 |
| `npm run build:h5` | 构建产物到 `dist/build/h5` |
| `npm run build:mp-weixin` | 构建微信小程序产物到 `dist/build/mp-weixin` |
| `npm run serve:dist` | 零依赖静态服务器，预览构建产物（`:4180`） |
| `npm run test` | 跑随机引擎与渲染的单元测试 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run fetch:data` | 重新抓取官方数据，生成 `src/data/*.json` 快照 |
| `npm run sample -- 10` | 在终端打印一次随机结果，用来核对规则 |
| `pwsh scripts/deploy.ps1` | 构建并发布到线上（含上传校验与健康检查） |

## 目录

```
├── AGENTS.md            # 需求、已确认决策、项目约定（改代码前先看这个）
├── todo.md              # 开发规划与进度
├── docs/
│   ├── RULES.md         # 随机规则的实现权威规范
│   ├── ARCHITECTURE.md  # 分层、模块接口、未来接后端的接缝
│   ├── DATA.md          # 数据源、抓取口径、快照 schema
│   ├── DEPLOY.md        # 部署文档（含 CI/CD 方案对比）
│   └── MINIPROGRAM.md   # 微信小程序：可行性、依赖版本坑、上架待办
├── .github/workflows/   # GitHub Actions：构建 + 校验 + 发布
├── scripts/             # 构建期数据脚本 + 本地工具（不进运行时）
├── src/
│   ├── core/            # 纯逻辑层：随机引擎。不依赖 Vue / uni-app / DOM
│   ├── reveal/          # 揭幕动画：轮盘剧本 + 播放器状态机
│   ├── data/            # 构建期生成的快照（提交进仓库）
│   ├── components/      # 卡片与图标组件
│   └── pages/           # 页面
└── tests/               # 单元测试 + SSR 渲染冒烟测试
```

## 规则速览

完整规范见 `docs/RULES.md`，这里是给玩家看的版本：

- 任何英雄都可能出现在任何位置；多人时**英雄全场不重复**。
- 打野必带**惩戒**，其他位置默认不会随机到惩戒（页面上可关掉这条限制）。
- 辅助出门装固定**云游图鉴**，界面上展示成它的升级件（星界据守 / 圆梦使者 / 扎兹沙克的溃口 / 摩天雪橇 / 血鸣）；打野出门固定打野蛋。
- 成装是**六件传说装备 + 一双鞋**；中路任务完成后鞋子会显示升级款。
- 副系必须与主系不同；副系从 3 排小符文里随机选 2 排，每排 1 个。
- **海克斯科技闪现罗网**只有在「带了闪现」且「启迪是主系或副系」时才可能被随机到。

## 界面

- **按队伍排序**：双队模式下可以把结果按蓝队 / 红队分组显示。
- **揭幕动画**（默认关闭）：打开后按玩家逐个揭晓，顺序是 位置 → 英雄 → 召唤师技能 → 出门装 → 成装 + 鞋子 → 符文；同一段的格子同时开转、同时停下。点画面可以立刻揭晓当前这一段，右上角「跳过动画」直接出全部结果。

## 技术栈

uni-app（Vue 3 + Vite + TypeScript）。第一代目标是电脑 Web 端，代码结构对移动端友好，后续可复用同一份代码出小程序 / App。

## 部署

纯静态站点，没有后端。构建产物扔到 nginx、对象存储或任意静态托管即可，详见 `docs/DEPLOY.md`。
