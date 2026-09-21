<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'

onLaunch(() => {
  // 无全局初始化逻辑；数据快照在构建期已生成，无需运行时请求。
})
</script>

<style>
/* 设计令牌：黑钢底 + 单点黄铜色。全部颜色只在这里定义一次。 */
page,
body {
  --bg: #0e1015;
  --surface: #171a21;
  --surface-2: #1e222b;
  --line: #262b36;
  --line-strong: #333a48;
  --ink: #e6e8ee;
  --ink-muted: #9aa3b2;
  --brass: #c8973f;
  --danger: #e0575f;

  margin: 0;
  background-color: var(--bg);
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  -webkit-font-smoothing: antialiased;
}

view,
text,
image,
input {
  box-sizing: border-box;
}
</style>
