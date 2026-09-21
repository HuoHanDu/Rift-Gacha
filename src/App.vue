<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'

onLaunch(() => {
  // 无全局初始化逻辑；数据快照在构建期已生成，无需运行时请求。
})
</script>

<style>
/* 全局样式：扁平、深色、简洁。 */
page,
body {
  margin: 0;
  background-color: #0e1015;
  color: #e6e8ee;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  -webkit-font-smoothing: antialiased;
}

view,
text,
image {
  box-sizing: border-box;
}
</style>
