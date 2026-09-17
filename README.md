# Yjs 协同文档编辑后端服务

基于 NestJS、Yjs、WebSocket、Prisma 和 PostgreSQL 实现的多人协同文档编辑后端服务。

## 技术栈

- **运行时**: Node.js + TypeScript
- **框架**: NestJS
- **数据库**: PostgreSQL
- **ORM**: Prisma
- **认证**: JWT / Passport
- **实时通信**: WebSocket
- **协同编辑**: Yjs / y-protocols / y-websocket
- **测试**: Jest

## 核心功能

### 1. 用户认证系统
- 用户注册与登录
- Access Token 和 Refresh Token 双令牌机制
- JWT 令牌自动刷新
- 密码加密存储（bcrypt）

### 2. 文档管理
- 文档创建、列表、详情、删除
- 文档元数据更新（标题、摘要等）
- 文档版本控制
- 文档内容只读取接口

### 3. 协作者权限管理
- Owner / Editor / Viewer 三级权限模型
- 协作者添加、移除、角色修改
- 基于角色的访问控制（RBAC）
- 实时权限生效

### 4. 实时协同编辑
- 基于 Yjs 的多人实时协同编辑
- WebSocket 双向实时通信
- 协同房间内存管理
- 自动编辑历史按用户和时间窗口合并

### 5. 文档持久化
- Y.Doc 快照编码与恢复
- 数据库存储 Yjs 状态
- 防抖持久化减少数据库写入压力
- 服务重启后自动恢复文档状态

### 6. 在线状态管理
- 协同会话记录
- 用户在线状态维护
- 连接引用计数（支持多标签页）
- 房间无人后延迟清理

### 7. 历史版本管理
- 文档历史记录
- Yjs 快照版本回退
- 手动快照创建
- 快照对比功能

## 项目结构

`
src/
├── app.module.ts              # 根模块
├── main.ts                    # 应用入口
├── common/                    # 公共模块
│   ├── constants/            # 业务响应码
│   ├── filters/              # 全局异常过滤器
│   ├── interceptors/         # 全局响应拦截器
│   ├── interfaces/           # 公共接口定义
│   └── utils/                # 工具函数
├── decorator/
│   └── public.decorator.ts   # 公开接口标记
├── module/
│   ├── auth/                 # 登录、注册、token 刷新
│   ├── document/             # 文档和协作者管理
│   ├── jwt/                  # refresh token 策略和守卫
│   ├── prisma/               # PrismaService
│   ├── user/                 # 用户模块
│   └── yjs-storage/          # Yjs 快照、权限、会话持久化
├── socket/                   # WebSocket 相关
├── utils/
│   ├── jwt.config.ts         # JWT 配置
│   ├── urlParams.ts          # URL 参数解析
│   └── ws-auth.ts            # WebSocket token 解析和校验
└── yjs/
    ├── yjs.gateway.ts        # 自定义 Yjs WebSocket 协同服务
    └── yjs-persistence.gateway.ts  # Yjs 持久化网关
`

## 数据模型

### 核心数据表

1. **User** - 用户信息
   - 账号、密码、用户名
   - Refresh Token 存储

2. **Document** - 文档信息
   - 标题、摘要、状态
   - 创建者、版本号
   - Yjs 内容快照

3. **DocumentHistory** - 文档历史
   - 历史版本记录
   - 编辑、回退操作
   - 操作者、来源版本
   - 可恢复快照

4. **DocumentCollaborator** - 协作者关系
   - 文档与用户关联
   - 角色（editor/viewer）
   - 邀请者信息

5. **CollaborationSession** - 协同会话
   - 用户在线状态
   - 最后活跃时间
   - 连接引用计数

## 协同编辑流程

`
1. 用户登录，获取 access token
   ↓
2. 用户创建文档或打开已有文档
   ↓
3. 前端使用文档 ID 和 access token 建立 WebSocket 连接
   ↓
4. 服务端校验 token，并根据文档权限判断用户是否可进入协同房间
   ↓
5. 服务端按 docId 创建或复用内存中的 Y.Doc 房间
   ↓
6. 首次加载房间时，从数据库中的 documents.content 恢复 Y.Doc 快照
   ↓
7. 客户端编辑产生 Yjs update，服务端接收后广播给同房间其他客户端
   ↓
8. 服务端对文档快照做防抖持久化，减少数据库写入压力
   ↓
9. 用户断开连接后，服务端更新在线会话状态
   ↓
10. 房间无人后延迟清理，清理前再次保存快照
`

## WebSocket 服务

### 协同编辑端点

`	ext
ws://localhost:3000/collab1?docId={documentId}&accessToken={accessToken}
`

- **collab1**: 自定义实现的 Yjs WebSocket 协议，便于扩展在线用户、权限和快照逻辑
- **collab2**: 基于 y-websocket 官方工具封装的实现

### 连接参数

| 参数 | 必填 | 说明 |
|------|------|------|
| docId | 是 | 文档 ID |
| accessToken | 是 | JWT 访问令牌 |
| presence | 否 | 设为 1 启用在线人数推送 |

### 消息类型

`	ypescript
const messageSync = 0;      // Yjs 文档同步消息
const messageAwareness = 1; // Yjs awareness 消息（光标、选区等）
const messagePresence = 2;  // 自定义在线人数消息
`

## HTTP 接口概览

### 账号相关

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /auth/register | 用户注册 |
| POST | /auth/login | 用户登录 |
| POST | /auth/refresh | 刷新令牌 |
| GET | /auth/me | 获取当前用户信息 |

### 文档相关

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /document/create | 创建文档 |
| GET | /document/getList | 获取文档列表 |
| GET | /document/detail/:id | 获取文档详情 |
| GET | /document/read/:id | 读取文档内容 |
| POST | /document/update | 更新文档 |
| DELETE | /document/delete/:id | 删除文档 |
| POST | /document/history/list | 获取历史列表 |
| POST | /document/history/rollback | 版本回退 |
| POST | /document/history/manual-snapshot | 手动创建快照 |
| POST | /document/history/compare-snapshot | 快照对比 |

### 协作者相关

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /document/collaborators/add | 添加协作者 |
| POST | /document/collaborators/list | 获取协作者列表 |
| POST | /document/collaborators/remove | 移除协作者 |
| POST | /document/collaborators/update-role | 更新协作者角色 |

### 认证方式

所有非公开接口都需要在请求头中携带：

`http
Authorization: Bearer <accessToken>
`

### 统一响应格式

`	ypescript
type ApiResponse<T> = {
  code: number;    // 业务状态码
  message: string; // 响应消息
  data: T;         // 响应数据
};
`

## 本地开发

### 1. 安装依赖

`ash
pnpm install
`

### 2. 配置环境变量

在项目根目录创建或修改 .env：

`env
DATABASE_URL="postgresql://user:password@localhost:5432/yjs_text"
JWT_ACCESS_SECRET="your-access-secret"
JWT_REFRESH_SECRET="your-refresh-secret"
`

请根据本地 PostgreSQL 配置调整 DATABASE_URL。

### 3. 初始化数据库

`ash
npx prisma generate
npx prisma migrate deploy
`

开发环境如果需要创建新迁移，可使用：

`ash
npx prisma migrate dev
`

### 4. 启动服务

`ash
pnpm run start:dev
`

默认服务地址：http://localhost:3000

## 常用命令

`ash
pnpm run start:dev   # 开发模式启动
pnpm run build       # 构建项目
pnpm run start:prod  # 运行构建产物
pnpm run test        # 单元测试
pnpm run test:e2e    # e2e 测试
pnpm run lint        # ESLint 修复
`

## 权限模型

### 角色说明

| 角色 | 说明 | HTTP 读取 | HTTP 写入 | WebSocket 接收 | WebSocket 写入 |
|------|------|-----------|-----------|----------------|----------------|
| owner | 文档创建者 | ✅ | ✅ | ✅ | ✅ |
| editor | 编辑者 | ✅ | ✅ | ✅ | ✅ |
| viewer | 查看者 | ✅ | ❌ | ✅ | ❌ |

### 权限判断规则

1. 文档创建者自动成为 owner
2. owner 可以管理文档和协作者
3. editor 可以进入协同编辑
4. viewer 只能读取内容，不能写入协同房间

## 新人阅读建议

建议按下面顺序熟悉项目：

1. 先看 prisma/schema.prisma，理解用户、文档、协作者、会话的数据关系
2. 再看 src/module/document/document.service.ts，理解文档权限和协作者管理
3. 再看 src/module/yjs-storage/yjs-storage.service.ts，理解 Yjs 快照存储、恢复和权限校验
4. 最后看 src/yjs/yjs.gateway.ts，理解 WebSocket 协同同步的完整流程

## 已知改进点

- 当前密码逻辑需要改造成 bcrypt 哈希存储
- WebSocket access token 放在 query 参数中，生产环境需要使用 HTTPS/WSS，并做好日志脱敏
- 单实例内存房间模型不适合直接水平扩展，多实例部署需要 Redis Pub/Sub 或其他消息广播机制
- 防抖快照持久化在极端宕机情况下可能丢失最近一次防抖窗口内的数据
- 需要继续补充 WebSocket 鉴权、权限边界和协同同步相关测试

## 相关文档

- [Yjs 对接文档](./docs/yjs对接文档.md)
- [访问权限设计](./docs/访问权限.md)
- [协同功能升级](./docs/2026-07-13-collab-feature-upgrades.md)
- [历史回退功能](./docs/yjs-history-rollback.md)
