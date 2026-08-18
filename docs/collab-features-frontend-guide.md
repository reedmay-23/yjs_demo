# Yjs 扩展协作功能前端对接文档

> 适用项目：`yjs-text`  
> 接口版本：v1  
> 默认 HTTP 地址：`http://localhost:3892`  
> Swagger：`http://localhost:3892/swagger`  
> WebSocket：`ws://localhost:3892/collab-features`

## 1. 功能范围

本文档覆盖以下五类协作功能：

| 功能 | HTTP 前缀 | WebSocket `feature` | WebSocket `roomId` |
| --- | --- | --- | --- |
| 协同白板 | `/whiteboard` | `whiteboard` | 白板 ID |
| 实时聊天 | `/chat` | `chat` | 聊天室 ID |
| 任务看板 | `/task-board` | `task-board` | 看板 ID |
| 协作表格 | `/spreadsheet` | `spreadsheet` | 表格 ID |
| 多媒体标注 | `/media` | `media` | 媒体 ID |

注意：WebSocket 的 `roomId` 是对应资源的 ID，不是文档 ID。资源创建接口返回的 `data.id` 可直接用于连接。

## 2. 后端准备

首次启动或数据库模型变更后执行：

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

生产构建与启动：

```bash
npm run build
npm run start:prod
```

环境变量至少需要：

```dotenv
PORT=3000
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
JWT_ACCESS_SECRET=replace-me
JWT_REFRESH_SECRET=replace-me
```

## 3. 认证与通用协议

### 3.1 登录

```http
POST /auth/login
Content-Type: application/json
```

```json
{
  "account": "system",
  "password": "system123"
}
```

成功响应：

```json
{
  "code": 0,
  "message": "登录成功",
  "data": {
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

### 3.2 HTTP 请求头

除注册、登录和刷新 Token 外，所有接口都需要 Access Token：

```http
Authorization: Bearer <accessToken>
Content-Type: application/json
```

### 3.3 通用响应

```ts
interface ApiResponse<T> {
  code: number;
  message: string;
  data: T | null;
}
```

常用业务码：

| code | 含义 |
| --- | --- |
| `0` | 成功 |
| `40000` | 请求参数错误 |
| `40100` | Access Token 无效或过期 |
| `40101` | 登录状态失效 |
| `40300` | 无操作权限 |
| `40400` | 资源不存在 |
| `50000` | 服务端错误 |

### 3.4 推荐请求封装

```ts
export class CollabApi {
  constructor(
    private readonly baseUrl: string,
    private readonly getToken: () => string,
  ) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.getToken()}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });

    const payload = (await response.json()) as ApiResponse<T>;
    if (!response.ok || payload.code !== 0) {
      throw new Error(payload.message || `HTTP ${response.status}`);
    }

    return payload.data as T;
  }
}
```

## 4. 推荐同步流程

所有持久化变更都应遵循以下顺序：

1. 调用 HTTP API 写入数据库。
2. HTTP 成功后，使用返回的完整资源对象发送 WebSocket 事件。
3. 其他客户端收到事件后更新本地状态。
4. WebSocket 重连后重新调用详情接口，以数据库状态为准恢复数据。

WebSocket 网关负责实时广播，不替代 HTTP 持久化。不要只发送 WebSocket 消息而跳过 HTTP API。

## 5. 协同白板

### 5.1 接口列表

| 方法 | 地址 | 说明 |
| --- | --- | --- |
| `POST` | `/whiteboard` | 创建白板 |
| `GET` | `/whiteboard/document/:documentId` | 获取文档的白板列表 |
| `GET` | `/whiteboard/:id` | 获取白板及元素 |
| `PUT` | `/whiteboard/:id` | 更新标题或描述 |
| `DELETE` | `/whiteboard/:id` | 删除白板 |
| `POST` | `/whiteboard/:id/element` | 添加元素 |
| `PUT` | `/whiteboard/:id/element/:elementId` | 更新元素 |
| `DELETE` | `/whiteboard/:id/element/:elementId` | 删除元素 |

### 5.2 创建白板

```ts
const whiteboard = await api.request<Whiteboard>('/whiteboard', {
  method: 'POST',
  body: JSON.stringify({
    documentId: 1,
    title: '项目架构图',
    description: '协作绘图区域',
  }),
});
```

### 5.3 添加元素

支持的 `elementType`：`pen`、`shape`、`text`、`image`、`line`、`arrow`。

```ts
const element = await api.request<WhiteboardElement>(
  `/whiteboard/${whiteboard.id}/element`,
  {
    method: 'POST',
    body: JSON.stringify({
      elementType: 'pen',
      properties: {
        points: [[0, 0], [50, 20], [100, 100]],
        strokeColor: '#111827',
        strokeWidth: 2,
      },
      zIndex: 0,
    }),
  },
);

whiteboardSocket.send(
  JSON.stringify({ type: 'element_added', element }),
);
```

擦除可通过删除元素实现；移动、缩放和样式修改通过更新 `properties` 实现。

## 6. 实时聊天与评论

### 6.1 接口列表

| 方法 | 地址 | 说明 |
| --- | --- | --- |
| `POST` | `/chat/room` | 创建或获取文档聊天室 |
| `GET` | `/chat/room/:documentId` | 按文档获取聊天室 |
| `POST` | `/chat/room/:documentId/message` | 发送消息 |
| `GET` | `/chat/room/:documentId/messages` | 分页获取消息 |
| `GET` | `/chat/message/:messageId/replies` | 获取回复 |
| `PUT` | `/chat/message/:messageId` | 编辑自己的消息 |
| `DELETE` | `/chat/message/:messageId` | 软删除自己的消息 |
| `POST` | `/chat/message/:messageId/reaction` | 切换表情反应 |

### 6.2 创建聊天室

一个文档只会有一个聊天室；重复调用会返回已有聊天室。

```ts
const room = await api.request<ChatRoom>('/chat/room', {
  method: 'POST',
  body: JSON.stringify({ documentId: 1, name: '文档讨论区' }),
});
```

### 6.3 发送消息、回复和 @ 提及

```ts
const message = await api.request<ChatMessage>(
  `/chat/room/${documentId}/message`,
  {
    method: 'POST',
    body: JSON.stringify({
      content: '请 @用户 检查这一段内容',
      messageType: 'text',
      parentId: 20,
      mentions: [2, 3],
    }),
  },
);

chatSocket.send(JSON.stringify({ type: 'new_message', message }));
```

`messageType` 支持 `text`、`image`、`file`、`system`。

### 6.4 消息分页

```http
GET /chat/room/1/messages?page=1&limit=50&before=100
```

- `page` 从 1 开始。
- `limit` 范围为 1～100。
- `before` 用于加载指定消息 ID 之前的记录。

### 6.5 表情反应

相同用户对相同表情重复调用时会切换添加/移除状态。

```ts
const updated = await api.request<ChatMessage>(
  `/chat/message/${messageId}/reaction`,
  {
    method: 'POST',
    body: JSON.stringify({ emoji: '👍' }),
  },
);

chatSocket.send(
  JSON.stringify({
    type: 'reaction_added',
    messageId,
    emoji: '👍',
    message: updated,
  }),
);
```

## 7. 任务看板

### 7.1 接口列表

| 方法 | 地址 | 说明 |
| --- | --- | --- |
| `POST` | `/task-board` | 创建看板及默认三列 |
| `GET` | `/task-board/document/:documentId` | 获取文档的看板列表 |
| `GET` | `/task-board/:id` | 获取列与卡片 |
| `PUT` | `/task-board/:id` | 更新看板 |
| `DELETE` | `/task-board/:id` | 删除看板 |
| `POST` | `/task-board/:id/column` | 创建列 |
| `PUT` | `/task-board/column/:columnId` | 更新列 |
| `DELETE` | `/task-board/column/:columnId` | 删除列及卡片 |
| `POST` | `/task-board/column/:columnId/card` | 创建卡片 |
| `PUT` | `/task-board/card/:cardId` | 更新卡片 |
| `PUT` | `/task-board/card/:cardId/move` | 拖拽移动卡片 |
| `DELETE` | `/task-board/card/:cardId` | 删除卡片 |

### 7.2 创建看板

```ts
const board = await api.request<TaskBoard>('/task-board', {
  method: 'POST',
  body: JSON.stringify({
    documentId: 1,
    title: '研发任务',
    description: '迭代任务管理',
  }),
});
```

默认列为“待办”“进行中”“已完成”。

### 7.3 创建任务卡片

```ts
const card = await api.request<TaskCard>(
  `/task-board/column/${columnId}/card`,
  {
    method: 'POST',
    body: JSON.stringify({
      title: '完成协同编辑页面',
      description: '接入白板和聊天面板',
      priority: 'high',
      dueDate: '2026-08-31',
      assigneeId: 2,
      tags: ['前端', '协作'],
    }),
  },
);
```

`priority` 支持 `low`、`medium`、`high`、`urgent`。

### 7.4 拖拽移动

```ts
const movedCard = await api.request<TaskCard>(
  `/task-board/card/${cardId}/move`,
  {
    method: 'PUT',
    body: JSON.stringify({
      targetColumnId: 12,
      position: 0,
    }),
  },
);

boardSocket.send(
  JSON.stringify({ type: 'card_moved', card: movedCard }),
);
```

后端会同步调整源列和目标列中其他卡片的顺序。前端收到事件后可直接按 `position` 升序重排。

## 8. 协作表格

### 8.1 接口列表

| 方法 | 地址 | 说明 |
| --- | --- | --- |
| `POST` | `/spreadsheet` | 创建表格 |
| `GET` | `/spreadsheet/document/:documentId` | 获取文档的表格列表 |
| `GET` | `/spreadsheet/:id` | 获取表格及单元格 |
| `PUT` | `/spreadsheet/:id` | 更新标题、行数、列数 |
| `DELETE` | `/spreadsheet/:id` | 删除表格 |
| `GET` | `/spreadsheet/:id/cell?row=0&col=0` | 获取单元格 |
| `PUT` | `/spreadsheet/:id/cell` | 更新单元格 |
| `PUT` | `/spreadsheet/:id/cells` | 批量更新单元格 |
| `DELETE` | `/spreadsheet/:id/cell?row=0&col=0` | 删除单元格 |

行列坐标从 `0` 开始。默认表格为 100 行、26 列；最大支持 10000 行、1000 列。单次批量更新最多 1000 个单元格。

### 8.2 创建表格

```ts
const sheet = await api.request<Spreadsheet>('/spreadsheet', {
  method: 'POST',
  body: JSON.stringify({
    documentId: 1,
    title: '销售数据',
    rowCount: 200,
    colCount: 30,
  }),
});
```

### 8.3 更新单元格

```ts
const cell = await api.request<SpreadsheetCell>(
  `/spreadsheet/${sheet.id}/cell`,
  {
    method: 'PUT',
    body: JSON.stringify({
      row: 0,
      col: 1,
      value: '100',
      formula: '=SUM(B2:B10)',
      format: {
        bold: true,
        color: '#111827',
        backgroundColor: '#f9fafb',
      },
      validation: {
        type: 'number',
        min: 0,
        max: 1000,
      },
    }),
  },
);

sheetSocket.send(JSON.stringify({ type: 'cell_updated', cell }));
```

当前协议会持久化 `value`、`formula`、`format` 和 `validation`。公式结果由前端计算后写入 `value`；后端保存公式表达式，但当前版本不负责公式求值。数据验证规则由前端执行，后端负责字段类型、坐标边界和批量数量校验。

### 8.4 批量更新

```ts
const cells = await api.request<SpreadsheetCell[]>(
  `/spreadsheet/${sheet.id}/cells`,
  {
    method: 'PUT',
    body: JSON.stringify({
      cells: [
        { row: 0, col: 0, value: '姓名' },
        { row: 0, col: 1, value: '金额' },
      ],
    }),
  },
);

sheetSocket.send(
  JSON.stringify({ type: 'cells_batch_updated', cells }),
);
```

## 9. 多媒体标注

### 9.1 接口列表

| 方法 | 地址 | 说明 |
| --- | --- | --- |
| `POST` | `/media/upload` | 登记媒体文件元数据 |
| `GET` | `/media/document/:documentId` | 获取文档媒体列表 |
| `GET` | `/media/:id` | 获取媒体及标注 |
| `PUT` | `/media/:id` | 更新文件名或元数据 |
| `DELETE` | `/media/:id` | 删除媒体记录和标注 |
| `POST` | `/media/:id/annotation` | 创建标注 |
| `GET` | `/media/:id/annotations` | 获取标注列表 |
| `PUT` | `/media/annotation/:annotationId` | 更新自己的标注 |
| `DELETE` | `/media/annotation/:annotationId` | 删除自己的标注 |

### 9.2 媒体登记

`/media/upload` 当前接收的是已经上传完成的文件元数据，不接收 `multipart/form-data` 二进制文件。前端应先把文件上传到对象存储或文件服务，再把最终 URL/路径登记到本接口。

```ts
const media = await api.request<MediaFile>('/media/upload', {
  method: 'POST',
  body: JSON.stringify({
    documentId: 1,
    fileName: 'demo.mp4',
    fileType: 'video',
    fileSize: 10485760,
    filePath: 'https://cdn.example.com/demo.mp4',
    mimeType: 'video/mp4',
    metadata: {
      width: 1920,
      height: 1080,
      duration: 120.5,
    },
  }),
});
```

`fileType` 支持 `image`、`video`、`audio`。

### 9.3 创建标注

```ts
const annotation = await api.request<MediaAnnotation>(
  `/media/${media.id}/annotation`,
  {
    method: 'POST',
    body: JSON.stringify({
      annotationType: 'timestamp',
      content: '这里需要补充字幕',
      position: { x: 100, y: 80, width: 320, height: 120 },
      startTime: 10.5,
      endTime: 15,
    }),
  },
);

mediaSocket.send(
  JSON.stringify({ type: 'annotation_created', annotation }),
);
```

`annotationType` 支持 `comment`、`highlight`、`drawing`、`timestamp`。同时提供开始和结束时间时，必须满足 `startTime < endTime`。

## 10. WebSocket 对接

### 10.1 建立连接

```ts
type Feature =
  | 'whiteboard'
  | 'chat'
  | 'task-board'
  | 'spreadsheet'
  | 'media';

function connectFeature(
  feature: Feature,
  resourceId: number,
  accessToken: string,
) {
  const query = new URLSearchParams({
    feature,
    roomId: String(resourceId),
    accessToken,
  });

  return new WebSocket(
    `ws://localhost:3000/collab-features?${query.toString()}`,
  );
}
```

浏览器 WebSocket API 不能自定义 `Authorization` 请求头，因此浏览器端使用 `accessToken` 查询参数。非浏览器客户端也可以使用 `Authorization: Bearer <token>`。

### 10.2 连接成功事件

```json
{
  "type": "connected",
  "feature": "whiteboard",
  "roomId": "10",
  "userId": "2",
  "canWrite": true
}
```

`canWrite=false` 表示当前用户是 viewer。viewer 可以连接并接收事件，但发送写事件会收到：

```json
{
  "type": "error",
  "code": "read_only",
  "message": "Viewer role cannot broadcast write operations"
}
```

### 10.3 通用在线事件

```json
{
  "type": "user_joined",
  "userId": "2",
  "timestamp": "2026-08-17T08:00:00.000Z"
}
```

```json
{
  "type": "user_left",
  "userId": "2",
  "timestamp": "2026-08-17T08:05:00.000Z"
}
```

### 10.4 事件清单

| feature | 写事件 | 临时状态事件 |
| --- | --- | --- |
| `whiteboard` | `element_added`、`element_updated`、`element_deleted` | `cursor_move` |
| `chat` | `new_message`、`reaction_added` | `typing` |
| `task-board` | `card_created`、`card_updated`、`card_deleted`、`card_moved`、`column_created`、`column_updated`、`column_deleted` | 无 |
| `spreadsheet` | `cell_updated`、`cells_batch_updated` | `cursor_move`、`selection_change` |
| `media` | `annotation_created`、`annotation_updated`、`annotation_deleted` | `playback_sync` |

服务端广播时会补充 `userId` 和 `timestamp`，并且不会把同一条消息回发给发送者。

### 10.5 自动重连建议

```ts
function createReconnectingSocket(factory: () => WebSocket) {
  let socket: WebSocket;
  let retry = 0;
  let closedByUser = false;

  const connect = () => {
    socket = factory();

    socket.onopen = () => {
      retry = 0;
    };

    socket.onclose = () => {
      if (closedByUser) return;
      const delay = Math.min(1000 * 2 ** retry, 15000);
      retry += 1;
      window.setTimeout(connect, delay);
    };
  };

  connect();

  return {
    send(data: unknown) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
      }
    },
    close() {
      closedByUser = true;
      socket.close();
    },
  };
}
```

重连成功后应重新请求资源详情，不要仅依赖断线期间的 WebSocket 增量消息。

## 11. 权限规则

| 角色 | HTTP 读取 | HTTP 写入 | WebSocket 接收 | WebSocket 写事件 |
| --- | --- | --- | --- | --- |
| owner | 允许 | 允许 | 允许 | 允许 |
| editor | 允许 | 允许 | 允许 | 允许 |
| viewer | 允许 | 禁止 | 允许 | 禁止 |

聊天消息属于沟通能力，拥有文档读取权限的用户可以发送消息、回复和表情反应；用户只能编辑或删除自己的消息。媒体标注同样只能由创建者编辑或删除。

## 12. 前端联调检查表

- [ ] 登录后正确保存并刷新 Access Token。
- [ ] 所有 HTTP 请求携带 `Authorization`。
- [ ] `PUT`、`DELETE` 和预检请求未被代理层拦截。
- [ ] 先通过 HTTP 创建资源，再用返回的资源 ID 连接 WebSocket。
- [ ] 持久化操作先调 HTTP，成功后再广播 WebSocket 事件。
- [ ] viewer 界面隐藏或禁用写操作。
- [ ] WebSocket 断线后自动重连，并重新加载详情。
- [ ] 列表渲染按 `position` 或 `zIndex` 排序。
- [ ] 表格行列坐标使用从 0 开始的索引。
- [ ] 媒体文件先上传到存储服务，再调用 `/media/upload` 登记。

## 13. 相关文档

- 详细接口清单：[collab-features-api.md](./collab-features-api.md)
- 模块实现说明：[README.md](../src/module/collab-features/README.md)
- Swagger：启动服务后访问 `http://localhost:3000/swagger`
