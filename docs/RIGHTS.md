# 第三方权利与合规

> **重要**：这不是法律意见，我不是律师。本文只是把**官方政策的原文条款**摘出来，说明它们对本项目的具体要求，以及我们据此做了什么。
>
> 政策会变，做商业化决定前请自己再读一遍原文：<https://www.riotgames.com/en/legal>

---

## 1. 适用范围

本项目用了两类不属于我们的东西：

| 内容 | 权利人 | 我们怎么用 |
| --- | --- | --- |
| 英雄头像、装备图标、符文图标、召唤师技能图标 | Riot Games（腾讯在中国大陆代理） | `<image>` **热链**官方 CDN，不落盘、不打包进仓库 |
| 英雄/装备/符文的名称与数值说明 | 同上 | 构建期抓成 JSON 快照，**随仓库分发** |
| 符文结构与文案（交叉校验用） | Riot（CommunityDragon 公开数据） | 仅构建期校验，不进产物 |

**我们自己写的**：全部代码、随机规则、界面、文档。

---

## 2. Riot 同人政策（"Legal Jibber Jabber"）关键条款

来源：<https://www.riotgames.com/en/legal>，文中标注 **Last Updated: August 2018**。

### §1 授权范围

> Riot grants you a personal, non-exclusive, non-sublicenseable, non-transferable, **revocable**, limited license ... strictly for **noncommercial** (except as specifically provided below) community use.

要点：许可是**可撤销的**，Riot 保留"随时、无需理由"拒绝任何项目使用的权利。

### §2 禁止商业项目（三个例外）

> You may not create commercial Projects ... without a written license agreement from us. We have only three exceptions.
>
> **Exception 1: Ad Revenue** — We permit individual players to promote their Projects on **websites, streams, or videos** and passively generate revenue through appropriate advertisements...

**这是本项目唯一可能适用的例外**，但注意它的措辞只列了 `websites, streams, or videos`。

### §3 禁止未授权的游戏与应用 ← **对本项目影响最大**

> We prohibit the use of our IP in **games and apps**. Please do not take any part of our IP (e.g., character appearance, character abilities, maps, icons, items, etc.) and use it in a game or app. To be super clear: we do not allow any Projects on the **Apple Store or Google Play Store** unless they have either a written license agreement from us or a valid Riot API key...

它把「icons, items」明确列为 IP，并把**应用形态**整体排除在授权之外。

### §5 禁止使用商标与标识

> you may not use any of our logos or trademarks anywhere in your Project or on any website, advertising material, video, or other publication. You may not register **domain names**, social media accounts, or similar stuff that uses Riot Games or any of our trademarks, trade names, character names, etc. **You may not use our trademarks or names related to our IP as keywords or internet search tags.**

### §6 必须包含的声明

> If you share your Project with others, please **conspicuously** include the following notice:

```
[The title of your Project] was created under Riot Games' "Legal Jibber Jabber" policy
using assets owned by Riot Games.  Riot Games does not endorse or sponsor this project.
```

### §7 Riot 可以使用你的项目

> you agree that we may use, copy, modify, distribute, and make derivative works of your Project ... without having to credit you, pay you anything, or obtain your approval.

---

## 3. 我们据此做了什么

| 要求 | 落地 |
| --- | --- |
| §6 醒目声明 | `src/core/constants.ts` 的 `RIOT_FAN_NOTICE`，渲染在页面页脚（样式比周围文字更显眼），README 里也有。**英文原样保留，不翻译不改写。** `tests/render.test.ts` 有断言守着，防止以后被误删 |
| §5 商标 | 仓库名 `Rift-Gacha` 不直接使用 Riot 商标；**GitHub topics 不得包含 `league-of-legends` / `lol` / `summoners-rift` 等商标或 IP 相关词** |
| §3 应用形态 | 见下一节 |
| 非商业 | 项目本身不收费、没有付费墙；详见 §5 |

---

## 4. 微信小程序：政策上的实质障碍

Riot 政策 §3 把 **games and apps** 整体排除在授权之外（并点名 App Store / Google Play），而 §2 的广告豁免只列了 `websites, streams, or videos`。

**微信小程序是一种应用形态**，既不属于 §2 列举的 website/stream/video，又落在 §3「apps」的范围内。所以：

- H5 站点（`rift.huohandu.cn`）是 **website**，在 §2 例外的字面范围内；
- **微信小程序不在豁免的字面范围内**，而且 §3 是明确禁止条款。

我的判断（**推断，不是政策原文**）：小程序形态**存在被 Riot 主张侵权的风险**，而且一旦在小程序里挂广告变现，风险会进一步上升——因为商业化正是政策收紧的核心。

微信那边也一样：审核规则 `1.1(1)` 是「不得包含不属于该主体的品牌、商标、标识」的兜底条款。

**结论**：如果你要拿这个课设去小程序上架并挂广告，请把上面两条风险当成**真实的项目风险**来评估，别只看技术可行性。技术上我实测能构建（见 `docs/MINIPROGRAM.md`），但那和政策许可是两件事。

> 稳妥的替代路径：**只做 H5**，用 §2 Exception 1 的广告豁免（网站形态），这在小程序之外是政策明文允许的。

---

## 5. 关于变现

政策**明文允许**的只有：`websites, streams, or videos` 上的**被动广告收入**，以及直播的捐赠/订阅。

政策**明文禁止**的：

- 众筹（Patreon、Kickstarter 等）
- 以付费墙圈内容
- 通过商业/法律实体运营
- 把商标/IP 相关词用作搜索关键词

所以：**H5 站挂广告**在政策字面范围内；但如果收入要进公司账户、或者要做付费功能，就需要 Riot 的**书面许可**。

---

## 6. 腾讯 / 中国大陆的额外一层

《英雄联盟》在中国大陆由腾讯代理，因此在大陆地区还叠加腾讯的权利主张。本项目在中国大陆以 H5 形式提供服务，页面声明里同时标注了腾讯。

---

## 7. 域名（已处理）

§5 写的是「You may not register **domain names** ... that uses Riot Games or any of our trademarks, trade names, character names, etc.」

原来的地址是 `lol.huohandu.cn`——`lol` 是《英雄联盟》的通行缩写。虽然它是**自有域名下的子域标签**、且 `lol` 本身也是通用英文缩写（laugh out loud），是否构成"register a domain name"存在解释空间，但**留着一个明显能联想到该商标的标签没有必要**。

**已于 2026-09-22 处理**：

| 项 | 变更 |
| --- | --- |
| 主站点 | `rift.huohandu.cn`（新证书，2026-12-21 到期，已配自动续期） |
| 旧域名 | `lol.huohandu.cn` 保留，**301 永久跳转**到新域名（含路径与查询串），老链接不失效 |
| 服务器目录 | `/var/www/lol.huohandu.cn/` → `/var/www/rift.huohandu.cn/` |
| 仓库 | `deploy.yml` 的 `WEB_ROOT`/`DOMAIN`、`deploy.ps1` 的默认域名、全部文档同步更新 |

旧域名的证书继续由 certbot 管理，所以它的 nginx 配置里保留了 `ssl_certificate` 那几行——**不要删**，否则续期会失败。

---

## 8. 给后续开发的硬性约束

改动代码时请守住这几条（已写进 `AGENTS.md`）：

1. **不要把官方美术资源提交进仓库**——一律热链 CDN。
2. **不要删改 `RIOT_FAN_NOTICE`**——它是政策要求的声明，必须原样、醒目。
3. **不要在仓库名、topics、关键词、域名里使用 Riot 商标**（`lol` / `league of legends` / `召唤师峡谷` 作为商标使用等）。
4. **不要引入付费墙、众筹、订阅**这类被明文禁止的变现方式。
5. 做小程序或 App 形态前，先回到本文 §4 重新评估。
