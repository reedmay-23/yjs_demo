# 2026-07-02 viewer/editor 写作权限更新

## 主要内容

本次更新完善文档协作者的 `viewer` / `editor` 权限模型：

- `owner`：文档创建者，拥有全部权限。
- `editor`：可查看文档、查看协作者、查看在线会话，并可进入 Yjs WebSocket 协作编辑。
- `viewer`：可查看文档相关只读信息，但不能进入当前写作协作 WebSocket。

## 权限规则

统一权限校验入口：

```ts
validateDocumentAccess(docId, userId, requiredAccess)
```

`requiredAccess` 支持：

- `read`：owner、editor、viewer 都允许。
- `write`：仅 owner、editor 允许。

当前写作协作入口 `/collab1` 和 `/collab2` 都要求 `write` 权限，因此 `viewer` 建立 WebSocket 连接时会被拒绝，关闭原因是 `forbidden` 或 `viewer role is read-only` 对应的权限失败。

## 接口更新

### 添加协作者

```http
POST /document/collaborators/add
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "documentId": 1,
  "userId": 2,
  "role": "viewer"
}
```

`role` 可选，支持：

- `viewer`
- `editor`

不传时默认 `editor`。

### 查询协作者列表

```http
POST /document/collaborators/list
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "documentId": 1
}
```

owner、editor、viewer 都可以查询。

### 修改协作者角色

```http
POST /document/collaborators/update-role
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "documentId": 1,
  "userId": 2,
  "role": "editor"
}
```

限制：

- 只有 owner 可以修改协作者角色。
- 不能通过该接口修改 owner。
- 目标用户必须已经是该文档协作者。
- `role` 只能是 `viewer` 或 `editor`。

## 前端对接建议

文档列表已经返回当前用户相对该文档的 `role` 字段。前端建议按角色处理：

- `owner`：显示协作者管理入口、删除文档入口、编辑入口。
- `editor`：显示编辑入口。
- `viewer`：显示只读标识，不要主动连接 `/collab1` 或 `/collab2` 写作协作入口。

如果后续需要真正的只读预览，应新增只读文档内容读取接口，或在协作协议层实现 viewer 只接收同步、不发送 update 的只读模式。

## 本次涉及文件

- `src/module/document/dto/add-collaborator.dto.ts`
- `src/module/document/document.controller.ts`
- `src/module/document/document.service.ts`
- `src/module/yjs-storage/yjs-storage.service.ts`
- `src/yjs/yjs.gateway.ts`
- `src/yjs/yjs-persistence.gateway.ts`
- `src/module/document/document.service.spec.ts`
- `src/module/yjs-storage/yjs-storage.service.spec.ts`
