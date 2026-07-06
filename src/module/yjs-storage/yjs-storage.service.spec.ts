import { ForbiddenException } from '@nestjs/common';
import { YjsStorageService } from './yjs-storage.service';

describe('YjsStorageService permissions', () => {
  let service: YjsStorageService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue({ id: 10, createdBy: 1 }),
      },
      documentCollaborator: {
        findUnique: jest.fn(),
      },
    };

    service = new YjsStorageService(prisma);
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
});
