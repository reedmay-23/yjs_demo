import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as Y from 'yjs';
import { YjsStorageService } from './yjs-storage.service';

describe('YjsStorageService permissions', () => {
  let service: YjsStorageService;
  let prisma: any;
  let roomEvents: any;

  beforeEach(() => {
    prisma = {
      document: {
        create: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ id: 10, createdBy: 1 }),
        update: jest.fn(),
      },
      documentCollaborator: {
        findUnique: jest.fn(),
      },
      documentHistory: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };
    roomEvents = {
      emitDocumentRolledBack: jest.fn(),
    };

    service = new YjsStorageService(prisma, roomEvents);
  });

  it('allows viewer collaborators to read', async () => {
    prisma.documentCollaborator.findUnique.mockResolvedValue({
      id: 20,
      role: 'viewer',
    });

    await expect(
      service.validateDocumentAccess(10, 2, 'read'),
    ).resolves.toMatchObject({ id: 10 });
  });

  it('rejects viewer collaborators when write access is required', async () => {
    prisma.documentCollaborator.findUnique.mockResolvedValue({
      id: 20,
      role: 'viewer',
    });

    await expect(service.validateDocumentAccess(10, 2, 'write')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows editor collaborators to write', async () => {
    prisma.documentCollaborator.findUnique.mockResolvedValue({
      id: 20,
      role: 'editor',
    });

    await expect(
      service.validateDocumentAccess(10, 2, 'write'),
    ).resolves.toMatchObject({ id: 10 });
  });

  it('rejects yjs-storage create without document id', async () => {
    await expect(service.createDocument({ createdBy: 1 })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it('initializes an existing document without creating a duplicate', async () => {
    const result = await service.createDocument({
      documentId: 10,
      createdBy: 1,
    });

    expect(result).toMatchObject({ id: 10, createdBy: 1 });
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it('updates recent edit history instead of creating a new row', async () => {
    const doc = new Y.Doc();
    doc.getText('document').insert(0, 'hello');
    prisma.document.update.mockResolvedValue({ id: 10, version: 3 });
    prisma.documentHistory.findFirst.mockResolvedValue({ id: 30 });

    await service.saveSnapshotByUser(10, doc, 2);

    expect(prisma.documentHistory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 30 },
        data: expect.objectContaining({
          version: 3,
          sourceVersion: null,
        }),
      }),
    );
    expect(prisma.documentHistory.create).not.toHaveBeenCalled();
  });

  it('creates edit history when there is no recent row to merge', async () => {
    const doc = new Y.Doc();
    doc.getText('document').insert(0, 'hello');
    prisma.document.update.mockResolvedValue({ id: 10, version: 4 });
    prisma.documentHistory.findFirst.mockResolvedValue(null);

    await service.saveSnapshotByUser(10, doc, 2);

    expect(prisma.documentHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentId: 10,
          userId: 2,
          version: 4,
          action: 'edit',
        }),
      }),
    );
    expect(prisma.documentHistory.update).not.toHaveBeenCalled();
  });
});
