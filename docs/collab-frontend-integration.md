# 协同编辑服务前端对接文档

本文档面向前端接入当前项目里的协同编辑服务，重点说明 `/collab1`、`/collab2` 两个 WebSocket 服务的实现方式、调用参数、鉴权方式和前端对接流程。

## 1. 服务定位

当前协同编辑基于 Yjs 实现，服务端负责：

- 校验用户身份和文档权限。
- 为每个文档维护一个协同房间。
- 接收并广播 Yjs 二进制增量更新。
- 维护 awareness 状态，例如光标、用户名、在线状态等前端协作态。
- 将 Y.Doc 快照持久化到数据库 `documents.content`。
- 记录协同在线会话到 `collaboration_sessions`。

前端负责：

- 创建本地 `Y.Doc`。
- 将编辑器内容绑定到 Yjs 类型，例如 `Y.Text`。
- 通过 WebSocket 发送和接收 Yjs 协议消息。
- 根据 awareness 渲染在线用户、光标、选区等协作 UI。

## 2. 服务入口

| 服务 | WebSocket path | 实现文件 | 推荐场景 |
| --- | --- | --- | --- |
| collab1 | `/collab1` | `src/yjs/yjs.gateway.ts` | 项目自定义 Yjs WebSocket 协议实现，可控性更强，当前推荐优先对接 |
| collab2 | `/collab2` | `src/yjs/yjs-persistence.gateway.ts` | 基于 `y-websocket` 官方 `setupWSConnection`，协议更标准，但当前路径形态不完全适配官方前端 `WebsocketProvider` 的默认 URL 拼接 |

两个服务都使用原生 WebSocket，不是 Socket.IO。前端不要使用 `socket.io-client` 对接 `/collab1` 或 `/collab2`。

连接地址格式：

```text
ws://{host}:{port}/collab1?docId={documentId}&accessToken={accessToken}
ws://{host}:{port}/collab2?docId={documentId}&accessToken={accessToken}
```

生产环境如果站点使用 HTTPS，应改为：

```text
wss://{host}/collab1?docId={documentId}&accessToken={accessToken}
wss://{host}/collab2?docId={documentId}&accessToken={accessToken}
```

## 3. 鉴权和权限

WebSocket 连接必须带 access token。服务端支持两种取 token 的方式：

- Query 参数：`accessToken` 或 `token`。
- Header：`Authorization: Bearer <accessToken>`。

浏览器原生 `WebSocket` 不能直接设置自定义 `Authorization` header，所以前端浏览器环境建议使用 query 参数：

```ts
const wsUrl = `ws://localhost:3000/collab1?docId=${docId}&accessToken=${encodeURIComponent(accessToken)}`;
const ws = new WebSocket(wsUrl);
```

安全规则：

- 服务端只信任 JWT payload 里的 `sub` 作为用户 ID。
- 前端不需要、也不应该传 `userId`。
- 当前版本权限模型是“文档创建者可协同”，即 `documents.createdBy === token.sub`。
- 文档不存在、token 无效、用户无权限都会在 WebSocket 初始化阶段关闭连接。

常见关闭码和原因：

| close code | reason | 含义 |
| --- | --- | --- |
| `4000` | `Missing docId parameter` | 缺少 `docId` |
| `4500` | `unauthorized` | token 缺失、过期或无效 |
| `4500` | `forbidden` | 当前用户无文档权限 |
| `4500` | `document_not_found` | 文档不存在 |
| `4500` | `invalid_id` | `docId` 不是合法数字 ID |
| `4500` | `room_init_failed` | 房间初始化失败 |

## 4. 数据模型和持久化

文档数据保存在 `documents` 表：

| 字段 | 含义 |
| --- | --- |
| `id` | 文档 ID，前端连接时传入 `docId` |
| `title` | 文档标题 |
| `createdBy` | 创建者用户 ID |
| `content` | Y.Doc 快照，JSON 格式保存为 `number[]` |
| `version` | 每次保存快照后递增 |

协同会话保存在 `collaboration_sessions` 表：

| 字段 | 含义 |
| --- | --- |
| `documentId` | 文档 ID |
| `userId` | 用户 ID |
| `isActive` | 是否在线 |
| `lastSeen` | 最后活跃时间 |
| `cursorPos` | 预留光标字段，当前主要使用 Yjs awareness |

持久化策略：

- 新文档创建时会写入一个空的 Y.Doc 快照。
- WebSocket 房间首次加载时从 `documents.content` 恢复 Y.Doc。
- 收到 Yjs update 后，服务端 1 秒防抖保存快照。
- `/collab1` 房间没人在线后会延迟 30 分钟清理内存房间，清理前会再次保存快照。
- `/collab2` 使用 `y-websocket` persistence，最后一个连接关闭时会 flush 快照。

## 5. HTTP 接口

所有 HTTP 接口都需要：

```http
Authorization: Bearer <accessToken>
```

统一响应格式：

```ts
type ApiResponse<T> = {
  data: T;
  message: string;
  code: number;
};
```

### 5.1 创建文档

```http
POST /document/create
Content-Type: application/json
Authorization: Bearer <accessToken>

{
  "title": "文档标题"
}
```

响应里的 `data.id` 就是 WebSocket 连接需要的 `docId`。

### 5.2 获取文档列表

```http
GET /document/getList
Authorization: Bearer <accessToken>
```

返回当前用户创建的文档列表。

### 5.3 删除文档

```http
DELETE /document/delete/{id}
Authorization: Bearer <accessToken>
```

只允许文档创建者删除。

### 5.4 查询在线协同用户

```http
GET /yjs-storage/sessions/{docId}
Authorization: Bearer <accessToken>
```

返回当前文档 `isActive = true` 的协同会话：

```ts
type CollaborationSession = {
  id: number;
  documentId: number;
  userId: number;
  cursorPos: unknown | null;
  isActive: boolean;
  lastSeen: string;
  user: {
    id: number;
    username: string;
    account: string;
  };
};
```

建议用途：

- 页面初始化时拉一次在线用户。
- WebSocket 连接或断开后重新拉取。
- 如果需要更实时的在线用户列表，优先基于 Yjs awareness 渲染。

## 6. collab1 前端接入示例

`/collab1` 使用标准 Yjs sync 和 awareness 消息格式：

- `messageSync = 0`
- `messageAwareness = 1`

前端可以用原生 WebSocket 加 `y-protocols` 自行收发协议消息。

```ts
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { Awareness } from 'y-protocols/awareness';

const messageSync = 0;
const messageAwareness = 1;

type CreateCollabClientOptions = {
  baseWsUrl: string; // 例如 ws://localhost:3000
  docId: number | string;
  accessToken: string;
};

export function createCollabClient(options: CreateCollabClientOptions) {
  const ydoc = new Y.Doc();
  const ytext = ydoc.getText('document');
  const awareness = new Awareness(ydoc);

  const url = `${options.baseWsUrl}/collab1?docId=${options.docId}&accessToken=${encodeURIComponent(options.accessToken)}`;
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  const send = (message: Uint8Array) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  };

  ws.onopen = () => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, ydoc);
    send(encoding.toUint8Array(encoder));

    const localState = awareness.getLocalState();
    if (localState) {
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, messageAwareness);
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, [ydoc.clientID]),
      );
      send(encoding.toUint8Array(awarenessEncoder));
    }
  };

  ws.onmessage = (event) => {
    const data = new Uint8Array(event.data);
    const decoder = decoding.createDecoder(data);
    const encoder = encoding.createEncoder();
    const messageType = decoding.readVarUint(decoder);

    if (messageType === messageSync) {
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.readSyncMessage(decoder, encoder, ydoc, ws);

      if (encoding.length(encoder) > 1) {
        send(encoding.toUint8Array(encoder));
      }
      return;
    }

    if (messageType === messageAwareness) {
      awarenessProtocol.applyAwarenessUpdate(
        awareness,
        decoding.readVarUint8Array(decoder),
        ws,
      );
    }
  };

  ydoc.on('update', (update, origin) => {
    if (origin === ws) {
      return;
    }

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
    send(encoding.toUint8Array(encoder));
  });

  awareness.on('update', ({ added, updated, removed }, origin) => {
    if (origin === ws) {
      return;
    }

    const changedClients = added.concat(updated, removed);
    if (changedClients.length === 0) {
      return;
    }

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients),
    );
    send(encoding.toUint8Array(encoder));
  });

  const destroy = () => {
    awareness.destroy();
    ydoc.destroy();
    ws.close();
  };

  return {
    ydoc,
    ytext,
    awareness,
    ws,
    destroy,
  };
}
```

绑定 textarea 的最小示例：

```ts
const client = createCollabClient({
  baseWsUrl: 'ws://localhost:3000',
  docId,
  accessToken,
});

const textarea = document.querySelector('textarea')!;

client.ytext.observe(() => {
  const value = client.ytext.toString();
  if (textarea.value !== value) {
    textarea.value = value;
  }
});

textarea.addEventListener('input', () => {
  client.ydoc.transact(() => {
    client.ytext.delete(0, client.ytext.length);
    client.ytext.insert(0, textarea.value);
  });
});

client.awareness.setLocalStateField('user', {
  name: currentUser.username,
  color: currentUser.color,
});

window.addEventListener('beforeunload', () => {
  client.destroy();
});
```

实际项目建议使用编辑器绑定库，例如：

- `y-codemirror.next`
- `y-prosemirror`
- `y-quill`
- `@tiptap/extension-collaboration`
- `@tiptap/extension-collaboration-caret`

核心原则是：编辑器只和本地 `Y.Doc` 绑定，网络同步只负责同步 Yjs update。

## 7. collab2 前端接入说明

`/collab2` 服务端内部使用官方 `y-websocket/bin/utils` 的 `setupWSConnection`，协议本身和官方 `WebsocketProvider` 兼容。

但当前服务端 gateway path 是固定的 `/collab2`，并通过 query 参数 `docId` 指定文档：

```text
ws://localhost:3000/collab2?docId=1&accessToken=xxx
```

官方 `WebsocketProvider` 默认会把 `roomname` 拼到 URL 后：

```ts
new WebsocketProvider('ws://localhost:3000/collab2', '1', ydoc);
```

实际会连接：

```text
ws://localhost:3000/collab2/1
```

这和当前 Nest gateway path `/collab2` 不完全一致。因此，前端如果要直接使用官方 `WebsocketProvider`，需要后端额外兼容 `/collab2/:docId` 这种路径，或者前端使用第 6 节的原生 WebSocket 协议实现方式。

当前不改后端时，建议前端优先接 `/collab1`。

## 8. 推荐接入流程

1. 用户登录，前端保存 access token。
2. 调用 `POST /document/create` 创建文档，或调用 `GET /document/getList` 获取已有文档。
3. 拿到 `docId` 后连接 `/collab1?docId=...&accessToken=...`。
4. 创建本地 `Y.Doc`，将编辑器绑定到 `Y.Text` 或其他 Yjs shared type。
5. WebSocket open 后发送 sync step 1。
6. 收到远端 sync/awareness 消息后应用到本地 `Y.Doc` / awareness。
7. 本地 `Y.Doc` update 后编码为 sync update 发给服务端。
8. 页面卸载或切换文档时销毁 awareness、Y.Doc 并关闭 WebSocket。

## 9. 前端注意事项

- `docId` 必须是数字或数字字符串，例如 `1`、`"1"`，不能使用 `"a8126"` 这类非数字 ID。
- WebSocket 是二进制协议，必须设置 `ws.binaryType = 'arraybuffer'`。
- 不要把完整文本作为普通 JSON 通过 WebSocket 发给 `/collab1` 或 `/collab2`。
- 不要使用 Socket.IO 客户端连接这两个 path。
- token 放 query 参数会出现在浏览器网络面板和服务日志中，生产环境建议使用 HTTPS/WSS，并控制日志脱敏。
- 同一个浏览器多标签可以同时连接同一文档，Yjs 会自动合并更新。
- 服务端保存是防抖异步保存，不要把 WebSocket send 成功等同于数据库已经立即落库。
- 当前权限模型只支持创建者协同，如果产品需要多人授权编辑，需要后端扩展协作者表和 `validateDocumentAccess`。

## 10. 排查清单

| 现象 | 优先检查 |
| --- | --- |
| WebSocket 连接立刻断开，code `4000` | URL 是否带 `docId` |
| WebSocket 连接立刻断开，reason `unauthorized` | access token 是否存在、是否过期、JWT secret 是否一致 |
| WebSocket 连接立刻断开，reason `forbidden` | 当前 token 用户是否是文档创建者 |
| WebSocket 连接立刻断开，reason `document_not_found` | `docId` 对应文档是否存在 |
| WebSocket 连接失败 404 或无法升级 | 是否用了 Socket.IO、路径是否是 `/collab1` 或 `/collab2` |
| 多人编辑不同步 | 是否发送/解析 Yjs 二进制协议，是否误发 JSON |
| 在线用户不更新 | 查询 `/yjs-storage/sessions/{docId}`，并检查断开连接是否触发 |
| 刷新后内容丢失 | 检查 `documents.content` 是否保存快照，服务端日志是否有 saveSnapshot 错误 |

