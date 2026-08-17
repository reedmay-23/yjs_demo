# 2026-07-02 后端接口补充更新

## 主要内容

本次补充前端协作写作工作台需要的后端接口，减少前端依赖 localStorage、列表缓存和临时统计。

## 新增接口

### 获取当前用户

```http
GET /auth/me
Authorization: Bearer <accessToken>
```

返回当前 token 对应的用户：

```json
{
  "id": 1,
  "account": "system",
  "name": "system",
  "username": "system"
}
```

### 获取文档详情

```http
GET /document/detail/{id}
Authorization: Bearer <accessToken>
```

返回字段：

- `id`
- `title`
- `summary`
- `owner`
- `role`
- `status`
- `updatedAt`
- `createdAt`
- `version`
- `collaborators`

### 只读读取文档内容

```http
GET /document/read/{id}
Authorization: Bearer <accessToken>
```

用于 viewer 预览文档内容。该接口只要求 `read` 权限，不需要连接 `/collab1` 或 `/collab2`。

返回内容格式：

```json
{
  "content": {
    "type": "text",
    "text": "文档正文"
  }
}
```

### 更新文档元数据

```http
POST /document/update
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "id": 1,
  "title": "项目方案 v2",
  "summary": "更新后的摘要",
  "status": "active"
}
```

要求 `write` 权限，即 owner 或 editor 可更新，viewer 不可更新。

### 搜索用户

```http
GET /users/search?keyword=system
Authorization: Bearer <accessToken>
```

用于添加协作者时按账号或用户名搜索用户，最多返回 20 条。

### 文档统计

```http
GET /document/statistics
Authorization: Bearer <accessToken>
```

返回当前用户可访问文档范围内的统计：

- `totalDocuments`
- `todayUpdatedDocuments`
- `onlineCollaborators`

## 已完善接口行为

- `/document/getList`：返回项明确包含 `role`、`summary`、`status`、`owner`。
- `/document/collaborators/list`：返回 owner + collaborators，角色包含 `owner/editor/viewer`，并包含用户基础信息。
- `/document/create`：统一创建文档，同时初始化 Yjs 空内容，不需要前端再先调用 `/yjs-storage/create`。

## 数据模型变化

`documents` 增加字段：

- `summary String?`
- `status String @default("active")`

部署到已有数据库时需要同步数据库结构，例如执行 Prisma migration 或 db push。

## 本次涉及文件

- `prisma/schema.prisma`
- `src/module/auth/auth.controller.ts`
- `src/module/auth/auth.service.ts`
- `src/module/document/document.controller.ts`
- `src/module/document/document.service.ts`
- `src/module/document/dto/create-document.dto.ts`
- `src/module/document/dto/update-document.dto.ts`
- `src/module/user/user.controller.ts`
- `src/module/user/user.service.ts`
- `src/module/user/user.module.ts`
- `src/app.module.ts`
