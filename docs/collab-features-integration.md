# 协同功能前端对接文档

## 概述

本文档为前端开发人员提供协同功能模块的对接指南，包含 API 调用方式、WebSocket 连接、数据格式等内容。

## 一、功能模块概览

| 功能模块 | HTTP API 前缀 | WebSocket feature | 说明 |
|---------|--------------|-------------------|------|
| 协同白板 | /whiteboard | whiteboard | 多人绘图协作 |
| 实时聊天 | /chat | chat | 文档内实时沟通 |
| 任务看板 | /task-board | task-board | Kanban 任务管理 |
| 表格协作 | /spreadsheet | spreadsheet | 多人表格编辑 |
| 多媒体标注 | /media | media | 图片/视频/音频标注 |

## 二、认证方式

所有 API 请求需要在 Header 中携带 JWT Token：

```javascript
headers: {
  "Authorization": "Bearer <access_token>",
  "Content-Type": "application/json"
}
```

## 三、协同白板对接

### 3.1 创建白板

```javascript
const createWhiteboard = async (documentId, title) => {
  const response = await fetch("/whiteboard", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      documentId,
      title,
      description: "协作文档白板"
    })
  });
  return response.json();
};
```

### 3.2 添加绘图元素

```javascript
const addElement = async (whiteboardId, elementData) => {
  const response = await fetch(`/whiteboard/${whiteboardId}/element`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      elementType: "pen", // pen, shape, text, image, line, arrow
      properties: {
        points: [[0, 0], [100, 100]],
        strokeColor: "#000000",
        strokeWidth: 2
      },
      zIndex: 0
    })
  });
  return response.json();
};
```

### 3.3 WebSocket 实时同步

```javascript
// 连接白板房间
const connectWhiteboard = (roomId, accessToken) => {
  const ws = new WebSocket(
    `ws://localhost:3000/collab-features?feature=whiteboard&roomId=${roomId}&accessToken=${accessToken}`
  );

  ws.onopen = () => {
    console.log("已连接到白板房间");
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    switch (data.type) {
      case "element_added":
        addElementToCanvas(data.element);
        break;
      case "element_updated":
        updateElementOnCanvas(data.element);
        break;
      case "element_deleted":
        removeElementFromCanvas(data.elementId);
        break;
      case "cursor_move":
        updateCursorPosition(data.userId, data.position);
        break;
    }
  };

  return ws;
};
```

## 四、实时聊天对接

### 4.1 创建聊天室

```javascript
const createChatRoom = async (documentId, name) => {
  const response = await fetch("/chat/room", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ documentId, name })
  });
  return response.json();
};
```

### 4.2 发送消息

```javascript
const sendMessage = async (documentId, content, mentions = []) => {
  const response = await fetch(`/chat/room/${documentId}/message`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content,
      messageType: "text",
      mentions // @提及的用户ID数组
    })
  });
  return response.json();
};
```

### 4.3 WebSocket 实时聊天

```javascript
const connectChat = (roomId, accessToken) => {
  const ws = new WebSocket(
    `ws://localhost:3000/collab-features?feature=chat&roomId=${roomId}&accessToken=${accessToken}`
  );

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    switch (data.type) {
      case "new_message":
        appendMessage(data.message);
        break;
      case "typing":
        showTypingIndicator(data.userId, data.isTyping);
        break;
      case "reaction_added":
        updateMessageReactions(data.messageId, data.emoji, data.userId);
        break;
    }
  };

  return ws;
};
```

## 五、任务看板对接

### 5.1 创建看板

```javascript
const createTaskBoard = async (documentId, title) => {
  const response = await fetch("/task-board", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      documentId,
      title,
      description: "项目任务管理"
    })
  });
  return response.json();
};
```

### 5.2 创建任务卡片

```javascript
const createCard = async (columnId, cardData) => {
  const response = await fetch(`/task-board/column/${columnId}/card`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      title: cardData.title,
      description: cardData.description,
      priority: "medium", // low, medium, high, urgent
      dueDate: cardData.dueDate,
      assigneeId: cardData.assigneeId,
      tags: cardData.tags
    })
  });
  return response.json();
};
```

### 5.3 移动卡片（拖拽）

```javascript
const moveCard = async (cardId, targetColumnId, position) => {
  const response = await fetch(`/task-board/card/${cardId}/move`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      targetColumnId,
      position
    })
  });
  return response.json();
};
```

## 六、表格协作对接

### 6.1 创建表格

```javascript
const createSpreadsheet = async (documentId, title, rowCount, colCount) => {
  const response = await fetch("/spreadsheet", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      documentId,
      title,
      rowCount,
      colCount
    })
  });
  return response.json();
};
```

### 6.2 更新单元格

```javascript
const updateCell = async (spreadsheetId, row, col, value, formula) => {
  const response = await fetch(`/spreadsheet/${spreadsheetId}/cell`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      row,
      col,
      value,
      formula,
      format: {
        bold: false,
        fontSize: 12
      }
    })
  });
  return response.json();
};
```

## 七、多媒体标注对接

### 7.1 上传媒体文件

```javascript
const uploadMedia = async (documentId, file) => {
  const response = await fetch("/media/upload", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      documentId,
      fileName: file.name,
      fileType: file.type.startsWith("image") ? "image" : 
                file.type.startsWith("video") ? "video" : "audio",
      fileSize: file.size,
      filePath: file.path,
      mimeType: file.type
    })
  });
  return response.json();
};
```

### 7.2 创建标注

```javascript
const createAnnotation = async (mediaId, annotationData) => {
  const response = await fetch(`/media/${mediaId}/annotation`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      annotationType: "comment", // comment, highlight, drawing, timestamp
      content: annotationData.content,
      position: {
        x: annotationData.x,
        y: annotationData.y,
        width: annotationData.width,
        height: annotationData.height
      },
      startTime: annotationData.startTime,
      endTime: annotationData.endTime
    })
  });
  return response.json();
};
```

## 八、通用工具类

```javascript
class CollabAPI {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async request(method, path, body = null) {
    const options = {
      method,
      headers: {
        "Authorization": `Bearer ${this.token}`,
        "Content-Type": "application/json"
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}${path}`, options);
    return response.json();
  }

  // 白板 API
  async createWhiteboard(data) {
    return this.request("POST", "/whiteboard", data);
  }

  async addWhiteboardElement(id, data) {
    return this.request("POST", `/whiteboard/${id}/element`, data);
  }

  // 聊天 API
  async createChatRoom(data) {
    return this.request("POST", "/chat/room", data);
  }

  async sendMessage(documentId, data) {
    return this.request("POST", `/chat/room/${documentId}/message`, data);
  }

  // 任务看板 API
  async createTaskBoard(data) {
    return this.request("POST", "/task-board", data);
  }

  async createCard(columnId, data) {
    return this.request("POST", `/task-board/column/${columnId}/card`, data);
  }

  async moveCard(cardId, data) {
    return this.request("PUT", `/task-board/card/${cardId}/move`, data);
  }

  // 表格 API
  async createSpreadsheet(data) {
    return this.request("POST", "/spreadsheet", data);
  }

  async updateCell(id, data) {
    return this.request("PUT", `/spreadsheet/${id}/cell`, data);
  }

  // 多媒体 API
  async uploadMedia(data) {
    return this.request("POST", "/media/upload", data);
  }

  async createAnnotation(mediaId, data) {
    return this.request("POST", `/media/${mediaId}/annotation`, data);
  }
}

// 使用示例
const api = new CollabAPI("http://localhost:3000", token);
const whiteboard = await api.createWhiteboard({
  documentId: 1,
  title: "项目架构图"
});
```

## 九、注意事项

1. **权限验证**：所有 API 请求都需要有效的 JWT Token
2. **错误处理**：统一处理 API 返回的错误码和错误信息
3. **WebSocket 重连**：建议实现自动重连机制
4. **数据同步**：WebSocket 消息用于实时同步，HTTP API 用于初始数据加载
5. **性能优化**：大量数据时考虑分页加载和虚拟滚动

## 十、相关文档

- API 详细文档：docs/collab-features-api.md
- 模块说明：src/module/collab-features/README.md
