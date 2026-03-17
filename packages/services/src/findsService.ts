import { Prisma, PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError } from '@chinalab/utils';

const prisma = new PrismaClient();

const VALID_CATEGORIES = new Set([
  'tenis',
  'roupas',
  'acessorios',
  'eletronicos',
  'utilidades',
]);

const FIND_SUGGESTION_STATUS = {
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
} as const;

type EditableFindField = 'name' | 'price' | 'category' | 'seller' | 'link' | 'imageUrl';

type CreateFindInput = {
  name: string;
  link: string;
  price: number;
  category: string;
  seller?: string;
  imageUrl?: string;
};

type CreateSuggestionInput = CreateFindInput & {
  discordId: string;
  username: string;
  notes?: string;
};

function assertValidCategory(category: string) {
  if (!VALID_CATEGORIES.has(category)) {
    throw new ValidationError('Categoria invalida.');
  }
}

function normalizeOptionalString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseEditableField(field: EditableFindField, rawValue: string): Record<string, unknown> {
  const value = rawValue.trim();

  if (!value) {
    throw new ValidationError('Informe um valor valido para atualizacao.');
  }

  if (field === 'price') {
    const price = Number.parseFloat(value);
    if (!Number.isFinite(price) || price <= 0) {
      throw new ValidationError('Preco invalido. Use um numero maior que zero.');
    }

    return { price };
  }

  if (field === 'category') {
    assertValidCategory(value);
    return { category: value };
  }

  if (field === 'seller' || field === 'imageUrl') {
    return { [field]: normalizeOptionalString(value) };
  }

  return { [field]: value };
}

async function getSuggestionOrThrow(id: number) {
  const suggestion = await prisma.findSuggestion.findUnique({ where: { id } });

  if (!suggestion) {
    throw new NotFoundError(`Sugestao #${id} nao encontrada.`);
  }

  return suggestion;
}

async function getPendingSuggestionOrThrow(id: number) {
  const suggestion = await getSuggestionOrThrow(id);

  if (suggestion.status !== FIND_SUGGESTION_STATUS.pending) {
    throw new ValidationError(
      `Sugestao #${id} nao esta pendente. Status atual: ${suggestion.status}.`
    );
  }

  return suggestion;
}

export async function listFinds(category?: string) {
  if (category) {
    assertValidCategory(category);
  }

  return prisma.find.findMany({
    where: category ? { category } : {},
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
}

export async function listCatalogFinds(limit = 20) {
  return prisma.find.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function getFindById(id: number) {
  const find = await prisma.find.findUnique({ where: { id } });

  if (!find) {
    throw new NotFoundError(`Achado #${id} nao encontrado.`);
  }

  return find;
}

export async function recordFindClick(id: number) {
  return prisma.find.update({
    where: { id },
    data: { clicks: { increment: 1 } },
  });
}

export async function createFind(input: CreateFindInput) {
  assertValidCategory(input.category);

  return prisma.find.create({
    data: {
      name: input.name,
      link: input.link,
      price: input.price,
      category: input.category,
      seller: input.seller,
      imageUrl: input.imageUrl,
    },
  });
}

export async function removeFind(id: number) {
  await getFindById(id);
  await prisma.find.delete({ where: { id } });
}

export async function updatePublishedFind(
  id: number,
  field: EditableFindField,
  rawValue: string,
) {
  await getFindById(id);

  return prisma.find.update({
    where: { id },
    data: parseEditableField(field, rawValue),
  });
}

export async function createFindSuggestion(input: CreateSuggestionInput) {
  assertValidCategory(input.category);

  return prisma.findSuggestion.create({
    data: {
      discordId: input.discordId,
      username: input.username,
      name: input.name,
      link: input.link,
      price: input.price,
      category: input.category,
      seller: input.seller,
      imageUrl: input.imageUrl,
      notes: input.notes,
    },
  });
}

export async function listPendingFindSuggestions(limit = 10) {
  return prisma.findSuggestion.findMany({
    where: { status: FIND_SUGGESTION_STATUS.pending },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
}

export async function getFindSuggestionById(id: number) {
  return getSuggestionOrThrow(id);
}

export async function updatePendingFindSuggestion(
  id: number,
  field: EditableFindField,
  rawValue: string,
) {
  await getPendingSuggestionOrThrow(id);

  return prisma.findSuggestion.update({
    where: { id },
    data: parseEditableField(field, rawValue),
  });
}

export async function approveFindSuggestion(id: number, reviewedBy: string) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const suggestion = await tx.findSuggestion.findUnique({ where: { id } });

    if (!suggestion) {
      throw new NotFoundError(`Sugestao #${id} nao encontrada.`);
    }

    if (suggestion.status !== FIND_SUGGESTION_STATUS.pending) {
      throw new ValidationError(
        `Sugestao #${id} nao esta pendente. Status atual: ${suggestion.status}.`
      );
    }

    const find = await tx.find.create({
      data: {
        name: suggestion.name,
        link: suggestion.link,
        price: suggestion.price,
        category: suggestion.category,
        seller: suggestion.seller,
        imageUrl: suggestion.imageUrl,
      },
    });

    await tx.findSuggestion.update({
      where: { id },
      data: {
        status: FIND_SUGGESTION_STATUS.approved,
        reviewedBy,
        reviewedAt: new Date(),
        publishedFindId: find.id,
      },
    });

    return { suggestion, find };
  });
}

export async function rejectFindSuggestion(id: number, reviewedBy: string) {
  const suggestion = await getPendingSuggestionOrThrow(id);

  await prisma.findSuggestion.update({
    where: { id },
    data: {
      status: FIND_SUGGESTION_STATUS.rejected,
      reviewedBy,
      reviewedAt: new Date(),
    },
  });

  return suggestion;
}
