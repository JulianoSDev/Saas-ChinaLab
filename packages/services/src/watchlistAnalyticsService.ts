import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type WatchlistEventInput = {
  userId: number;
  eventName: string;
  targetType?: string;
  detail?: string;
};

export async function recordWatchlistEvent(input: WatchlistEventInput) {
  return prisma.watchlistEvent.create({
    data: {
      userId: input.userId,
      eventName: input.eventName,
      targetType: input.targetType,
      detail: input.detail,
    },
  });
}
