# 微信小程序：可行性与待办

> 结论先说：**能构建，我用当前代码实测通过了。** 但「能构建」不等于「能上架」——上架前还有几件事要处理，其中一件风险不低。
>
> 本文区分「**已核实**」（我实际跑过或查了官方文档）与「**我的判断，未核实**」两种情况，请按标注取用。

---

## 1. 已核实：构建能通过

```bash
npm run build:mp-weixin      # → dist/build/mp-weixin
```

实测产物（2026-09-22）：

```
dist/build/mp-weixin/
├── app.js / app.json / app.wxss
├── project.config.json
├── common/vendor.js              69 KB
├── pages/index/index.{js,json,wxml,wxss}
├── components/BuildCard.{js,json,wxml,wxss}
├── components/IconChip.{js,json,wxml,wxss}
├── core/*.js                     （随机引擎原样搬过去）
├── reveal/*.js                   （揭幕动画状态机原样搬过去）
└── data/index.js                 108 KB（数据快照）
```

主包体积约 190 KB，远低于小程序 2 MB 主包上限。用微信开发者工具「导入项目」指向 `dist/build/mp-weixin` 即可预览。

**这说明 `src/core/` 与 `src/reveal/` 的分层是有效的**——两层都不碰 DOM 和 uni-app API，所以原样编译成了小程序代码，一行没改。

### 踩到的坑：依赖版本组合（这是真实卡住过一次的问题）

我最初手写 `package.json` 骨架时把 `vue` 写成了 `^3.4.21`，并且精确 pin 了 `@vue/server-renderer: 3.4.21`。结果是：

- **H5 能构建**——Vite 用 esbuild 预打包，对「导入了不存在的具名导出」是宽松的；
- **小程序构建失败**——小程序的产物走 Rollup，对同一件事是**严格报错**的：

```
"isInSSRComponentSetup" is not exported by "node_modules/vue/dist/vue.runtime.esm-bundler.js",
imported by "node_modules/@dcloudio/uni-app/dist/uni-app.es.js"
```

根因不是「Vue 太老」这么简单，而是**版本组合不一致**：

- 整个 `@dcloudio/*@3.0.0-5020620260917001` 套件把 `@vue/shared` 锁在 **3.4.21**（`@dcloudio/uni-app`、`uni-h5`、`uni-cli-shared`、`vite-plugin-uni` 等都依赖它）；
- 而 `@dcloudio/uni-app` 自己编译出来的 ESM 又需要 **3.5 才有的导出**（`isInSSRComponentSetup`）；
- 只把 `vue` 单独升到 3.5.43 会更糟：`@vue/runtime-core@3.5.43` 要 `@vue/shared` 的 `normalizeCssVarValue`，而顶层 hoist 的 `@vue/shared` 还是 3.4.21 → 换一个错继续炸。

**正确做法是显式钉住整套 Vue 版本**，让 npm 把 3.5.43 的 `@vue/shared` 嵌套到各 Vue 包下面，而 `@dcloudio/*` 继续用顶层的 3.4.21：

```json
"dependencies": {
  "vue": "3.5.43"
},
"devDependencies": {
  "@vue/runtime-core": "3.5.43",
  "@vue/server-renderer": "3.5.43"
}
```

改完 `rm -rf node_modules package-lock.json && npm install`，两个平台同时构建通过。**关键是别用 `^`，三个 Vue 包版本必须完全一致。**

> 复现验证：`npm ci` 之后 `typecheck`（0 错）、`test`（112 用例）、`build:h5`、`build:mp-weixin` 全部通过。

---

## 2. 已核实：广告能力存在，但有门槛

### 2.1 微信自带流量主广告（wx 广告）

`<ad>` 组件（Banner / 视频 / 格子），据官方 [`ad` 组件文档](https://developers.weixin.qq.com/miniprogram/dev/component/ad.html)：

- `unit-id` 必填，**需要在 `mp.weixin.qq.com` 后台的「流量主」模块新建广告单元**才能拿到；
- 官方错误码表明确列了 `1005 广告组件审核中`、`1006 广告组件被驳回`、`1007 广告能力已经被封禁`、`1008 广告单元已关闭`；
- 官方提示「广告不是每一次都会出现」（`1004`），**开发者必须做形态兼容**；
- `ad` 组件**不支持 `bind:tap` 等触摸事件**，且「无广告展示时不占高度」。

**开通门槛（一手来源：[腾讯广告平台 · 小程序流量主开通流程](https://ad.weixin.qq.com/docs/50)）**，满足任一条件即可申请：

> **条件一**：小程序累计独立访客 (UV) 达到 **500 人及以上**，无刷粉行为且未曾有严重违规记录。
> **条件二**：若同公司主体名下已有小程序，且该小程序满足上述条件一、持续 1 个季度、有变现历史、不存在流量主违规记录。

申请路径：微信公众平台 → 左侧栏「推广-流量主」→ 开通流量主 → 同意协议 → 提交。开通后要及时补财务资料，否则影响结算。

> ⚠️ **来源冲突**：DCloud 的 uni-ad 文档写的是「微信申请流量主需要小程序**日活过千**」。两个数字对不上——腾讯自家广告平台的 `ad.weixin.qq.com/docs/50` 是**一手来源**（且给的是**累计 UV 500**，比日活 1000 低得多），DCloud 那页更像宣传口径。**以微信后台实际显示的为准**，但别因为 DCloud 说 1000 就以为门槛很高。

### 2.2 uni-ad（DCloud 的聚合方案）

据 [uni-ad 微信小程序广告文档](https://uniapp.dcloud.net.cn/uni-ad/ad-weixin.html)（**uni-app 3.4.10+ 支持**）：

| | uni-ad 广告 | 微信流量主广告（wx 广告） |
| --- | --- | --- |
| 申请 | 在 `uniad.dcloud.net.cn` 申请，与 DCloud 开票结算 | 微信小程序后台申请，与微信开票结算 |
| 全端 | App / Web / 微信小程序一套代码变现 | 仅微信小程序 |
| 广告类型 | banner / 激励视频 / 插屏 | 多一个开屏 |
| 结算 | 可申请更短结算周期与垫资 | — |
| 组件属性 | `adpid` | `unit-id` |

代码上的关键细节：

- `<ad>`（banner/信息流）**同时支持两者**，`adpid` 优先级高于 `unit-id`；没开通 uni-ad 或网络失败会切到 wx 广告，**切换有 3 秒间隔**。
- `<ad-rewarded-video>`（激励视频）与 `<ad-interstitial>`（插屏）**仅支持 uni-ad**；要用 wx 广告的激励视频/插屏得走 JS API 而不是组件。
- uni-ad 需要**在小程序插件配置里引入 uni-ad 微信小程序插件**。
- 微信小程序平台**暂不提供测试广告位**，开发期间也得真机预览。

本项目的形态（点一下出一个结果）比较自然的落点是 **Banner 放结果区下方**。

---

## 3. 已核实：图片域名

官方 `image` 组件文档里，`src` 只标注为「图片资源地址」，**没有列出域名白名单要求**；需要配置服务器域名的是 `wx.request` / `wx.downloadFile` / `wx.uploadFile` / socket 这类**接口调用**。

本项目小程序端只用 `<image>` 加载 `game.gtimg.cn` 的图标，属于前者。所以理论上不需要配域名白名单——**但这条我只有文档依据，没有真机验证**，请在开发者工具里确认一次。

---

## 4. 已核实：审核规则里与本项目直接相关的几条

来源：[微信小程序平台常见拒绝情形](https://developers.weixin.qq.com/miniprogram/product/reject.html)（官方）。

| 条款 | 原文要点 | 对本项目意味着什么 |
| --- | --- | --- |
| 1.1(1) | 名称、简介、logo、服务标签**不得侵犯他人权益（著作权、商标权等）**，包括「使用或包含不属于该小程序主体的品牌或商标、标识等内容」 | **这是最大的风险点**。小程序**名称/简介/logo**里不要出现「英雄联盟」「LOL」「League of Legends」等不属于你的商标。仓库名用了 `Rift-Gacha` 而不是 `lol-*`，就是这个原因 |
| 2.1.3 | **一旦选择了游戏类目，该类目将不可修改变更为其他类目** | 选类目前要想清楚，**不可逆** |
| 3.1.5 | 功能应具有使用价值，**不能过于简单**（示例：只有一个页面，只有一个按钮） | 我们确实就是**一个页面**。虽然实际有输入区/多人/动画，但审核员视角可能觉得单薄——建议补一点内容（历史记录、分享卡片、帮助说明） |
| 3.2.2 | 页面主要为营销或广告用途，或**广告展示比例超过 50%、广告遮挡功能**，会被拒 | 广告只能克制地放，别铺满 |
| 3.2.4 | 页面**不能存在测试类内容**（示例：算命、抽签、星座运势等） | 本工具是「随机抽构筑」，属于游戏内容工具而非占卜运势，我判断不适用这条；但「抽」这个动作要避免在名称/文案上往「测试/运势」靠 |

> ⚠️ 需要说清的是：**上表是规则原文，但「审核尺度」是主观的**。规则没写「不能用游戏 IP 的美术资源」，然而 1.1(1) 的「不属于该小程序主体的品牌、标识」是一条**兜底条款**，审核员有裁量空间。我**没有找到**任何「某 LoL 衍生小程序因美术资源被拒」的公开判例，所以**无法预判实际结果**——这一条仍然是不可消除的不确定性，只能靠提审试出来。

---

## 5. 其它待办（不是阻塞项）

1. **交互改造**：当前卡片资料卡是**纯 CSS `:hover`**（见 `docs/ARCHITECTURE.md` §5）。小程序没有 hover，必须改成点击展开。已记在 `todo.md` 的 P6。
2. **`src/manifest.json` 的 `mp-weixin.appid` 还是空的**，正式预览/上传前要填自己的小程序 AppID。
3. 规则原文里还提到「小程序名称不能以通用游戏名称类命名」、logo 不得含腾讯/微信官方标识——起名和做图标时注意。


---

## 6. 建议的顺序

1. **先确认第 4 节里 `1.1(1)` 这条兜底条款的实际尺度**（品牌/商标/标识）。如果这一步过不去，后面都白做。
2. 确认可以做之后，再做 P6 的移动端适配（触控交互、布局断点）——**H5 移动端和小程序可以一起做**，因为都是窄屏。
3. 然后才是广告：先开通流量主（累计 UV ≥ 500）、建广告单元拿 `unit-id`，再在结果区下方插 `<ad>`，并处理「无广告时不占高度」的兼容。
4. 最后接 `miniprogram-ci` 做自动上传（可选，与 GitHub Actions 配合）。

---

## 7. 相关命令

```bash
npm run dev:mp-weixin      # 开发（产物持续输出到 dist/dev/mp-weixin）
npm run build:mp-weixin    # 构建生产产物
```

构建后打开微信开发者工具 → 导入项目 → 选择 `dist/build/mp-weixin`。
注意 `src/manifest.json` 里的 `mp-weixin.appid` 目前是空的，正式预览/上传前要填上自己的小程序 AppID。
