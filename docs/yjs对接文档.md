# Yjs 协同编辑前端对接文档

## 1. 推荐连接地址

前端优先使用 `/collab1`。

```text
ws://<host>/collab1?docId=<documentId>&accessToken=<accessToken>
```

HTTPS 环境使用：

```text
wss://<host>/collab1?docId=<documentId>&accessToken=<accessToken>
```

不要传 `userId`。后端只信任 `accessToken` 里的用户身份。

浏览器原生 `WebSocket` 不能自定义 `Authorization` header，所以浏览器端推荐通过 query 传 `accessToken`。

## 2. 实时在线人数

在线人数推送是可选能力，必须显式开启。

```text
ws://<host>/collab1?docId=<documentId>&accessToken=<accessToken>&presence=1
```

只有当前端已经处理 `messagePresence = 2` 时，才加 `presence=1`。

不加 `presence=1` 时，后端不会发送在线人数推送，只发送 Yjs sync 和 awareness 消息。这样旧前端不会因为不认识新消息类型而出错。

## 3. 在线人数怎么维护

后端维护的是“文档内在线用户数”，不是 WebSocket 连接数。

也就是说，同一个用户在同一个文档打开多个标签页，只算 1 个在线用户。

后端内部维护规则：

```text
docId -> userId -> connectionCount
```

规则如下：

- 用户在某文档第一个连接进入：`connectionCount` 从 `0` 变成 `1`，数据库 `collaboration_sessions.isActive=true`。
- 同一用户同一文档第二个连接进入：只增加内存连接计数，不重复增加在线人数。
- 用户关闭一个标签页但还有其他连接：只减少连接计数，不推送在线人数变化。
- 用户最后一个连接断开：`connectionCount` 归零，数据库 `isActive=false`，推送在线人数变化。

后端只在在线人数实际变化时推送：

- `0 -> 1`：用户上线，推送 `onlineUsersChanged`
- `1 -> 0`：用户离线，推送 `onlineUsersChanged`
- `1 -> 2` 或 `2 -> 1`：同一用户多标签变化，不推送

前端不需要自己对在线用户去重，后端返回和推送的 `users` 已经是按用户维度维护后的结果。

## 4. 消息类型

`/collab1` 是二进制 WebSocket 协议，不是 JSON WebSocket，也不是 Socket.IO。

```ts
const messageSync = 0;
const messageAwareness = 1;
const messagePresence = 2;
```

说明：

- `messageSync`：Yjs 文档同步消息。
- `messageAwareness`：Yjs awareness 消息，例如光标、选区、临时用户状态。
- `messagePresence`：项目自定义在线人数消息，只有连接带 `presence=1` 时才会收到。

不要直接向 `/collab1` 发送普通 JSON。

## 5. 初始历史内容加载

WebSocket 连接成功后，后端会主动发送一条：

```ts
messageSync = 0
```

这条消息内部是 Yjs `SyncStep2`，包含服务端当前保存的 Y.Doc 快照。

前端必须用正常的 Yjs sync 处理逻辑接收：

```ts
syncProtocol.readSyncMessage(decoder, encoder, ydoc, ws);
```

如果前端忽略这条初始 `SyncStep2`，编辑器可能显示空白，因为历史 Y.Doc 内容没有应用到本地 `ydoc`。

## 6. 前端 WebSocket 解析示例

```ts
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { Awareness } from 'y-protocols/awareness';

const messageSync = 0;
const messageAwareness = 1;
const messagePresence = 2;

const ydoc = new Y.Doc();
const awareness = new Awareness(ydoc);

const ws = new WebSocket(
  `ws://localhost:3000/collab1?docId=${docId}&accessToken=${encodeURIComponent(accessToken)}&presence=1`,
);

ws.binaryType = 'arraybuffer';

function send(message: Uint8Array) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(message);
  }
}

ws.onopen = () => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, ydoc);
  send(encoding.toUint8Array(encoder));
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
    return;
  }

  if (messageType === messagePresence) {
    const jsonBytes = decoding.readVarUint8Array(decoder);
    const payload = JSON.parse(new TextDecoder().decode(jsonBytes));

    if (payload.type === 'onlineUsersChanged') {
      setOnlineUsers(payload.users);
      setOnlineCount(payload.count);
    }
    return;
  }

  console.warn('Unsupported collab message type:', messageType);
};
```

如果暂时不接实时在线人数，把 URL 里的 `presence=1` 去掉，并且可以先不处理 `messagePresence`。

## 7. 发送本地 Yjs 更新

监听本地 `ydoc` 更新后，通过 `messageSync = 0` 发给后端。

```ts
ydoc.on('update', (update, origin) => {
  if (origin === ws) {
    return;
  }

  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  send(encoding.toUint8Array(encoder));
});
```

注意：编辑器应绑定到本地 `ydoc`，不要直接把完整文本 JSON 发给 `/collab1`。

## 8. 在线用户 HTTP 快照

页面进入文档时，建议先拉一次 HTTP 快照，再用 WebSocket 推送做实时更新。

```http
GET /yjs-storage/sessions/:docId
Authorization: Bearer <accessToken>
```

返回的 `data` 是当前在线用户会话列表。

单条数据结构：

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

前端可以这样初始化：

```ts
const sessions = await getOnlineSessions(docId);
setOnlineUsers(sessions.map((session) => session.user));
setOnlineCount(sessions.length);
```

## 9. 在线人数推送事件

当连接带 `presence=1` 时，后端会推送：

```ts
type OnlineUsersChangedEvent = {
  type: 'onlineUsersChanged';
  docId: string;
  count: number;
  users: Array<{
    id: number;
    username: string;
    account: string;
  }>;
};
```

示例：

```json
{
  "type": "onlineUsersChanged",
  "docId": "12",
  "count": 2,
  "users": [
    {
      "id": 3,
      "username": "alice",
      "account": "alice@example.com"
    },
    {
      "id": 5,
      "username": "bob",
      "account": "bob@example.com"
    }
  ]
}
```

前端收到后直接覆盖当前在线用户状态即可：

```ts
setOnlineUsers(event.users);
setOnlineCount(event.count);
```

## 10. 推荐前端流程

1. 页面进入文档，拿到 `docId` 和 `accessToken`。
2. 调用 `GET /yjs-storage/sessions/:docId` 拉一次在线用户快照。
3. 创建本地 `Y.Doc`。
4. 建立 `/collab1` WebSocket。
5. 如果需要实时在线人数，URL 加 `presence=1`。
6. `ws.binaryType = 'arraybuffer'`。
7. `onmessage` 同时处理 `messageSync`、`messageAwareness`、`messagePresence`。
8. 编辑器绑定到本地 `ydoc`。
9. 页面卸载时销毁 awareness、Y.Doc，并关闭 WebSocket。

## 11. 常见问题

### 编辑器连接成功但是内容空白

重点检查：

- 是否设置了 `ws.binaryType = 'arraybuffer'`。
- 是否处理了服务端初始发送的 `messageSync`。
- 是否调用了 `syncProtocol.readSyncMessage(...)`。
- 编辑器是否真的绑定到了 `ydoc.getText('document')` 或项目约定的 Yjs 类型。

### 加了实时在线人数后页面报错

检查是否处理了：

```ts
messagePresence = 2
```

如果暂时没处理，先去掉 URL 里的 `presence=1`。

### 在线人数不准

先确认前端是否：

- 页面进入时拉了 `GET /yjs-storage/sessions/:docId`。
- WebSocket URL 是否加了 `presence=1`。
- 收到 `onlineUsersChanged` 后是否直接使用后端返回的 `users/count`。

不要前端自己按标签页或连接数统计在线人数。

### 用户身份不对

不要传 `userId`。后端只使用 access token 中的 `sub`。

## 12. 维护注意事项

- `/collab1` 的在线人数推送是 opt-in，不能默认给所有连接发送 `messagePresence`。
- 如果后端未来多实例部署，在线连接计数需要迁移到 Redis 等共享存储，否则不同 Node 进程之间在线人数会不一致。
- 如果服务异常退出，数据库可能残留 `isActive=true`，生产环境建议增加心跳过期或启动清理机制。
