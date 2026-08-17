import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

export type DocumentRollbackEvent = {
  documentId: number;
  version: number;
  sourceVersion: number;
  historyId: number;
  userId: number;
};

export type DocumentAccessChangedEvent = {
  documentId: number;
  userId: number;
  reason: 'permission_changed' | 'collaborator_removed';
};

@Injectable()
export class YjsRoomEventsService {
  private readonly emitter = new EventEmitter();

  emitDocumentRolledBack(event: DocumentRollbackEvent) {
    this.emitter.emit('documentRolledBack', event);
  }

  onDocumentRolledBack(listener: (event: DocumentRollbackEvent) => void) {
    this.emitter.on('documentRolledBack', listener);
    return () => {
      this.emitter.off('documentRolledBack', listener);
    };
  }

  emitDocumentAccessChanged(event: DocumentAccessChangedEvent) {
    this.emitter.emit('documentAccessChanged', event);
  }

  onDocumentAccessChanged(
    listener: (event: DocumentAccessChangedEvent) => void,
  ) {
    this.emitter.on('documentAccessChanged', listener);
    return () => {
      this.emitter.off('documentAccessChanged', listener);
    };
  }
}
