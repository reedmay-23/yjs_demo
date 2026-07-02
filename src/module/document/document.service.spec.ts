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
        create: jest.fn(),
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
});
