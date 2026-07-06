import { BadRequestException } from '@nestjs/common';
import { DocumentService } from './document.service';

describe('DocumentService', () => {
  let service: DocumentService;
  let prisma: any;
  let yjsStorageService: any;

  beforeEach(() => {
    prisma = {
      document: {
        findUnique: jest.fn(),
      },
      documentCollaborator: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    yjsStorageService = {
      normalizeId: jest.fn((id: number | string) => {
        const normalized =
          typeof id === 'number'
            ? id
            : /^-?\d+$/.test(id.trim())
              ? Number(id.trim())
              : Number.NaN;

        if (!Number.isSafeInteger(normalized)) {
          throw new Error(`Invalid numeric id: ${id}`);
        }

        return normalized;
      }),
      validateDocumentAccess: jest.fn(),
    };

    service = new DocumentService(prisma, yjsStorageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('throws BadRequestException before querying collaborators when userId is empty', async () => {
    await expect(
      service.addCollaborator(1, 10, {
        documentId: 10,
        userId: '' as unknown as number,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.documentCollaborator.findFirst).not.toHaveBeenCalled();
    expect(prisma.documentCollaborator.create).not.toHaveBeenCalled();
  });

  it('creates a collaborator when no existing row is found', async () => {
    prisma.document.findUnique.mockResolvedValue({ id: 10, createdBy: 1 });
    prisma.user.findUnique.mockResolvedValue({ id: 2 });
    prisma.documentCollaborator.findFirst.mockResolvedValue(null);
    prisma.documentCollaborator.create.mockResolvedValue({
      id: 99,
      documentId: 10,
      userId: 2,
      role: 'editor',
      createdBy: 1,
    });

    const result = await service.addCollaborator(1, 10, {
      documentId: 10,
      userId: 2,
    });

    expect(prisma.documentCollaborator.findFirst).toHaveBeenCalledWith({
      where: {
        documentId: 10,
        userId: 2,
      },
      select: { id: true },
    });
    expect(prisma.documentCollaborator.create).toHaveBeenCalledWith({
      data: {
        documentId: 10,
        userId: 2,
        role: 'editor',
        createdBy: 1,
      },
      select: {
        id: true,
        documentId: true,
        userId: true,
        role: true,
        createdBy: true,
        createdAt: true,
      },
    });
    expect(result.data).toMatchObject({
      id: 99,
      documentId: 10,
      userId: 2,
      role: 'editor',
      createdBy: 1,
    });
  });

  it('creates a viewer collaborator when role is viewer', async () => {
    prisma.document.findUnique.mockResolvedValue({ id: 10, createdBy: 1 });
    prisma.user.findUnique.mockResolvedValue({ id: 2 });
    prisma.documentCollaborator.findFirst.mockResolvedValue(null);
    prisma.documentCollaborator.create.mockResolvedValue({
      id: 99,
      documentId: 10,
      userId: 2,
      role: 'viewer',
      createdBy: 1,
    });

    const result = await service.addCollaborator(1, 10, {
      documentId: 10,
      userId: 2,
      role: 'viewer',
    });

    expect(prisma.documentCollaborator.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: 'viewer',
        }),
      }),
    );
    expect(result.data).toMatchObject({
      role: 'viewer',
    });
  });

  it('uses read access when listing collaborators', async () => {
    const now = new Date();
    prisma.document.findUnique.mockResolvedValue({
      id: 10,
      createdBy: 1,
      creator: {
        id: 1,
        username: 'owner',
        account: 'owner',
      },
      documentCollaborators: [
        {
          id: 20,
          documentId: 10,
          userId: 2,
          role: 'viewer',
          createdAt: now,
          updatedAt: now,
          user: {
            id: 2,
            username: 'viewer',
            account: 'viewer',
          },
        },
      ],
    });

    const result = await service.getCollaborators(2, 10);

    expect(yjsStorageService.validateDocumentAccess).toHaveBeenCalledWith(
      10,
      2,
      'read',
    );
    expect(result.data).toEqual([
      expect.objectContaining({
        userId: 1,
        role: 'owner',
      }),
      expect.objectContaining({
        userId: 2,
        role: 'viewer',
      }),
    ]);
  });

  it('updates a collaborator role', async () => {
    prisma.document.findUnique.mockResolvedValue({ id: 10, createdBy: 1 });
    prisma.documentCollaborator.findUnique.mockResolvedValue({ id: 20 });
    prisma.documentCollaborator.update.mockResolvedValue({
      id: 20,
      documentId: 10,
      userId: 2,
      role: 'viewer',
    });

    const result = await service.updateCollaboratorRole(1, 10, 2, 'viewer');

    expect(prisma.documentCollaborator.update).toHaveBeenCalledWith({
      where: {
        documentId_userId: {
          documentId: 10,
          userId: 2,
        },
      },
      data: {
        role: 'viewer',
      },
      select: {
        id: true,
        documentId: true,
        userId: true,
        role: true,
        updatedAt: true,
      },
    });
    expect(result.data).toMatchObject({
      role: 'viewer',
    });
  });
});
