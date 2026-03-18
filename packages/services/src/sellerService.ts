import { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError } from '@chinalab/utils';

const prisma = new PrismaClient();

const MIN_SELLER_NAME_LENGTH = 2;
const MAX_SELLER_NAME_LENGTH = 80;

function normalizeSellerName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function normalizeForComparison(name: string): string {
  return normalizeSellerName(name).toLocaleLowerCase();
}

function validateSellerName(name: string): string {
  const normalized = normalizeSellerName(name);

  if (normalized.length < MIN_SELLER_NAME_LENGTH) {
    throw new ValidationError('Informe um nome de vendedor valido.');
  }

  if (normalized.length > MAX_SELLER_NAME_LENGTH) {
    throw new ValidationError('Nome de vendedor muito longo.');
  }

  return normalized;
}

export async function getSellerByName(name: string) {
  const normalized = validateSellerName(name);
  const normalizedComparison = normalizeForComparison(normalized);
  const sellers = await prisma.seller.findMany({
    orderBy: {
      averageRating: 'desc',
    },
    take: 100,
  });

  const exactMatches = sellers.filter(
    (seller) => normalizeForComparison(seller.sellerName) === normalizedComparison,
  );

  const exactMatch = exactMatches[0];

  if (exactMatch) {
    return exactMatch;
  }

  const partialMatches = sellers
    .filter((seller) => normalizeForComparison(seller.sellerName).includes(normalizedComparison))
    .slice(0, 2);

  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  if (partialMatches.length > 1) {
    throw new ValidationError('Foram encontrados varios vendedores parecidos. Seja mais especifico.');
  }

  throw new NotFoundError(`Vendedor "${normalized}" nao encontrado na base interna.`);
}
