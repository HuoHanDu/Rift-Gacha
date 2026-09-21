# 构建阶段：装依赖 + 出 H5 产物
FROM node:22-alpine AS build

WORKDIR /app

# 先只拷清单文件，让依赖层可以被缓存
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build:h5

# 运行阶段：只放静态产物，用 nginx 提供服务
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/build/h5 /usr/share/nginx/html

EXPOSE 80

# 健康检查：入口 HTML 能取到即视为健康
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
