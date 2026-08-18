# 协同功能 API 文档

本文档描述了基于现有 Yjs 协同编辑能力扩展的新功能模块 API。

## 目录

1. [协同白板/绘图功能](#1-协同白板绘图功能)
2. [实时聊天/评论系统](#2-实时聊天评论系统)
3. [任务看板/项目管理](#3-任务看板项目管理)
4. [表格协作编辑](#4-表格协作编辑)
5. [多媒体内容支持](#5-多媒体内容支持)
6. [WebSocket 实时通信](#6-websocket-实时通信)

---

## 1. 协同白板/绘图功能

### 1.1 创建白板

**POST** `/whiteboard`

**请求体：**
`json
{
  "documentId": 1,
  "title": "项目架构图",
  "description": "用于绘制项目架构图的协作白板"
}
`

**响应：**
`json
{
  "code": 200,
  "message": "白板创建成功",
  "data": {
    "id": 1,
    "documentId": 1,
    "title": "项目架构图",
    "description": "用于绘制项目架构图的协作白板",
    "version": 0,
    "createdBy": 1,
    "createdAt": "2026-08-17T10:00:00.000Z",
    "updatedAt": "2026-08-17T10:00:00.000Z"
  }
}
`

### 1.2 获取白板详情

**GET** `/whiteboard/:id`

### 1.3 获取文档下的所有白板

**GET** `/whiteboard/document/:documentId`

### 1.4 更新白板信息

**PUT** `/whiteboard/:id`

### 1.5 删除白板

**DELETE** `/whiteboard/:id`

### 1.6 添加白板元素

**POST** `/whiteboard/:id/element`

**请求体：**
`json
{
  "elementType": "pen",
  "properties": {
    "points": [[0, 0], [100, 100]],
    "strokeColor": "#000000",
    "strokeWidth": 2
  },
  "zIndex": 0
}
`

**支持的元素类型：**
- `pen` - 画笔
- `shape` - 形状
- `text` - 文字
- `image` - 图片
- `line` - 线条
- `arrow` - 箭头

### 1.7 更新白板元素

**PUT** `/whiteboard/:id/element/:elementId`

### 1.8 删除白板元素

**DELETE** `/whiteboard/:id/element/:elementId`

---

## 2. 实时聊天/评论系统

### 2.1 创建聊天室

**POST** `/chat/room`

**请求体：**
`json
{
  "documentId": 1,
  "name": "文档讨论区"
}
`

### 2.2 获取聊天室信息

**GET** `/chat/room/:documentId`

### 2.3 发送消息

**POST** `/chat/room/:documentId/message`

**请求体：**
`json
{
  "content": "大家好，这个文档需要修改一下",
  "messageType": "text",
  "parentId": null,
  "mentions": [1, 2, 3]
}
`

**消息类型：**
- `text` - 文本消息
- `image` - 图片消息
- `file` - 文件消息
- `system` - 系统消息

### 2.3.1 创建正文备注

**POST** `/chat/room/:documentId/comment`

用于前端框选正文后创建备注。后端会把备注根消息标记为
`contextType = inline_comment`，并保存框选时的原文。

**请求体：**

```json
{
  "content": "这里的结论需要补充数据来源",
  "quotedText": "本季度收入同比增长 20%",
  "mentions": []
}
```

### 2.3.2 获取正文备注讨论串

**GET** `/chat/message/:messageId/thread`

一次返回备注根消息和按时间正序排列的全部回复：

```json
{
  "message": {
    "id": 10,
    "contextType": "inline_comment",
    "quotedText": "本季度收入同比增长 20%",
    "content": "这里的结论需要补充数据来源"
  },
  "replies": []
}
```

旧的普通聊天消息保持 `contextType = chat`。回复会自动继承根消息的场景类型。

### 2.4 获取消息列表

**GET** `/chat/room/:documentId/messages`

**查询参数：**
- `page` - 页码（默认 1）
- `limit` - 每页数量（默认 50）
- `before` - 获取此消息ID之前的消息

### 2.5 获取消息的回复列表

**GET** `/chat/message/:messageId/replies`

### 2.6 更新消息

**PUT** `/chat/message/:messageId`

### 2.7 删除消息

**DELETE** `/chat/message/:messageId`

### 2.8 添加表情反应

**POST** `/chat/message/:messageId/reaction`

**请求体：**
`json
{
  "emoji": "👍"
}
`

---

## 3. 任务看板/项目管理

### 3.1 创建任务看板

**POST** `/task-board`

**请求体：**
`json
{
  "documentId": 1,
  "title": "项目任务看板",
  "description": "用于管理项目任务的看板"
}
`

**默认创建三列：**
- 待办（红色）
- 进行中（黄色）
- 已完成（绿色）

### 3.2 获取看板详情

**GET** `/task-board/:id`

### 3.3 获取文档下的所有看板

**GET** `/task-board/document/:documentId`

### 3.4 更新看板

**PUT** `/task-board/:id`

### 3.5 删除看板

**DELETE** `/task-board/:id`

### 3.6 创建列

**POST** `/task-board/:id/column`

### 3.7 更新列

**PUT** `/task-board/column/:columnId`

### 3.8 删除列

**DELETE** `/task-board/column/:columnId`

### 3.9 创建任务卡片

**POST** `/task-board/column/:columnId/card`

**请求体：**
`json
{
  "title": "完成前端页面开发",
  "description": "需要完成用户登录页面的开发",
  "priority": "medium",
  "dueDate": "2026-12-31",
  "assigneeId": 1,
  "tags": ["前端", "紧急"],
  "position": 0
}
`

**优先级：**
- `low` - 低
- `medium` - 中
- `high` - 高
- `urgent` - 紧急

### 3.10 更新任务卡片

**PUT** `/task-board/card/:cardId`

### 3.11 移动任务卡片

**PUT** `/task-board/card/:cardId/move`

**请求体：**
`json
{
  "targetColumnId": 2,
  "position": 0
}
`

### 3.12 删除任务卡片

**DELETE** `/task-board/card/:cardId`

---

## 4. 表格协作编辑

### 4.1 创建表格

**POST** `/spreadsheet`

**请求体：**
`json
{
  "documentId": 1,
  "title": "销售数据表",
  "rowCount": 100,
  "colCount": 26
}
`

### 4.2 获取表格详情

**GET** `/spreadsheet/:id`

### 4.3 获取文档下的所有表格

**GET** `/spreadsheet/document/:documentId`

### 4.4 更新表格信息

**PUT** `/spreadsheet/:id`

### 4.5 删除表格

**DELETE** `/spreadsheet/:id`

### 4.6 获取单元格数据

**GET** `/spreadsheet/:id/cell?row=0&col=0`

### 4.7 更新单个单元格

**PUT** `/spreadsheet/:id/cell`

**请求体：**
`json
{
  "row": 0,
  "col": 0,
  "value": "Hello World",
  "formula": null,
  "format": {
    "bold": true,
    "fontSize": 12
  }
}
`

### 4.8 批量更新单元格

**PUT** `/spreadsheet/:id/cells`

**请求体：**
`json
{
  "cells": [
    {"row": 0, "col": 0, "value": "Name"},
    {"row": 0, "col": 1, "value": "Age"}
  ]
}
`

### 4.9 删除单元格

**DELETE** `/spreadsheet/:id/cell?row=0&col=0`

---

## 5. 多媒体内容支持

### 5.1 上传媒体文件

**POST** `/media/upload`

**请求体：**
`json
{
  "documentId": 1,
  "fileName": "photo.jpg",
  "fileType": "image",
  "fileSize": 1024000,
  "filePath": "/uploads/media/photo.jpg",
  "mimeType": "image/jpeg",
  "metadata": {
    "width": 1920,
    "height": 1080
  }
}
`

**文件类型：**
- `image` - 图片
- `video` - 视频
- `audio` - 音频

### 5.2 获取媒体文件详情

**GET** `/media/:id`

### 5.3 获取文档下的所有媒体文件

**GET** `/media/document/:documentId`

**查询参数：**
- `fileType` - 文件类型过滤（image/video/audio）

### 5.4 更新媒体文件信息

**PUT** `/media/:id`

### 5.5 删除媒体文件

**DELETE** `/media/:id`

### 5.6 创建标注

**POST** `/media/:id/annotation`

**请求体：**
`json
{
  "annotationType": "comment",
  "content": "这里需要修改一下",
  "position": {"x": 100, "y": 200, "width": 300, "height": 150},
  "startTime": 10.5,
  "endTime": 15.0
}
`

**标注类型：**
- `comment` - 评论
- `highlight` - 高亮
- `drawing` - 绘图
- `timestamp` - 时间戳

### 5.7 获取媒体文件的标注列表

**GET** `/media/:id/annotations`

### 5.8 更新标注

**PUT** `/media/annotation/:annotationId`

### 5.9 删除标注

**DELETE** `/media/annotation/:annotationId`

---

## 6. WebSocket 实时通信

### 6.1 连接地址

`
ws://localhost:3000/collab-features?feature={feature}&roomId={roomId}&accessToken={token}
`

### 6.2 支持的功能类型

- `whiteboard` - 协同白板
- `chat` - 实时聊天
- `task-board` - 任务看板
- `spreadsheet` - 表格协作
- `media` - 多媒体标注

### 6.3 白板消息类型

- `element_added` - 元素添加
- `element_updated` - 元素更新
- `element_deleted` - 元素删除
- `cursor_move` - 光标移动

### 6.4 聊天消息类型

- `new_message` - 新消息
- `typing` - 输入状态
- `reaction_added` - 表情反应

### 6.5 任务看板消息类型

- `card_created` - 卡片创建
- `card_updated` - 卡片更新
- `card_deleted` - 卡片删除
- `card_moved` - 卡片移动

### 6.6 表格消息类型

- `cell_updated` - 单元格更新
- `cells_batch_updated` - 批量单元格更新
- `cursor_move` - 光标移动
- `selection_change` - 选区变化

### 6.7 媒体消息类型

- `annotation_created` - 标注创建
- `annotation_updated` - 标注更新
- `annotation_deleted` - 标注删除
- `playback_sync` - 播放同步

---

## 权限说明

所有功能都遵循现有的权限模型：

- **owner** - 文档创建者，拥有所有权限
- **editor** - 编辑者，可以创建、编辑、删除内容
- **viewer** - 只读用户，只能查看内容

权限验证在每个 API 端点和 WebSocket 连接时自动执行。
