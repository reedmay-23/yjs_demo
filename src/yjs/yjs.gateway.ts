import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as http from 'node:http';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';
import { Server, WebSocket } from 'ws';
import {
  DocumentAccessChangedEvent,
  DocumentRollbackEvent,
  YjsRoomEventsService,
} from '../module/yjs-storage/yjs-room-events.service';
import { YjsStorageService } from '../module/yjs-storage/yjs-storage.service';
import { urlParamsHandle } from '../utils/urlParams';
import { verifyWsAccessToken } from '../utils/ws-auth';

// y-websocket 协议里的消息类型：0 是文档同步，1 是 awareness 协作状态。
// 本文件自己扩展了 2，用来推送在线用户列表，不参与 Yjs 文档合并。
const messageSync = 0;
const messageAwareness = 1;
// 在线用户推送需要前端通过 ?presence=1 主动开启，避免旧客户端收到不认识的消息类型。
const messagePresence = 2;
// 附加房间名：允许在同一篇文档上隔离出多个互不干扰的 Yjs 房间（如 gomoku）。
// 默认房间仍使用纯数字 docId，保持与既有客户端兼容。
const ROOM_KEY_PATTERN = /^[a-zA-Z0-9_-]{1,32}$/;

type RoomSocket = WebSocket & {
  presenceSubscribed?: boolean;
  roomId?: string;
  userId?: string;
};

interface RoomData {
  // awareness 只保存光标、选区、用户昵称等临时协作状态，不会写入文档正文。
  awareness: awarenessProtocol.Awareness;
  cleanupTimer?: NodeJS.Timeout;
  connectionCount: number;
  // 每个 WebSocket 连接可能代表一个或多个 Yjs clientID，用于断线时清理 awareness。
  connections: Map<WebSocket, Set<number>>;
  // 房间内唯一的服务端 Y.Doc，所有客户端 update 都会先合并到这里。
  doc: Y.Doc;
  docId: string;
  // 内存房间键：主房间等于 docId，附加房间（如五子棋）为 `${docId}:${room}`。
  roomKey: string;
  // 是否把该房间的 Y.Doc 快照写回 documents.content。只有主文档房间会持久化，
  // 附加房间（五子棋等）仅保存在内存中，避免覆盖文档正文快照。
  persisted: boolean;
  lastModifiedBy?: string;
  lastPersistedVersion?: number;
  persistTimer?: NodeJS.Timeout;
}

@WebSocketGateway({
  path: '/collab1',
  cors: { origin: '*' },
})
export class YjsCollabGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(YjsCollabGateway.name);
  private readonly rooms = new Map<string, RoomData>();
  // 销毁房间的时间戳
  private readonly CLEANUP_DELAY_MS = 30 * 60 * 1000;
  // 防抖时间戳 （异步合并）
  private readonly PERSIST_DEBOUNCE_MS = 1000;
  private removeAccessChangedListener?: () => void;
  private removeRollbackListener?: () => void;

  constructor(
    private readonly storageService: YjsStorageService,
    private readonly jwtService: JwtService,
    private readonly roomEvents: YjsRoomEventsService,
  ) {}

  @WebSocketServer()
  server: Server;

  onModuleInit() {
    this.removeRollbackListener = this.roomEvents.onDocumentRolledBack(
      (event) => this.handleDocumentRolledBack(event),
    );
    this.removeAccessChangedListener = this.roomEvents.onDocumentAccessChanged(
      (event) => this.handleDocumentAccessChanged(event),
    );
  }

  onModuleDestroy() {
    this.removeAccessChangedListener?.();
    this.removeRollbackListener?.();
  }

  private getDocKey(docId: number | string) {
    return this.storageService.normalizeId(docId).toString();
  }

  private findRoomKeysByBaseDocId(baseKey: string) {
    const keys: string[] = [];
    this.rooms.forEach((room, key) => {
      if (room.docId === baseKey) {
        keys.push(key);
      }
    });
    return keys;
  }

  private parseRoomName(value: string | null) {
    if (!value) {
      return undefined;
    }

    const roomName = value.trim();

    if (!ROOM_KEY_PATTERN.test(roomName)) {
      throw new Error(`Invalid room name: ${value}`);
    }

    return roomName;
  }

  private getCloseReason(error: unknown) {
    if (error instanceof Error) {
      if (error.message.includes('Invalid room name')) {
        return 'invalid_room';
      }

      if (
        error.message.includes('missing_access_token') ||
        error.message.includes('jwt expired') ||
        error.message.includes('invalid token') ||
        error.message.includes('invalid signature')
      ) {
        return 'unauthorized';
      }

      if (error.message.includes('无权限')) {
        return 'forbidden';
      }

      if (
        error.message.includes('does not exist') ||
        error.message.includes('Document not found')
      ) {
        return 'document_not_found';
      }

      if (
        error.message.includes('No permission') ||
        error.message.includes('viewer role is read-only')
      ) {
        return 'forbidden';
      }

      if (error.message.includes('Invalid numeric id')) {
        return 'invalid_id';
      }
    }

    return 'room_init_failed';
  }

  private toUint8Array(message: any): Uint8Array {
    if (message instanceof Uint8Array) {
      return message;
    }

    if (Buffer.isBuffer(message)) {
      return new Uint8Array(message);
    }

    if (message instanceof ArrayBuffer) {
      return new Uint8Array(message);
    }

    if (Array.isArray(message)) {
      return Uint8Array.from(message);
    }

    return new Uint8Array(message);
  }

  private send(client: RoomSocket, message: Uint8Array, docId: string) {
    if (client.readyState !== WebSocket.OPEN) {
      this.logger.warn(`Skipping send to closed socket for doc=${docId}`);
      return;
    }

    client.send(message, (error) => {
      if (error) {
        this.logger.error(`Failed to send WS message for doc=${docId}`, error);
      }
    });
  }

  private broadcast(room: RoomData, message: Uint8Array, except?: RoomSocket) {
    room.connections.forEach((_, connection) => {
      if (except && connection === except) {
        return;
      }

      this.send(connection, message, room.docId);
    });
  }

  private async ensureSessionTracked(docId: string, userId: string) {
    try {
      const result = await this.storageService.handleSessionRoom(docId, userId);
      return result.changed;
    } catch (error) {
      this.logger.warn(
        `Failed to track collaboration session doc=${docId}, user=${userId}; continuing without session persistence`,
      );
      this.logger.error('Session tracking error', error);
      return false;
    }
  }

  private schedulePersist(room: RoomData) {
    // 附加房间不落库，跳过持久化调度。
    if (!room.persisted) {
      return;
    }
    // Yjs 每次输入都可能产生 update，不能每个 update 都直接写数据库。
    // 这里用 1 秒防抖，把一段连续编辑合并成一次完整快照保存。
    if (room.persistTimer) {
      clearTimeout(room.persistTimer);
    }

    room.persistTimer = setTimeout(() => {
      void this.persistRoom(room).catch((error) => {
        this.logger.error(
          `Failed to persist Y.Doc snapshot for ${room.docId}`,
          error,
        );
      });
    }, this.PERSIST_DEBOUNCE_MS);
  }

  private async persistRoom(room: RoomData) {
    if (room.persistTimer) {
      clearTimeout(room.persistTimer);
      room.persistTimer = undefined;
    }

    if (!room.persisted) {
      this.logger.debug(`Skip persisting transient room ${room.roomKey}`);
      return;
    }

    const document = await this.storageService.saveSnapshotByUser(
      room.docId,
      room.doc,
      room.lastModifiedBy,
    );
    room.lastPersistedVersion = document.version;
    this.logger.debug(`Persisted Y.Doc snapshot for ${room.docId}`);
  }

  private encodeAwarenessMessage(room: RoomData, clientIds: number[]) {
    // awareness 更新也走二进制协议：先写消息类型，再写 Yjs 编码后的状态包。
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(room.awareness, clientIds),
    );
    return encoding.toUint8Array(encoder);
  }

  private encodePresenceMessage(payload: unknown) {
    // presence 是本项目自定义 JSON 载荷，但外层仍保持和 Yjs 一样的二进制帧格式。
    const encoder = encoding.createEncoder();
    const json = JSON.stringify(payload);
    encoding.writeVarUint(encoder, messagePresence);
    encoding.writeVarUint8Array(encoder, new TextEncoder().encode(json));
    return encoding.toUint8Array(encoder);
  }

  private async broadcastPresenceUpdate(room: RoomData, userId: string) {
    const sessions = await this.storageService.getActiveSessions(
      room.docId,
      userId,
    );
    const users = sessions.map((session) => ({
      id: session.user.id,
      username: session.user.username,
      account: session.user.account,
    }));

    const message = this.encodePresenceMessage({
      type: 'onlineUsersChanged',
      docId: room.docId,
      count: users.length,
      users,
    });

    room.connections.forEach((_, connection) => {
      const client = connection as RoomSocket;
      // Presence is opt-in via ?presence=1 to avoid breaking older clients.
      if (client.presenceSubscribed) {
        this.send(client, message, room.docId);
      }
    });
  }

  private removeConnectionAwareness(room: RoomData, client: RoomSocket) {
    const controlledIds = room.connections.get(client);
    room.connections.delete(client);

    if (!controlledIds || controlledIds.size === 0) {
      return;
    }

    awarenessProtocol.removeAwarenessStates(
      room.awareness,
      Array.from(controlledIds),
      null,
    );
  }

  private attachRoomListeners(room: RoomData) {
    // 当服务端 Y.Doc 被 applyUpdate 改变时，会触发 update 事件。
    // 非数据库恢复来源的 update 需要广播给同房间其他客户端，并安排持久化。
    room.doc.on('update', (update, origin) => {
      const originSocket = origin as RoomSocket | undefined;
      if (room.persisted && originSocket?.userId) {
        room.lastModifiedBy = originSocket.userId;
        void this.storageService
          .logDocumentUpdate(room.docId, originSocket.userId, update)
          .catch((error) => {
            this.logger.error(
              `Failed to log Yjs update for doc=${room.docId}`,
              error,
            );
          });
      }

      if (origin !== 'database') {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.writeUpdate(encoder, update);
        this.broadcast(room, encoding.toUint8Array(encoder));
      }

      this.logger.debug(
        `Received Yjs update for ${room.docId}, size=${update.byteLength}, origin=${String(origin)}`,
      );
      this.schedulePersist(room);
    });

    // awareness 是协作临时状态，变化后只广播给在线连接，不保存到数据库。
    room.awareness.on('update', ({ added, updated, removed }, origin) => {
      const changedClients = added.concat(updated, removed);

      // 记录这个 WebSocket 当前控制的 clientID，便于连接断开时清掉它的光标/选区。
      if (origin && room.connections.has(origin as WebSocket)) {
        const controlledIds = room.connections.get(origin as RoomSocket);
        if (controlledIds) {
          added.forEach((clientId) => controlledIds.add(clientId));
          removed.forEach((clientId) => controlledIds.delete(clientId));
        }
      }

      if (changedClients.length === 0) {
        return;
      }

      this.broadcast(room, this.encodeAwarenessMessage(room, changedClients));
    });
  }

  private async destroyRoom(docKey: string) {
    const room = this.rooms.get(docKey);
    if (!room) {
      return;
    }

    try {
      await this.persistRoom(room);
    } catch (error) {
      this.logger.error(
        `Failed to persist room ${docKey} during cleanup`,
        error,
      );
    } finally {
      if (room.cleanupTimer) {
        clearTimeout(room.cleanupTimer);
      }

      room.connections.forEach((_, client) => {
        this.removeConnectionAwareness(room, client);
      });
      room.awareness.destroy();
      room.doc.destroy();
      this.rooms.delete(docKey);
      this.logger.log(`Destroyed in-memory room for doc ${docKey}`);
    }
  }

  private discardRoom(docKey: string, reason: string) {
    const room = this.rooms.get(docKey);
    if (!room) {
      return;
    }

    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
    }

    if (room.persistTimer) {
      clearTimeout(room.persistTimer);
    }

    room.connections.forEach((_, client) => {
      this.removeConnectionAwareness(room, client);
    });
    room.awareness.destroy();
    room.doc.destroy();
    this.rooms.delete(docKey);
    this.logger.log(`Discarded in-memory room for doc ${docKey}: ${reason}`);
  }

  private handleDocumentRolledBack(event: DocumentRollbackEvent) {
    const docKey = event.documentId.toString();
    // 同一篇文档可能存在多个内存房间（主文档房间 + 五子棋等附加房间），需要全部失效。
    const roomKeys = this.findRoomKeysByBaseDocId(docKey);

    if (roomKeys.length === 0) {
      return;
    }

    for (const roomKey of roomKeys) {
      const room = this.rooms.get(roomKey);
      if (!room) {
        continue;
      }

      const clients = Array.from(room.connections.keys()) as RoomSocket[];
      for (const client of clients) {
        if (
          client.readyState === WebSocket.OPEN ||
          client.readyState === WebSocket.CONNECTING
        ) {
          client.close(4409, 'document_rolled_back');
        }
      }

      this.discardRoom(
        roomKey,
        `rolled back to sourceVersion=${event.sourceVersion}, version=${event.version}`,
      );
    }
  }

  private handleDocumentAccessChanged(event: DocumentAccessChangedEvent) {
    const docKey = event.documentId.toString();
    const userId = event.userId.toString();
    // 权限被回收时，主文档房间和所有附加房间（五子棋等）都要踢掉该用户。
    const roomKeys = this.findRoomKeysByBaseDocId(docKey);

    if (roomKeys.length === 0) {
      return;
    }

    for (const roomKey of roomKeys) {
      const room = this.rooms.get(roomKey);
      if (!room) {
        continue;
      }

      for (const client of room.connections.keys() as Iterable<RoomSocket>) {
        if (client.userId !== userId) {
          continue;
        }

        if (
          client.readyState === WebSocket.OPEN ||
          client.readyState === WebSocket.CONNECTING
        ) {
          client.close(4403, event.reason);
        }
      }
    }
  }

  private async getRoom(
    docId: string,
    userId: string,
    roomName?: string,
  ): Promise<RoomData> {
    const docKey = this.getDocKey(docId);
    // 主房间沿用纯数字 key；附加房间使用 `${docId}:${room}`，两者 Y.Doc 完全隔离。
    const roomKey = roomName ? `${docKey}:${roomName}` : docKey;
    const persisted = !roomName;
    this.logger.log(
      `Loading room for doc=${docKey}, room=${roomName ?? 'default'}, user=${userId}`,
    );

    // 安全要点：即使房间已经常驻内存，也必须对「本次连接的用户」重新校验权限。
    // 之前的实现直接返回缓存房间，导致房间被第一个人创建后就绕过了后续所有人的
    // 权限校验——无权限账号（甚至已被移除的协作者）只要房间还在内存里就能连进来。
    // 因此这里把校验提到缓存命中之前，缓存只用于复用 Y.Doc 实例，不再充当鉴权捷径。
    await this.storageService.validateDocumentAccess(docKey, userId, 'write');

    const existingRoom = this.rooms.get(roomKey);
    if (existingRoom) {
      this.logger.log(
        `Reusing in-memory room for doc=${docKey}, room=${roomKey}, active=${existingRoom.connectionCount}`,
      );
      return existingRoom;
    }

    const storedDoc = await this.storageService.getDocument(docKey);

    if (!storedDoc) {
      this.logger.warn(`Document not found when loading room doc=${docKey}`);
      throw new Error(`Document ${docKey} does not exist`);
    }

    const cachedRoom = this.rooms.get(roomKey);
    if (cachedRoom) {
      return cachedRoom;
    }

    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    // 数据库里保存的是 Y.Doc 的 update 数组，恢复时转回 Uint8Array 再 apply 到新文档。
    const initialUpdate = this.storageService.decodeState(
      storedDoc.content as
        | number[]
        | { update?: number[]; state?: number[] }
        | null,
    );

    if (initialUpdate?.length) {
      this.logger.log(
        `Restoring snapshot for doc=${docKey}, bytes=${initialUpdate.length}`,
      );
      // origin 标记为 database，避免恢复快照时又被当成用户编辑广播出去。
      Y.applyUpdate(doc, initialUpdate, 'database');
    } else {
      this.logger.log(`No persisted snapshot found for doc=${docKey}`);
    }

    const room: RoomData = {
      awareness,
      connectionCount: 0,
      connections: new Map(),
      doc,
      docId: docKey,
      roomKey,
      persisted,
    };

    this.attachRoomListeners(room);
    this.rooms.set(roomKey, room);
    this.logger.log(`Created in-memory room for ${roomKey}`);
    return room;
  }

  private sendInitialSync(client: RoomSocket, room: RoomData) {
    // 连接建立后先主动推一份服务端快照，保证新客户端立刻拿到历史内容。
    // writeSyncStep2 会把 room.doc 当前状态编码成标准 Yjs sync 消息。
    const snapshotEncoder = encoding.createEncoder();
    encoding.writeVarUint(snapshotEncoder, messageSync);
    syncProtocol.writeSyncStep2(snapshotEncoder, room.doc);
    this.send(client, encoding.toUint8Array(snapshotEncoder), room.docId);

    // 再保留标准 SyncStep1 握手，让客户端按 state vector 做增量对齐。
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, room.doc);
    this.send(client, encoding.toUint8Array(encoder), room.docId);

    const awarenessStates = room.awareness.getStates();
    if (awarenessStates.size > 0) {
      this.send(
        client,
        this.encodeAwarenessMessage(
          room,
          Array.from(awarenessStates.keys()) as number[],
        ),
        room.docId,
      );
    }
  }

  private handleProtocolMessage(
    client: RoomSocket,
    room: RoomData,
    message: Uint8Array,
  ) {
    const encoder = encoding.createEncoder();
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);

    // 前端发来的每一帧都是二进制：第一个 varUint 是消息类型，后面才是具体协议内容。
    switch (messageType) {
      case messageSync: {
        // readSyncMessage 会根据客户端发来的 SyncStep1/SyncStep2/update 自动合并到 room.doc。
        // 如果需要回复，内容会写入 encoder，再发回当前客户端。
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.readSyncMessage(decoder, encoder, room.doc, client);
        if (encoding.length(encoder) > 1) {
          this.send(client, encoding.toUint8Array(encoder), room.docId);
        }
        break;
      }
      case messageAwareness: {
        // 光标、选区、用户名等 awareness 状态不进入 Y.Doc，只更新 room.awareness。
        awarenessProtocol.applyAwarenessUpdate(
          room.awareness,
          decoding.readVarUint8Array(decoder),
          client,
        );
        break;
      }
      default:
        this.logger.warn(
          `Unsupported y-websocket message type=${messageType} for doc=${room.docId}`,
        );
    }
  }

  async handleConnection(client: RoomSocket, req: http.IncomingMessage) {
    const params = urlParamsHandle(req);
    const docId = params.get('docId');
    const roomName = params.get('room');

    this.logger.log(
      `Incoming websocket connection docId=${docId ?? 'missing'}, room=${roomName ?? 'default'}`,
    );

    if (!docId) {
      this.logger.warn('Connection rejected: Missing docId');
      client.close(4000, 'Missing docId parameter');
      return;
    }

    let userId: string | undefined;

    try {
      // 关键鉴权：协同连接不信任 query.userId，只使用 access token 里的用户身份。
      const payload = await verifyWsAccessToken(this.jwtService, req);
      userId = payload.sub.toString();
      // 房间名校验放在鉴权之后，避免未授权请求探测房间名规则。
      const parsedRoom = this.parseRoomName(roomName);
      const room = await this.getRoom(docId, userId, parsedRoom);
      // 会话表只记录“这个用户是否在线”，同一用户多标签页通过引用计数避免重复上下线。
      const presenceChanged = await this.ensureSessionTracked(
        room.docId,
        userId,
      );

      if (room.cleanupTimer) {
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = undefined;
      }

      // roomId 记录内存房间键（可能带附加房间后缀），用于 disconnect 时精确回收。
      client.roomId = room.roomKey;
      client.userId = userId;
      // 前端显式带 presence=1 时，才会收到 messagePresence 在线用户推送。
      client.presenceSubscribed = params.get('presence') === '1';
      room.connectionCount += 1;
      room.connections.set(client, new Set());

      client.on('message', (message: any) => {
        try {
          // ws 可能给 Buffer、ArrayBuffer 或数组，这里统一转成 Uint8Array 给 Yjs 协议解析。
          this.handleProtocolMessage(client, room, this.toUint8Array(message));
        } catch (error) {
          this.logger.error(
            `Failed to process y-websocket message for doc=${room.docId}`,
            error,
          );
        }
      });

      this.sendInitialSync(client, room);

      if (presenceChanged) {
        await this.broadcastPresenceUpdate(room, userId);
      }

      this.logger.log(
        `Custom y-websocket protocol established for ${room.roomKey}, active=${room.connectionCount}`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to initialize Yjs room';
      const closeReason = this.getCloseReason(error);

      this.logger.error(message, error);
      this.logger.warn(
        `Closing websocket during init docId=${docId ?? 'unknown'}, userId=${userId ?? 'unknown'}`,
      );
      client.close(4500, closeReason);
    }
  }

  async handleDisconnect(client: RoomSocket) {
    const roomKey = client.roomId as string | undefined;
    const userId = client.userId as string | undefined;

    if (!roomKey) {
      return;
    }

    const room = this.rooms.get(roomKey);
    if (!room) {
      return;
    }

    // 会话表只认数字文档 id，附加房间也要回落到 room.docId。
    const docId = room.docId;

    this.removeConnectionAwareness(room, client);
    room.connectionCount = Math.max(0, room.connectionCount - 1);

    if (userId) {
      try {
        const result = await this.storageService.markSessionDisconnected(
          docId,
          userId,
        );
        if (result.changed) {
          await this.broadcastPresenceUpdate(room, userId);
        }
      } catch (error) {
        this.logger.error(
          `Failed to update collaboration session for doc ${docId}`,
          error,
        );
      }
    }

    this.logger.log(
      `Client disconnected from room ${roomKey}, active=${room.connectionCount}`,
    );

    if (room.connectionCount > 0) {
      return;
    }

    room.cleanupTimer = setTimeout(() => {
      const currentRoom = this.rooms.get(roomKey);
      if (!currentRoom || currentRoom.connectionCount > 0) {
        return;
      }

      void this.destroyRoom(roomKey);
    }, this.CLEANUP_DELAY_MS);

    this.logger.log(
      `Scheduled cleanup for room ${roomKey} in ${this.CLEANUP_DELAY_MS / 1000}s`,
    );
  }
}
