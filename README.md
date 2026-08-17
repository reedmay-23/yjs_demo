# Yjs Collaborative Document Service

基于 NestJS、Yjs、WebSocket、Prisma 和 PostgreSQL 实现的多人协同文档编辑后端服务。

项目支持用户登录、文档管理、协作者权限、实时协同编辑、在线状态维护、文档快照持久化和统一接口响应。它的核心不是普通 CRUD，而是围绕 Yjs 协同编辑协议构建一套可鉴权、可持久化、可管理权限的协同文档服务。

## 技术栈

- Node.js + TypeScript
- NestJS
- Prisma
- PostgreSQL
- JWT / Passport
- WebSocket
- Yjs / y-protocols / y-websocket
- Jest

## 核心功能

- 用户注册、登录、access token 和 refresh token 刷新
- 文档创建、列表、详情、删除、元数据更新
- 文档内容只读读取
- 协作者添加、移除、角色修改
- owner / editor / viewer 权限模型
- 基于 JWT 的 HTTP 和 WebSocket 鉴权
- 基于 Yjs 的多人实时协同编辑
- Y.Doc 快照编码、恢复和数据库持久化
- 文档历史记录和 Yjs 快照版本回退，自动编辑历史按用户和时间窗口合并
- 协同房间内存管理和无人后延迟清理
- 在线协作者会话记录
- 统一成功响应和异常响应格式

## 项目结构

```text
src
├── app.module.ts
├── common
│   ├── constants              # 业务响应码
│   ├── filters                # 全局异常过滤器
│   ├── interceptors           # 全局响应拦截器
│   ├── interfaces
│   └── utils
├── decorator
│   └── public.decorator.ts    # 公开接口标记
├── module
│   ├── auth                   # 登录、注册、token 刷新
│   ├── document               # 文档和协作者管理
│   ├── jwt                    # refresh token 策略和守卫
│   ├── prisma                 # PrismaService
│   ├── user                   # 用户模块
│   └── yjs-storage            # Yjs 快照、权限、会话持久化
├── socket
├── utils
│   ├── jwt.config.ts
│   ├── urlParams.ts
│   └── ws-auth.ts             # WebSocket token 解析和校验
└── yjs
    ├── yjs.gateway.ts         # 自定义 Yjs WebSocket 协同服务
    └── yjs-persistence.gateway.ts
```

## 数据模型

核心数据表定义在 `prisma/schema.prisma`：

- `User`：用户信息、账号、密码、refresh token。
- `Document`：文档标题、摘要、状态、创建者、版本、Yjs 内容快照。
- `DocumentHistory`：文档历史版本，记录编辑、回退、操作者、来源版本和可恢复快照。
- `DocumentCollaborator`：文档协作者和角色，支持 `editor`、`viewer`。
- `CollaborationSession`：协同在线会话，记录用户是否在线、最后活跃时间。

权限规则：

- 文档创建者是 `owner`。
- `owner` 可以管理文档和协作者。
- `editor` 可以进入协同编辑。
- `viewer` 只能读取内容，不能写入协同房间。

## 协同编辑流程

1. 用户登录，获得 access token。
2. 用户创建文档或打开已有文档。
3. 前端使用文档 ID 和 access token 建立 WebSocket 连接。
4. 服务端校验 token，并根据文档权限判断用户是否可进入协同房间。
5. 服务端按 `docId` 创建或复用内存中的 Y.Doc 房间。
6. 首次加载房间时，从数据库中的 `documents.content` 恢复 Y.Doc 快照。
7. 客户端编辑产生 Yjs update，服务端接收后广播给同房间其他客户端。
8. 服务端对文档快照做防抖持久化，减少数据库写入压力。
9. 用户断开连接后，服务端更新在线会话状态。
10. 房间无人后延迟清理，清理前再次保存快照。

## WebSocket 服务

项目提供两个协同 WebSocket 入口：

```text
ws://localhost:3000/collab1?docId={documentId}&accessToken={accessToken}
ws://localhost:3000/collab2?docId={documentId}&accessToken={accessToken}
```

- `/collab1`：项目自定义实现的 Yjs WebSocket 协议，便于扩展在线用户、权限和快照逻辑。
- `/collab2`：基于 `y-websocket` 官方工具封装的实现。

当前推荐优先对接 `/collab1`。

注意：

- 这两个路径使用原生 WebSocket，不是 Socket.IO。
- 浏览器原生 WebSocket 不能直接设置自定义 `Authorization` header，所以前端通常通过 query 参数传 access token。
- 服务端只信任 JWT payload 中的用户 ID，不信任前端传来的 `userId`。

## HTTP 接口概览

### 账号相关

```text
POST /auth/register
POST /auth/login
POST /auth/refresh
GET  /auth/me
```

### 文档相关

```text
POST   /document/create
GET    /document/getList
GET    /document/detail/:id
GET    /document/read/:id
POST   /document/update
POST   /document/history/list
POST   /document/history/rollback
POST   /document/history/manual-snapshot
POST   /document/history/compare-snapshot
GET    /document/statistics
DELETE /document/delete/:id
```

历史记录与回退详见：`docs/yjs-history-rollback.md`。
权限实时生效、手动版本、Tiptap 对比快照和增量 update 日志详见：`docs/2026-07-13-collab-feature-upgrades.md`。

### 协作者相关

```text
POST /document/collaborators/add
POST /document/collaborators/list
POST /document/collaborators/remove
POST /document/collaborators/update-role
```

所有非公开 HTTP 接口都需要：

```http
Authorization: Bearer <accessToken>
```

统一响应格式：

```ts
type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};
```

## 本地启动

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

在项目根目录创建或修改 `.env`：

```env
DATABASE_URL="postgresql://user:password@localhost:5432/yjs_text"
JWT_ACCESS_SECRET="your-access-secret"
JWT_REFRESH_SECRET="your-refresh-secret"
```

请根据本地 PostgreSQL 配置调整 `DATABASE_URL`。

### 3. 初始化数据库

```bash
npx prisma generate
npx prisma migrate deploy
```

开发环境如果需要创建新迁移，可使用：

```bash
npx prisma migrate dev
```

### 4. 启动服务

```bash
pnpm run start:dev
```

默认服务地址：

```text
http://localhost:3000
```

## 常用命令

```bash
pnpm run start:dev   # 开发模式启动
pnpm run build       # 构建项目
pnpm run start:prod  # 运行构建产物
pnpm run test        # 单元测试
pnpm run test:e2e    # e2e 测试
pnpm run lint        # ESLint 修复
```

## 新人阅读建议

建议按下面顺序熟悉项目：

1. 先看 `prisma/schema.prisma`，理解用户、文档、协作者、会话的数据关系。
2. 再看 `src/module/document/document.service.ts`，理解文档权限和协作者管理。
3. 再看 `src/module/yjs-storage/yjs-storage.service.ts`，理解 Yjs 快照存储、恢复和权限校验。
4. 最后看 `src/yjs/yjs.gateway.ts`，理解 WebSocket 协同同步的完整流程。
5. 如果要了解面试讲解和项目亮点，可以阅读 `项目介绍.md`。

## 已知改进点

- 当前密码逻辑需要改造成 bcrypt 哈希存储。
- WebSocket access token 放在 query 参数中，生产环境需要使用 HTTPS/WSS，并做好日志脱敏。
- 单实例内存房间模型不适合直接水平扩展，多实例部署需要 Redis Pub/Sub 或其他消息广播机制。
- 防抖快照持久化在极端宕机情况下可能丢失最近一次防抖窗口内的数据。
- 需要继续补充 WebSocket 鉴权、权限边界和协同同步相关测试。
