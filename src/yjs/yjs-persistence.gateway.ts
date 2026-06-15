import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import * as http from 'node:http';
import * as Y from 'yjs';
import { WebSocket } from 'ws';
import { YjsStorageService } from '../module/yjs-storage/yjs-storage.service';
import { urlParamsHandle } from '../utils/urlParams';
import { verifyWsAccessToken } from '../utils/ws-auth';

const yWebsocketUtils = require('y-websocket/bin/utils');
const setupWSConnection = yWebsocketUtils.setupWSConnection;
const setPersistence = yWebsocketUtils.setPersistence;
const getPersistence = yWebsocketUtils.getPersistence;

type RoomSocket = WebSocket & {
  roomId?: string;
  userId?: string;
};

@WebSocketGateway({
  path: '/collab2',
  cors: { origin: '*' },
})
export class YjsPersistenceGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(YjsPersistenceGateway.name);
  private readonly PERSIST_DEBOUNCE_MS = 1000;
  private readonly persistTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly storageService: YjsStorageService,
    private readonly jwtService: JwtService,
  ) {
    if (!getPersistence()) {
      setPersistence({
        bindState: async (docName: string, doc: Y.Doc) => {
          const initialUpdate =
            await this.storageService.getDocumentUpdate(docName);

          if (initialUpdate?.length) {
            Y.applyUpdate(doc, initialUpdate, 'database');
            this.logger.log(
              `Persistence restored snapshot for doc=${docName}, bytes=${initialUpdate.length}`,
            );
          } else {
            this.logger.log(
              `Persistence found no snapshot for doc=${docName}, using empty in-memory doc`,
            );
          }

          doc.on('update', () => {
            this.schedulePersist(docName, doc);
          });
        },
        provider: null,
        writeState: async (docName: string, doc: Y.Doc) => {
          this.clearPersistTimer(docName);
          await this.storageService.saveSnapshot(docName, doc);
          this.logger.log(`Persistence flushed final snapshot for doc=${docName}`);
        },
      });
    }
  }

  private clearPersistTimer(docName: string) {
    const timer = this.persistTimers.get(docName);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.persistTimers.delete(docName);
  }

  private schedulePersist(docName: string, doc: Y.Doc) {
    this.clearPersistTimer(docName);

    const timer = setTimeout(() => {
      this.persistTimers.delete(docName);
      void this.storageService.saveSnapshot(docName, doc).catch((error) => {
        this.logger.error(
          `Failed to persist y-websocket snapshot for doc=${docName}`,
          error,
        );
      });
    }, this.PERSIST_DEBOUNCE_MS);

    this.persistTimers.set(docName, timer);
  }

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

  private async ensureSessionTracked(docId: string, userId?: string | null) {
    if (!userId) {
      return;
    }

    try {
      await this.storageService.handleSessionRoom(docId, userId);
    } catch (error) {
      this.logger.warn(
        `Failed to track collaboration session doc=${docId}, user=${userId}; continuing without session persistence`,
      );
      this.logger.error('Session tracking error', error);
    }
  }

  async handleConnection(client: RoomSocket, req: http.IncomingMessage) {
    const params = urlParamsHandle(req);
    const docId = params.get('docId');

    this.logger.log(
      `Incoming /collab2 connection docId=${docId ?? 'missing'}`,
    );

    if (!docId) {
      client.close(4000, 'Missing docId parameter');
      return;
    }

    try {
      // 关键鉴权：协同连接只认 access token，前端不再传 userId。
      const payload = await verifyWsAccessToken(this.jwtService, req);
      const userId = payload.sub.toString();
      const docKey = this.getDocKey(docId);
      const document = await this.storageService.getDocument(docKey);

      if (!document) {
        throw new Error(`Document ${docKey} does not exist`);
      }

      // 关键校验：进入 y-websocket 前确认用户有文档权限。
      await this.storageService.validateDocumentAccess(docKey, userId);
      await this.ensureSessionTracked(docKey, userId);

      client.roomId = docKey;
      client.userId = userId;

      setupWSConnection(client, req, {
        docName: docKey,
        gc: true,
      });

      this.logger.log(`Official y-websocket persistence connected doc=${docKey}`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to initialize Yjs room';
      const closeReason = this.getCloseReason(error);

      this.logger.error(message, error);
      client.close(4500, closeReason);
    }
  }

  async handleDisconnect(client: RoomSocket) {
    const roomId = client.roomId as string | undefined;
    const userId = client.userId as string | undefined;

    if (!roomId || !userId) {
      return;
    }

    try {
      await this.storageService.markSessionDisconnected(roomId, userId);
    } catch (error) {
      this.logger.error(
        `Failed to update collaboration session for doc=${roomId}`,
        error,
      );
    }
  }
}
