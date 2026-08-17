# 2026-07-13 协同功能增强备注

本次补充四个能力：权限变更实时生效、手动保存关键版本、Tiptap 历史对比快照、Yjs 增量 update 日志。

## 1. 权限变更实时生效

触发场景：

- owner 移除协作者。
- owner 把协作者角色从 `editor` 改成 `viewer`。

服务端行为：

- `DocumentService.removeCollaborator` 删除授权后发出 `collaborator_removed` 事件。
- `DocumentService.updateCollaboratorRole` 降级为 `viewer` 后发出 `permission_changed` 事件。
- `/collab1` 和 `/collab2` 收到事件后关闭该用户在对应文档下的 WebSocket。

WebSocket 关闭信息：

| close code | reason | 前端处理 |
| --- | --- | --- |
| `4403` | `collaborator_removed` | 销毁 editor/Y.Doc，退出文档页或切换为无权限状态 |
| `4403` | `permission_changed` | 销毁 editor/Y.Doc，重新拉取文档详情；如果变成 viewer，只进入只读模式 |

备注：

- 这是进程内事件，当前适合单实例部署。
- 多实例部署时需要 Redis Pub/Sub 或消息队列广播权限变更事件。

## 2. 手动保存关键版本

接口：

```http
POST /document/history/manual-snapshot
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "documentId": 1,
  "summary": "提交评审前版本"
}
```

权限：

- `owner` 可保存。
- `editor` 可保存。
- `viewer` 不可保存。

服务端行为：

- 基于当前 `documents.content` 创建一条 `document_histories` 记录。
- `action = manual_snapshot`。
- 不参与 5 分钟 `edit` 自动历史合并。

备注：

- 这个接口保存的是数据库当前快照。如果前端刚编辑完立即点击，建议先等待自动保存完成，或后续扩展“强制 flush 当前房间”能力。
- 手动版本适合做“重要节点版本”，自动 `edit` 历史适合兜底恢复。

## 3. Tiptap 历史对比快照

接口：

```http
POST /document/history/compare-snapshot
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "documentId": 1,
  "historyId": 10,
  "field": "default"
}
```

权限：

- `owner`、`editor`、`viewer` 均可获取。

响应核心结构：

```ts
type CompareSnapshotResponse = {
  history: {
    id: number;
    version: number;
    action: string;
    summary: string | null;
    sourceVersion: number | null;
    createdAt: string;
    user: { id: number; username: string; account: string };
    update: number[];
  };
  current: {
    documentId: number;
    version: number;
    updatedAt: string;
    update: number[];
  };
  yjs: {
    type: 'tiptap';
    field: string;
  };
  note: string;
};
```

前端处理：

```ts
const historyDoc = new Y.Doc();
Y.applyUpdate(historyDoc, Uint8Array.from(res.history.update));

const currentDoc = new Y.Doc();
Y.applyUpdate(currentDoc, Uint8Array.from(res.current.update));
```

然后用相同 Tiptap extensions/schema 分别渲染两个 editor，再做富文本 diff 或左右对比。

备注：

- 后端不直接 diff Tiptap 富文本，因为后端没有前端完整 schema/extensions。
- `field` 默认是 `default`；如果前端 `Collaboration.configure({ field })` 自定义了名称，调用接口时必须传同一个值。

## 4. Yjs 增量 Update 日志

新增表：`document_updates`

| 字段 | 含义 |
| --- | --- |
| `id` | 日志 ID |
| `document_id` | 文档 ID |
| `user_id` | 产生 update 的用户，可为空 |
| `update` | 原始 Yjs update，JSON `number[]` |
| `byte_length` | update 字节长度 |
| `created_at` | 记录时间 |

写入时机：

- `/collab1` 收到用户产生的 Yjs update 时写入。
- `/collab2` 收到用户产生的 Yjs update 时写入。
- 数据库恢复来源 `origin = 'database'` 不写入。

备注：

- 这是 append-only 日志的基础版本，用于排查问题和后续增强可靠性。
- 目前快照仍由 `documents.content` 承担主恢复路径。
- 后续可做“按 update 日志重放恢复”“定期压缩快照”“清理过旧 update 日志”。
- 高频编辑会产生较多日志，生产环境建议增加保留策略或后台压缩任务。

## 本次相关文件

| 文件 | 说明 |
| --- | --- |
| `prisma/schema.prisma` | 新增 `DocumentUpdate` |
| `prisma/migrations/20260713000000_document_updates/migration.sql` | 新增 `document_updates` 表 |
| `src/module/yjs-storage/yjs-storage.service.ts` | 手动版本、对比快照、增量 update 日志 |
| `src/module/yjs-storage/yjs-room-events.service.ts` | 回退和权限变更房间事件 |
| `src/module/document/document.service.ts` | 历史接口与权限变更事件触发 |
| `src/yjs/yjs.gateway.ts` | `/collab1` 权限变更关闭连接、记录 update 日志 |
| `src/yjs/yjs-persistence.gateway.ts` | `/collab2` 权限变更关闭连接、记录 update 日志 |
