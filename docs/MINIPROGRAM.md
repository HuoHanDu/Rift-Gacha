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

小程序有官方广告组件 `<ad>`（Banner / 视频 / 格子），据官方 `ad` 组件文档：

- `unit-id` 是必填项，**需要在 `mp.weixin.qq.com` 后台的「流量主」模块新建广告单元**才能拿到；
- 官方错误码表里明确列了：`1005 广告组件审核中`、`1006 广告组件被驳回`、`1007 广告能力已经被封禁`、`1008 广告单元已关闭`；
- 官方还提示「广告不是每一次都会出现」（错误码 1004 无适合的广告），**开发者必须做形态兼容**；
- `ad` 组件**不支持 `bind:tap` 等触摸事件**，且「无广告展示时不占高度」。

也就是说：`<ad unit-id="...">` 写进代码很容易，但**拿到 `unit-id` 需要先开通流量主**，而广告位本身还要过审核。

微信还有 `<ad-custom>`（原生模板广告）、`<reward>` 等其它形态，本项目这种「点一下出一个结果」的形态，比较自然的落点是 **Banner 放结果区下方**。

---

## 3. 已核实：图片域名

官方 `image` 组件文档里，`src` 只标注为「图片资源地址」，**没有列出域名白名单要求**；需要配置服务器域名的是 `wx.request` / `wx.downloadFile` / `wx.uploadFile` / socket 这类**接口调用**。

本项目小程序端只用 `<image>` 加载 `game.gtimg.cn` 的图标，属于前者。所以理论上不需要配域名白名单——**但这条我只有文档依据，没有真机验证**，请在开发者工具里确认一次。

---

## 4. 我的判断，未核实（上架前必须自己确认）

以下几条我**没能核实**（本机的联网检索接口配额用尽，只查到了官方组件文档，没查到运营规范与审核细则），属于我需要标注清楚的判断：

1. **IP / 类目风险（最大的一条）**
   这个工具大量使用 Riot / 腾讯的官方英雄、装备、符文美术资源，并且是《英雄联盟》的衍生工具。小程序审核对「未获授权的第三方 IP」通常比 H5 站点敏感得多（H5 你部署在自己域名下，风险自担；小程序是**提审制**）。我的判断是**存在被驳回的实际风险**，建议上架前先确认两点：走什么类目、以及是否需要在页面上进一步弱化 IP 关联（例如减少官方美术资源占比）。

2. **流量主开通条件**
   个人主体能否开通流量主、需要多少累计独立访客，这类门槛是**会变的政策**，我没有查到当前口径。请以 `mp.weixin.qq.com` 后台的流量主页面说明为准。

3. **uni-app 侧的广告封装**
   uni-app 除了直接写 `<ad>`，还有一个叫 uni-ad 的聚合方案（支持 App / 小程序 / Web）。我没有核实它当前对小程序的接入方式与分成政策，需要时再查。

4. **交互需要改造**
   当前卡片资料卡是**纯 CSS `:hover`**（见 `docs/ARCHITECTURE.md` §5）。小程序没有 hover，必须改成点击展开。这条已经记在 `todo.md` 的 P6 里。

---

## 5. 建议的顺序

1. **先确认第 4 节的第 1 条**（类目与 IP 风险）。如果这一步过不去，后面都白做。
2. 确认可以做之后，再做 P6 的移动端适配（触控交互、布局断点）——**H5 移动端和小程序可以一起做**，因为都是窄屏。
3. 然后才是广告：先开通流量主、建广告单元拿 `unit-id`，再在结果区下方插 `<ad>`，并处理「无广告时不占高度」的兼容。
4. 最后接 `miniprogram-ci` 做自动上传（可选，与 GitHub Actions 配合）。

---

## 6. 相关命令

```bash
npm run dev:mp-weixin      # 开发（产物持续输出到 dist/dev/mp-weixin）
npm run build:mp-weixin    # 构建生产产物
```

构建后打开微信开发者工具 → 导入项目 → 选择 `dist/build/mp-weixin`。
注意 `src/manifest.json` 里的 `mp-weixin.appid` 目前是空的，正式预览/上传前要填上自己的小程序 AppID。
