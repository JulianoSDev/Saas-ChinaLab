import { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError } from '@chinalab/utils';
import { getOrCreateUser } from './userService';

const prisma = new PrismaClient();

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 120;

export type SavedSearchEntry = {
  id: number;
  query: string;
  createdAt: Date;
};

function normalizeQuery(query: string): string {
  const normalized = query.trim().replace(/\s+/g, ' ');

  if (normalized.length < MIN_QUERY_LENGTH) {
    throw new ValidationError('Informe uma busca com pelo menos 2 caracteres.');
  }

  if (normalized.length > MAX_QUERY_LENGTH) {
    throw new ValidationError('Busca muito longa.');
  }

  return normalized;
}

export async function addSavedSearch(discordId: string, query: string): Promise<SavedSearchEntry> {
  const user = await getOrCreateUser(discordId);
  const normalizedQuery = normalizeQuery(query);

  try {
    return await prisma.savedSearch.create({
      data: {
        userId: user.id,
        query: normalizedQuery,
      },
    });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      throw new ValidationError('Essa busca ja esta salva para voce.');
    }

    throw error;
  }
}

export async function listSavedSearches(discordId: string): Promise<SavedSearchEntry[]> {
  const user = await getOrCreateUser(discordId);

  return prisma.savedSearch.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });
}

export async function removeSavedSearch(discordId: string, savedSearchId: number) {
  if (!Number.isInteger(savedSearchId) || savedSearchId <= 0) {
    throw new ValidationError('ID de busca salva invalido.');
  }

  const user = await getOrCreateUser(discordId);

  const savedSearch = await prisma.savedSearch.findFirst({
    where: {
      id: savedSearchId,
      userId: user.id,
    },
  });

  if (!savedSearch) {
    throw new NotFoundError('Busca salva nao encontrada para este usuario.');
  }

  await prisma.savedSearch.delete({
    where: { id: savedSearch.id },
  });

  return savedSearch;
}
