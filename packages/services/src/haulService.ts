import { PrismaClient } from '@prisma/client';
import { createLogger, NotFoundError, ValidationError } from '@chinalab/utils';
import { getOrCreateUser } from './userService';

const log = createLogger('HaulService');
const prisma = new PrismaClient();

const MAX_ITEMS = 20;

export async function createHaul(discordId: string, name: string) {
  const user = await getOrCreateUser(discordId);
  return prisma.haul.create({
    data: { userId: user.id, name },
    include: { items: true },
  });
}

export async function getActiveHaul(discordId: string) {
  const user = await getOrCreateUser(discordId);
  return prisma.haul.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { items: true },
  });
}

export async function addItem(discordId: string, item: {
  productLink: string;
  price: number;
  weightGrams: number;
  seller?: string;
}) {
  const haul = await getActiveHaul(discordId);
  if (!haul) throw new NotFoundError('Você não tem um haul ativo. Use /haul criar primeiro.');
  if (haul.items.length >= MAX_ITEMS) throw new ValidationError(`Limite de ${MAX_ITEMS} itens por haul.`);

  return prisma.haulItem.create({
    data: { haulId: haul.id, ...item },
  });
}

export async function removeItem(discordId: string, itemIndex: number) {
  const haul = await getActiveHaul(discordId);
  if (!haul) throw new NotFoundError('Você não tem um haul ativo.');
  if (itemIndex < 1 || itemIndex > haul.items.length) {
    throw new ValidationError(`Item inválido. Seu haul tem ${haul.items.length} itens.`);
  }
  const item = haul.items[itemIndex - 1];
  await prisma.haulItem.delete({ where: { id: item.id } });
  return item;
}

export async function clearHaul(discordId: string) {
  const haul = await getActiveHaul(discordId);
  if (!haul) throw new NotFoundError('Você não tem um haul ativo.');
  await prisma.haulItem.deleteMany({ where: { haulId: haul.id } });
  await prisma.haul.delete({ where: { id: haul.id } });
}

export function calcHaulTotals(items: { price: number; weightGrams: number }[]) {
  const totalPrice = items.reduce((sum, i) => sum + i.price, 0);
  const totalWeightGrams = items.reduce((sum, i) => sum + i.weightGrams, 0);
  return { totalPrice, totalWeightGrams, totalWeightKg: totalWeightGrams / 1000 };
}
