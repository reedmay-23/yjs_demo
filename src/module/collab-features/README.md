# 协同功能模块

本模块基于现有的 Yjs 协同编辑能力，扩展了以下五个核心功能模块。

## 功能模块

### 1. 协同白板/绘图功能 (whiteboard)

**功能特性：**
- 支持多人同时绘制、擦除、移动图形
- 实现简单的绘图工具（画笔、形状、文字、图片、线条、箭头）
- 支持图层层级管理
- 实时光标位置同步

**核心文件：**
- dto/whiteboard.dto.ts - 数据传输对象
- whiteboard.service.ts - 业务逻辑服务
- whiteboard.controller.ts - HTTP API 控制器
- whiteboard.module.ts - 模块定义

### 2. 实时聊天/评论系统 (chat)

**功能特性：**
- 在文档旁添加实时聊天面板
- 支持 @提及、消息回复、表情反应
- 支持文本、图片、文件、系统消息类型
- 消息编辑和软删除

**核心文件：**
- dto/chat.dto.ts - 数据传输对象
- chat.service.ts - 业务逻辑服务
- chat.controller.ts - HTTP API 控制器
- chat.module.ts - 模块定义

### 3. 任务看板/项目管理 (task-board)

**功能特性：**
- 在文档中嵌入 Kanban 看板
- 支持拖拽任务卡片、分配负责人
- 支持任务优先级、截止日期、标签
- 默认创建三列（待办、进行中、已完成）

**核心文件：**
- dto/task-board.dto.ts - 数据传输对象
- task-board.service.ts - 业务逻辑服务
- task-board.controller.ts - HTTP API 控制器
- task-board.module.ts - 模块定义

### 4. 表格协作编辑 (spreadsheet)

**功能特性：**
- 扩展文档支持表格编辑
- 支持多人同时编辑不同单元格
- 实现公式计算和数据验证
- 支持单元格格式设置

**核心文件：**
- dto/spreadsheet.dto.ts - 数据传输对象
- spreadsheet.service.ts - 业务逻辑服务
- spreadsheet.controller.ts - HTTP API 控制器
- spreadsheet.module.ts - 模块定义

### 5. 多媒体内容支持 (media)

**功能特性：**
- 图片、视频、音频的协同标注
- 支持多人同时标注和评论
- 支持时间戳标注（视频/音频）
- 标注位置信息管理

**核心文件：**
- dto/media.dto.ts - 数据传输对象
- media.service.ts - 业务逻辑服务
- media.controller.ts - HTTP API 控制器
- media.module.ts - 模块定义

## WebSocket 实时通信

所有功能模块通过统一的 WebSocket 网关进行实时通信：

**连接地址：**
ws://localhost:3000/collab-features?feature={feature}&roomId={roomId}&accessToken={token}

**支持的功能类型：**
- whiteboard - 协同白板
- chat - 实时聊天
- task-board - 任务看板
- spreadsheet - 表格协作
- media - 多媒体标注

## 权限控制

所有功能模块都遵循现有的权限模型：

- owner - 文档创建者，拥有所有权限
- editor - 编辑者，可以创建、编辑、删除内容
- viewer - 只读用户，只能查看内容

权限验证在每个 API 端点和 WebSocket 连接时自动执行。

## 相关文档

- API 文档：docs/collab-features-api.md
- 前端对接文档：docs/collab-features-integration.md
