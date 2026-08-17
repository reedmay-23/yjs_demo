# Yjs 文档历史记录与回退

本文说明用户修改历史、Yjs 文档版本回退、权限分配和前端展示字段。

## 功能范围

- Yjs 快照仍会按防抖策略保存到 `documents.content`。
- `edit` 历史不会每次自动保存都新增；同一文档、同一用户 5 分钟内会合并到最近一条 `edit` 记录。
- 回退会把目标历史记录里的 Y.Doc 快照写回 `documents.content`。
- 回退后会新增一条 `rollback` 历史记录。
- 历史记录会返回操作者 `user`、操作时间 `createdAt`、当前版本 `version`、回退来源版本 `sourceVersion`。
- 前端可以直接展示“某人在某时间回退到了某版本”。

## 数据表

新增表：`document_histories`

| 字段 | 含义 |
| --- | --- |
| `id` | 历史记录 ID |
| `document_id` | 文档 ID |
| `user_id` | 操作者 ID |
| `version` | 本次操作生成的文档版本 |
| `action` | 操作类型：`edit`、`rollback`、`metadata_update` |
| `summary` | 操作说明 |
| `content` | 可恢复的 Y.Doc 快照，JSON `number[]` |
| `source_version` | 回退来源版本，仅 `rollback` 使用 |
| `created_at` | 操作时间 |

关系：

- `Document.histories -> DocumentHistory[]`
- `User.documentHistories -> DocumentHistory[]`

## 权限规则

历史列表：

- `owner` 可查看。
- `editor` 可查看。
- `viewer` 可查看。

版本回退：

- `owner` 可回退。
- `editor` 可回退。
- `viewer` 不可回退。

实现上复用 `YjsStorageService.validateDocumentAccess`：

- 历史列表调用 `requiredAccess = 'read'`。
- 回退调用 `requiredAccess = 'write'`。

## 在线回退规则

回退支持在线房间：

- 回退接口会先把历史快照写回 `documents.content`。
- 回退成功后会发送房间事件。
- `/collab1` 会关闭该文档所有在线 WebSocket，并丢弃当前内存 Y.Doc。
- `/collab2` 会关闭官方 `y-websocket` doc 的所有连接，并丢弃当前内存 doc。
- 客户端重连后会从数据库加载回退后的 Y.Doc 快照。

WebSocket 关闭信息：

| close code | reason | 含义 |
| --- | --- | --- |
| `4409` | `document_rolled_back` | 文档已被回退，客户端必须销毁本地 Tiptap editor / Y.Doc 后重新连接 |

前端不要在收到 `document_rolled_back` 后继续复用旧 `Y.Doc`。Tiptap 协同状态在本地也有 CRDT 内容，必须重新创建 editor 和 `Y.Doc`，否则旧内容可能再次同步回来。

## 编辑历史合并规则

自动保存和历史版本是两层逻辑：

```text
documents.content:
  继续按 1 秒防抖保存最新完整 Y.Doc 快照

document_histories:
  edit: 同一文档 + 同一用户 + 5 分钟窗口内合并
  rollback: 每次回退都新增，不合并
```

合并 `edit` 历史时，服务端会更新最近一条记录的：

- `content`：覆盖为最新完整 Y.Doc 快照。
- `version`：更新为最新文档版本。
- `createdAt`：更新为最近一次保存时间。
- `sourceVersion`：保持为 `null`。

因此合并只会降低历史粒度，不会导致回退内容不完整。每条可回退历史里的 `content` 都是完整 Y.Doc 快照，不是增量 update。

当前合并窗口常量在 `YjsStorageService`：

```ts
private static readonly EDIT_HISTORY_MERGE_WINDOW_MS = 5 * 60 * 1000;
```

## HTTP 接口

所有接口都需要：

```http
Authorization: Bearer <accessToken>
Content-Type: application/json
```

### 获取历史记录

```http
POST /document/history/list

{
  "documentId": 1
}
```

响应：

```ts
type DocumentHistoryItem = {
  id: number;
  documentId: number;
  userId: number;
  version: number;
  action: 'edit' | 'rollback' | 'metadata_update';
  summary: string | null;
  sourceVersion: number | null;
  createdAt: string;
  contentSize: number;
  user: {
    id: number;
    username: string;
    account: string;
  };
};
```

说明：

- 返回结果按 `createdAt desc` 排序。
- 响应不返回完整 `content`，只返回 `contentSize`，避免把 Yjs 二进制快照暴露给列表 UI。
- `edit` 记录可能代表同一用户 5 分钟内连续编辑后的最新状态。

### 回退到历史版本

```http
POST /document/history/rollback

{
  "documentId": 1,
  "historyId": 10,
  "summary": "恢复到确认稿"
}
```

响应：

```ts
type RollbackResponse = {
  document: {
    id: number;
    title: string;
    summary: string | null;
    status: string;
    updatedAt: string;
    version: number;
  };
  rollbackHistory: {
    id: number;
    documentId: number;
    userId: number;
    version: number;
    action: 'rollback';
    summary: string | null;
    sourceVersion: number;
    createdAt: string;
    contentSize: number;
    user: {
      id: number;
      username: string;
      account: string;
    };
  };
  sourceHistoryId: number;
  sourceVersion: number;
};
```

### 手动保存关键版本

```http
POST /document/history/manual-snapshot

{
  "documentId": 1,
  "summary": "提交评审前版本"
}
```

说明：

- 需要写权限。
- 生成 `action = manual_snapshot` 的历史记录。
- 不参与 5 分钟自动 `edit` 历史合并。

### 获取 Tiptap 对比快照

```http
POST /document/history/compare-snapshot

{
  "documentId": 1,
  "historyId": 10,
  "field": "default"
}
```

说明：

- 需要读权限。
- 返回历史版本和当前版本的 Yjs update。
- 前端用相同 Tiptap extensions/schema 还原两个 Y.Doc 后做富文本对比。
- 后端不直接 diff 富文本，避免 schema 不一致导致结果不可靠。

## 前端展示建议

历史列表可以按 `action` 渲染：

```ts
function formatHistoryText(item: DocumentHistoryItem) {
  if (item.action === 'rollback') {
    return `${item.user.username} 在 ${item.createdAt} 回退到了版本 ${item.sourceVersion}`;
  }

  if (item.action === 'edit') {
    return `${item.user.username} 在 ${item.createdAt} 保存了版本 ${item.version}`;
  }

  return `${item.user.username} 在 ${item.createdAt} 更新了文档`;
}
```

回退按钮建议只在 `owner` / `editor` 角色显示。点击回退后：

1. 调用 `POST /document/history/rollback`。
2. 后端会关闭当前文档所有在线 WebSocket。
3. 前端收到 `close.code === 4409` 或 `close.reason === 'document_rolled_back'` 后，销毁当前 Tiptap editor 和 `Y.Doc`。
4. 重新创建 Tiptap editor / `Y.Doc` 并连接 WebSocket。
5. 新连接会加载回退后的 Y.Doc 快照。

## 常见错误

| HTTP 状态 | 场景 | 处理 |
| --- | --- | --- |
| `403` | `viewer` 调用回退，或用户无文档权限 | 隐藏回退入口或重新校验角色 |
| `404` | 文档或历史记录不存在 | 刷新历史列表 |
| `400` | 历史记录没有可恢复快照 | 禁用该记录的回退按钮 |
## 维护注意

- `document_histories.content` 保存的是完整 Y.Doc 快照，不是单次增量 update。
- `edit` 历史在 5 分钟窗口内合并，避免前端频繁发送 Yjs update 导致历史表爆炸。
- `documents.version` 每次保存快照和每次回退都会递增。
- `rollback` 记录的 `version` 是回退操作生成的新版本，`sourceVersion` 才是被回退到的目标版本。
- `rollback` 历史不合并，每次回退都需要单独审计。
- 在线回退依赖当前 Node 进程内的房间事件；如果后续做多实例部署，需要用 Redis Pub/Sub 或消息队列广播 `document_rolled_back` 事件到所有实例。
- 协作者被移除或从 editor 降级为 viewer 时，在线写协同连接会被关闭，关闭码 `4403`。
