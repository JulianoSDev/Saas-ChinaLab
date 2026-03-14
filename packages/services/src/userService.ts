import { PrismaClient } from '@prisma/client';
import { createLogger } from '@chinalab/utils';

const log = createLogger('UserService');
const prisma = new PrismaClient();

export async function getOrCreateUser(discordId: string) {
  let user = await prisma.user.findUnique({ where: { discordId } });
  if (!user) {
    user = await prisma.user.create({ data: { discordId } });
    log.info({ discordId }, 'Novo usuário criado');
  }
  return user;
}

export async function addXp(discordId: string, amount: number) {
  const user = await getOrCreateUser(discordId);
  const newXp = user.xp + amount;
  const newLevel = Math.floor(newXp / 100) + 1;
  return prisma.user.update({
    where: { discordId },
    data: { xp: newXp, level: newLevel },
  });
}
