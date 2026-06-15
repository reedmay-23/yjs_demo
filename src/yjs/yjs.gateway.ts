import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import * as http from 'node:http';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';
import { Server, WebSocket } from 'ws';
import { YjsStorageService } from '../module/yjs-storage/yjs-storage.service';
import { urlParamsHandle } from '../utils/urlParams';
import { verifyWsAccessToken } from '../utils/ws-auth';

const syncProtocol = require('y-protocols/dist/sync.cjs');
const encoding = require('lib0/dist/encoding.cjs');
const decoding = require('lib0/dist/decoding.cjs');

const messageSync = 0;
const messageAwareness = 1;

type RoomSocket = WebSocket & {
  roomId?: string;
  userId?: string;
};

interface RoomData {
  awareness: awarenessProtocol.Awareness;
  cleanupTimer?: NodeJS.Timeout;
  connectionCount: number;
  connections: Map<WebSocket, Set<number>>;
  doc: Y.Doc;
  docId: string;
  persistTimer?: NodeJS.Timeout;
}

@WebSocketGateway({
  path: '/collab1',
  cors: { origin: '*' },
})
export class YjsCollabGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(YjsCollabGateway.name);
  private readonly rooms = new Map<string, RoomData>();
  private readonly CLEANUP_DELAY_MS = 30 * 60 * 1000;
  private readonly PERSIST_DEBOUNCE_MS = 1000;

  constructor(
    private readonly storageService: YjsStorageService,
    private readonly jwtService: JwtService,
  ) {}

  @WebSocketServer()
  server: Server;

  private getDocKey(docId: number | string) {
    return this.storageService.normalizeId(docId).toString();
  }

  private getCloseReason(error: unknown) {
    if (error instanceof Error) {
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

      if (error.message.includes('does not exist')) {
        return 'document_not_found';
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
      await this.storageService.handleSessionRoom(docId, userId);
    } catch (error) {
      this.logger.warn(
        `Failed to track collaboration session doc=${docId}, user=${userId}; continuing without session persistence`,
      );
      this.logger.error('Session tracking error', error);
    }
  }

  private schedulePersist(room: RoomData) {
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

    await this.storageService.saveSnapshot(room.docId, room.doc);
    this.logger.debug(`Persisted Y.Doc snapshot for ${room.docId}`);
  }

  private encodeAwarenessMessage(room: RoomData, clientIds: number[]) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(room.awareness, clientIds),
    );
    return encoding.toUint8Array(encoder);
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
    room.doc.on('update', (update, origin) => {
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

    room.awareness.on('update', ({ added, updated, removed }, origin) => {
      const changedClients = added.concat(updated, removed);

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

      this.broadcast(
        room,
        this.encodeAwarenessMessage(room, changedClients),
      );
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

  private async getRoom(docId: string, userId: string): Promise<RoomData> {
    const docKey = this.getDocKey(docId);
    this.logger.log(`Loading room for doc=${docKey}, user=${userId}`);

    const existingRoom = this.rooms.get(docKey);
    if (existingRoom) {
      this.logger.log(
        `Reusing in-memory room for doc=${docKey}, active=${existingRoom.connectionCount}`,
      );
      return existingRoom;
    }

    const storedDoc = await this.storageService.getDocument(docKey);

    if (!storedDoc) {
      this.logger.warn(`Document not found when loading room doc=${docKey}`);
      throw new Error(`Document ${docKey} does not exist`);
    }

    // 关键校验：进入协同房间前先确认 token 用户有该文档权限。
    await this.storageService.validateDocumentAccess(docKey, userId);
    await this.ensureSessionTracked(docKey, userId);

    const cachedRoom = this.rooms.get(docKey);
    if (cachedRoom) {
      return cachedRoom;
    }

    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
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
    };

    this.attachRoomListeners(room);
    this.rooms.set(docKey, room);
    this.logger.log(`Created in-memory room for doc ${docKey}`);
    return room;
  }

  private sendInitialSync(client: RoomSocket, room: RoomData) {
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

    switch (messageType) {
      case messageSync: {
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.readSyncMessage(decoder, encoder, room.doc, client);
        if (encoding.length(encoder) > 1) {
          this.send(client, encoding.toUint8Array(encoder), room.docId);
        }
        break;
      }
      case messageAwareness: {
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

    this.logger.log(
      `Incoming websocket connection docId=${docId ?? 'missing'}`,
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
      const room = await this.getRoom(docId, userId);

      if (room.cleanupTimer) {
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = undefined;
      }

      client.roomId = room.docId;
      client.userId = userId;
      room.connectionCount += 1;
      room.connections.set(client, new Set());

      client.on('message', (message: any) => {
        try {
          this.handleProtocolMessage(client, room, this.toUint8Array(message));
        } catch (error) {
          this.logger.error(
            `Failed to process y-websocket message for doc=${room.docId}`,
            error,
          );
        }
      });

      this.sendInitialSync(client, room);

      this.logger.log(
        `Custom y-websocket protocol established for doc ${room.docId}, active=${room.connectionCount}`,
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
    const roomId = client.roomId as string | undefined;
    const userId = client.userId as string | undefined;

    if (!roomId) {
      return;
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    this.removeConnectionAwareness(room, client);
    room.connectionCount = Math.max(0, room.connectionCount - 1);

    if (userId) {
      try {
        await this.storageService.markSessionDisconnected(roomId, userId);
      } catch (error) {
        this.logger.error(
          `Failed to update collaboration session for doc ${roomId}`,
          error,
        );
      }
    }

    this.logger.log(
      `Client disconnected from doc ${roomId}, active=${room.connectionCount}`,
    );

    if (room.connectionCount > 0) {
      return;
    }

    room.cleanupTimer = setTimeout(() => {
      const currentRoom = this.rooms.get(roomId);
      if (!currentRoom || currentRoom.connectionCount > 0) {
        return;
      }

      void this.destroyRoom(roomId);
    }, this.CLEANUP_DELAY_MS);

    this.logger.log(
      `Scheduled cleanup for doc ${roomId} in ${this.CLEANUP_DELAY_MS / 1000}s`,
    );
  }
}
