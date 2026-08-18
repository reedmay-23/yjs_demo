import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import * as http from 'node:http';
import { Server, WebSocket } from 'ws';
import { urlParamsHandle } from '../utils/urlParams';
import { verifyWsAccessToken } from '../utils/ws-auth';
import { PrismaService } from '../module/prisma/prisma.service';

const COLLAB_FEATURES = [
  'whiteboard',
  'chat',
  'task-board',
  'spreadsheet',
  'media',
] as const;

type CollabFeature = (typeof COLLAB_FEATURES)[number];

type FeatureSocket = WebSocket & {
  roomId?: string;
  userId?: string;
  feature?: CollabFeature;
  canWrite?: boolean;
  subscribedRooms?: Set<string>;
};

interface FeatureRoom {
  feature: CollabFeature;
  roomId: string;
  connections: Map<WebSocket, Set<string>>;
  connectionCount: number;
}

@WebSocketGateway({
  path: '/collab-features',
  cors: { origin: '*' },
})
export class CollabFeaturesGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(CollabFeaturesGateway.name);
  private readonly rooms = new Map<string, FeatureRoom>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  @WebSocketServer()
  server: Server;

  onModuleInit() {
    this.logger.log('CollabFeaturesGateway initialized');
  }

  onModuleDestroy() {
    this.logger.log('CollabFeaturesGateway destroyed');
  }

  private getRoomKey(feature: CollabFeature, roomId: string) {
    return `${feature}:${roomId}`;
  }

  private getOrCreateRoom(feature: CollabFeature, roomId: string): FeatureRoom {
    const roomKey = this.getRoomKey(feature, roomId);
    let room = this.rooms.get(roomKey);

    if (!room) {
      room = {
        feature,
        roomId,
        connections: new Map(),
        connectionCount: 0,
      };
      this.rooms.set(roomKey, room);
      this.logger.log(`Created room ${roomKey}`);
    }

    return room;
  }

  private broadcastToRoom(
    room: FeatureRoom,
    message: any,
    excludeClient?: WebSocket,
  ) {
    const messageStr = JSON.stringify(message);
    room.connections.forEach((_, client) => {
      if (client !== excludeClient && client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  async handleConnection(client: FeatureSocket, req: http.IncomingMessage) {
    const params = urlParamsHandle(req);
    const feature = params.get('feature');
    const roomId = params.get('roomId');

    this.logger.log(
      `Incoming connection feature=${feature ?? 'missing'}, roomId=${roomId ?? 'missing'}`,
    );

    if (!feature || !this.isCollabFeature(feature) || !roomId) {
      this.logger.warn('Connection rejected: Missing feature or roomId');
      client.close(4400, 'Invalid feature or roomId parameter');
      return;
    }

    const resourceId = Number(roomId);
    if (!Number.isSafeInteger(resourceId) || resourceId <= 0) {
      client.close(4400, 'roomId must be a positive integer');
      return;
    }

    let userId: string | undefined;

    try {
      const payload = await verifyWsAccessToken(this.jwtService, req);
      userId = payload.sub.toString();
      const access = await this.resolveResourceAccess(
        feature,
        resourceId,
        payload.sub,
      );

      client.roomId = roomId;
      client.userId = userId;
      client.feature = feature;
      client.canWrite = access.canWrite;
      client.subscribedRooms = new Set();

      const room = this.getOrCreateRoom(feature, roomId);
      room.connectionCount += 1;
      room.connections.set(client, new Set());

      client.on('message', (message: any) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleMessage(client, room, data);
        } catch (error) {
          this.logger.error(`Failed to process message`, error);
        }
      });

      // 发送连接成功消息
      client.send(
        JSON.stringify({
          type: 'connected',
          feature,
          roomId,
          userId,
          canWrite: access.canWrite,
        }),
      );

      // 广播用户加入
      this.broadcastToRoom(
        room,
        {
          type: 'user_joined',
          userId,
          timestamp: new Date().toISOString(),
        },
        client,
      );

      this.logger.log(
        `Client connected to ${feature} room ${roomId}, active=${room.connectionCount}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to connect';
      this.logger.error(message, error);
      client.close(4500, message);
    }
  }

  async handleDisconnect(client: FeatureSocket) {
    const feature = client.feature;
    const roomId = client.roomId;
    const userId = client.userId;

    if (!feature || !roomId) {
      return;
    }

    const roomKey = this.getRoomKey(feature, roomId);
    const room = this.rooms.get(roomKey);

    if (!room) {
      return;
    }

    room.connections.delete(client);
    room.connectionCount = Math.max(0, room.connectionCount - 1);

    // 广播用户离开
    this.broadcastToRoom(room, {
      type: 'user_left',
      userId,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(
      `Client disconnected from ${feature} room ${roomId}, active=${room.connectionCount}`,
    );

    // 清理空房间
    if (room.connectionCount === 0) {
      this.rooms.delete(roomKey);
      this.logger.log(`Removed empty room ${roomKey}`);
    }
  }

  private handleMessage(client: FeatureSocket, room: FeatureRoom, data: any) {
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') {
      client.send(
        JSON.stringify({ type: 'error', message: 'Invalid message' }),
      );
      return;
    }

    if (!client.canWrite && this.requiresWriteAccess(room.feature, data.type)) {
      client.send(
        JSON.stringify({
          type: 'error',
          code: 'read_only',
          message: 'Viewer role cannot broadcast write operations',
        }),
      );
      return;
    }

    switch (room.feature) {
      case 'whiteboard':
        this.handleWhiteboardMessage(client, room, data);
        break;
      case 'chat':
        this.handleChatMessage(client, room, data);
        break;
      case 'task-board':
        this.handleTaskBoardMessage(client, room, data);
        break;
      case 'spreadsheet':
        this.handleSpreadsheetMessage(client, room, data);
        break;
      case 'media':
        this.handleMediaMessage(client, room, data);
        break;
      default:
        this.logger.warn(`Unknown feature: ${room.feature}`);
    }
  }

  private handleWhiteboardMessage(
    client: FeatureSocket,
    room: FeatureRoom,
    data: any,
  ) {
    switch (data.type) {
      case 'element_added':
      case 'element_updated':
      case 'element_deleted':
        // 广播白板元素变更
        this.broadcastToRoom(
          room,
          {
            type: data.type,
            element: data.element,
            userId: client.userId,
            timestamp: new Date().toISOString(),
          },
          client,
        );
        break;
      case 'cursor_move':
        // 广播光标位置
        this.broadcastToRoom(
          room,
          {
            type: 'cursor_move',
            userId: client.userId,
            position: data.position,
            timestamp: new Date().toISOString(),
          },
          client,
        );
        break;
      default:
        this.logger.warn(`Unknown whiteboard message type: ${data.type}`);
    }
  }

  private handleChatMessage(
    client: FeatureSocket,
    room: FeatureRoom,
    data: any,
  ) {
    switch (data.type) {
      case 'new_message':
        // 广播新消息
        this.broadcastToRoom(
          room,
          {
            type: 'new_message',
            message: data.message,
            userId: client.userId,
            timestamp: new Date().toISOString(),
          },
          client,
        );
        break;
      case 'typing':
        // 广播输入状态
        this.broadcastToRoom(
          room,
          {
            type: 'typing',
            userId: client.userId,
            isTyping: data.isTyping,
            timestamp: new Date().toISOString(),
          },
          client,
        );
        break;
      case 'reaction_added':
        // 广播表情反应
        this.broadcastToRoom(
          room,
          {
            type: 'reaction_added',
            messageId: data.messageId,
            emoji: data.emoji,
            userId: client.userId,
            timestamp: new Date().toISOString(),
          },
          client,
        );
        break;
      default:
        this.logger.warn(`Unknown chat message type: ${data.type}`);
    }
  }

  private handleTaskBoardMessage(
    client: FeatureSocket,
    room: FeatureRoom,
    data: any,
  ) {
    switch (data.type) {
      case 'card_created':
      case 'card_updated':
      case 'card_deleted':
      case 'card_moved':
        // 广播任务卡片变更
        this.broadcastToRoom(
          room,
          {
            type: data.type,
            card: data.card,
            userId: client.userId,
            timestamp: new Date().toISOString(),
          },
          client,
        );
        break;
      case 'column_created':
      case 'column_updated':
      case 'column_deleted':
        // 广播列变更
        this.broadcastToRoom(
          room,
          {
            type: data.type,
            column: data.column,
            userId: client.userId,
            timestamp: new Date().toISOString(),
          },
          client,
        );
        break;
      default:
        this.logger.warn(`Unknown task board message type: ${data.type}`);
    }
  }

  private handleSpreadsheetMessage(
    client: FeatureSocket,
    room: FeatureRoom,
    data: any,
  ) {
    switch (data.type) {
      case 'cell_updated':
        // 广播单元格更新
        this.broadcastToRoom(
          room,
          {
            type: 'cell_updated',
            cell: data.cell,
            userId: client.userId,
            timestamp: new Date().toISOString(),
          },
          client,
        );
        break;
      case 'cells_batch_updated':
        // 广播批量单元格更新
        this.broadcastToRoom(
          room,
          {
            type: 'cells_batch_updated',
            cells: data.cells,
            userId: client.userId,
            timestamp: new Date().toISOString(),
          },
          client,
        );
        break;
      case 'cursor_move':
        // 广播光标位置
        this.broadcastToRoom(
          room,
          {
            type: 'cursor_move',
            userId: client.userId,
            cell: data.cell,
            timestamp: new Date().toISOString(),
          },
          client,
        );
        break;
      case 'selection_change':
        // 广播选区变化
        this.broadcastToRoom(
          room,
          {
            type: 'selection_change',
            userId: client.userId,
            selection: data.selection,
            timestamp: new Date().toISOString(),
          },
          client,
        );
        break;
      default:
        this.logger.warn(`Unknown spreadsheet message type: ${data.type}`);
    }
  }

  private handleMediaMessage(
    client: FeatureSocket,
    room: FeatureRoom,
    data: any,
  ) {
    switch (data.type) {
      case 'annotation_created':
      case 'annotation_updated':
      case 'annotation_deleted':
        // 广播标注变更
        this.broadcastToRoom(
          room,
          {
            type: data.type,
            annotation: data.annotation,
            userId: client.userId,
            timestamp: new Date().toISOString(),
          },
          client,
        );
        break;
      case 'playback_sync':
        // 广播播放同步
        this.broadcastToRoom(
          room,
          {
            type: 'playback_sync',
            userId: client.userId,
            currentTime: data.currentTime,
            isPlaying: data.isPlaying,
            timestamp: new Date().toISOString(),
          },
          client,
        );
        break;
      default:
        this.logger.warn(`Unknown media message type: ${data.type}`);
    }
  }

  private isCollabFeature(value: string): value is CollabFeature {
    return (COLLAB_FEATURES as readonly string[]).includes(value);
  }

  private requiresWriteAccess(feature: CollabFeature, messageType: string) {
    if (feature === 'chat') {
      return false;
    }

    const readOnlyEvents = new Set([
      'cursor_move',
      'selection_change',
      'playback_sync',
    ]);
    return !readOnlyEvents.has(messageType);
  }

  private async resolveResourceAccess(
    feature: CollabFeature,
    resourceId: number,
    userId: number,
  ) {
    let resource: { documentId: number } | null;

    switch (feature) {
      case 'whiteboard':
        resource = await this.prisma.whiteboard.findUnique({
          where: { id: resourceId },
          select: { documentId: true },
        });
        break;
      case 'chat':
        resource = await this.prisma.chatRoom.findUnique({
          where: { id: resourceId },
          select: { documentId: true },
        });
        break;
      case 'task-board':
        resource = await this.prisma.taskBoard.findUnique({
          where: { id: resourceId },
          select: { documentId: true },
        });
        break;
      case 'spreadsheet':
        resource = await this.prisma.spreadsheet.findUnique({
          where: { id: resourceId },
          select: { documentId: true },
        });
        break;
      case 'media':
        resource = await this.prisma.mediaFile.findUnique({
          where: { id: resourceId },
          select: { documentId: true },
        });
        break;
    }

    if (!resource) {
      throw new Error(`${feature} resource not found`);
    }

    const document = await this.prisma.document.findUnique({
      where: { id: resource.documentId },
      select: {
        createdBy: true,
        documentCollaborators: {
          where: { userId },
          select: { role: true },
        },
      },
    });

    if (!document) {
      throw new Error('Document not found');
    }

    if (document.createdBy === userId) {
      return { canWrite: true };
    }

    const collaborator = document.documentCollaborators[0];
    if (!collaborator) {
      throw new Error('No permission to access this resource');
    }

    return { canWrite: collaborator.role !== 'viewer' };
  }
}
