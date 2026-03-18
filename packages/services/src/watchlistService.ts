import { PrismaClient } from '@prisma/client';
import { AppError, NotFoundError, ValidationError } from '@chinalab/utils';
import { getOrCreateUser } from './userService';
import { getFindById } from './findsService';
import { getSellerByName } from './sellerService';
import { recordWatchlistEvent } from './watchlistAnalyticsService';
import { countUnreadNotificationsByTypePrefix } from './notificationService';

const prisma = new PrismaClient();

const WATCH_TARGET_TYPES = {
  item: 'item',
  seller: 'seller',
  link: 'link',
} as const;

type WatchTargetType = (typeof WATCH_TARGET_TYPES)[keyof typeof WATCH_TARGET_TYPES];

export type WatchEntry = {
  id: number;
  targetType: string;
  targetKey: string;
  displayLabel: string;
  createdAt: Date;
  lastLinkCheckAt: Date | null;
  lastLinkCheckStatus: string | null;
  lastLinkProblemReason: string | null;
  lastLinkStatusChangedAt: Date | null;
};

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeLink(rawLink: string): string {
  const value = rawLink.trim();

  if (!value) {
    throw new ValidationError('Informe um link valido.');
  }

  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new ValidationError('Link invalido. Use uma URL completa.');
  }

  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase();

  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) {
    throw new ValidationError('Link invalido. Use http ou https.');
  }

  return parsed.toString();
}

async function createWatch(
  userId: number,
  targetType: WatchTargetType,
  targetKey: string,
  displayLabel: string,
) {
  try {
    return await prisma.watchSubscription.create({
      data: {
        userId,
        targetType,
        targetKey,
        displayLabel,
      },
    });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      throw new ValidationError('Esse acompanhamento ja existe na sua watchlist.');
    }

    throw error;
  }
}

function classifyWatchlistFailure(error: unknown): string {
  if (error instanceof ValidationError) {
    return 'validation_error';
  }

  if (error instanceof NotFoundError) {
    return 'not_found';
  }

  return 'internal_error';
}

export async function addItemToWatchlist(discordId: string, findId: number) {
  const user = await getOrCreateUser(discordId);
  await recordWatchlistEvent({
    userId: user.id,
    eventName: 'watchlist_add_attempt',
    targetType: WATCH_TARGET_TYPES.item,
  });

  try {
    if (!Number.isInteger(findId) || findId <= 0) {
      throw new ValidationError('ID de item invalido.');
    }

    const find = await getFindById(findId);

    const watch = await createWatch(
      user.id,
      WATCH_TARGET_TYPES.item,
      `find:${find.id}`,
      `Item: ${find.name}`,
    );

    await recordWatchlistEvent({
      userId: user.id,
      eventName: 'watchlist_add_success',
      targetType: WATCH_TARGET_TYPES.item,
    });

    return watch;
  } catch (error) {
    await recordWatchlistEvent({
      userId: user.id,
      eventName: 'watchlist_add_failure',
      targetType: WATCH_TARGET_TYPES.item,
      detail: classifyWatchlistFailure(error),
    });
    throw error;
  }
}

export async function addSellerToWatchlist(discordId: string, sellerName: string) {
  const user = await getOrCreateUser(discordId);
  await recordWatchlistEvent({
    userId: user.id,
    eventName: 'watchlist_add_attempt',
    targetType: WATCH_TARGET_TYPES.seller,
  });

  try {
    const seller = await getSellerByName(sellerName);

    const watch = await createWatch(
      user.id,
      WATCH_TARGET_TYPES.seller,
      normalizeText(seller.sellerName).toLocaleLowerCase(),
      `Seller: ${seller.sellerName}`,
    );

    await recordWatchlistEvent({
      userId: user.id,
      eventName: 'watchlist_add_success',
      targetType: WATCH_TARGET_TYPES.seller,
    });

    return watch;
  } catch (error) {
    await recordWatchlistEvent({
      userId: user.id,
      eventName: 'watchlist_add_failure',
      targetType: WATCH_TARGET_TYPES.seller,
      detail: classifyWatchlistFailure(error),
    });
    throw error;
  }
}

export async function addLinkToWatchlist(discordId: string, link: string) {
  const user = await getOrCreateUser(discordId);
  await recordWatchlistEvent({
    userId: user.id,
    eventName: 'watchlist_add_attempt',
    targetType: WATCH_TARGET_TYPES.link,
  });

  try {
    const normalizedLink = normalizeLink(link);

    const watch = await createWatch(
      user.id,
      WATCH_TARGET_TYPES.link,
      normalizedLink,
      `Link: ${normalizedLink}`,
    );

    await recordWatchlistEvent({
      userId: user.id,
      eventName: 'watchlist_add_success',
      targetType: WATCH_TARGET_TYPES.link,
    });

    return watch;
  } catch (error) {
    await recordWatchlistEvent({
      userId: user.id,
      eventName: 'watchlist_add_failure',
      targetType: WATCH_TARGET_TYPES.link,
      detail: classifyWatchlistFailure(error),
    });
    throw error;
  }
}

export async function listWatchlist(discordId: string): Promise<WatchEntry[]> {
  const user = await getOrCreateUser(discordId);
  try {
    const watches = await prisma.watchSubscription.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    await recordWatchlistEvent({
      userId: user.id,
      eventName: 'watchlist_view',
    });

    return watches;
  } catch (error) {
    await recordWatchlistEvent({
      userId: user.id,
      eventName: 'watchlist_view_failure',
      detail: classifyWatchlistFailure(error),
    });
    throw error;
  }
}

export async function removeWatchFromList(discordId: string, watchId: number) {
  const user = await getOrCreateUser(discordId);
  await recordWatchlistEvent({
    userId: user.id,
    eventName: 'watchlist_remove_attempt',
  });

  try {
    if (!Number.isInteger(watchId) || watchId <= 0) {
      throw new ValidationError('ID de watch invalido.');
    }

    const watch = await prisma.watchSubscription.findFirst({
      where: {
        id: watchId,
        userId: user.id,
      },
    });

    if (!watch) {
      throw new NotFoundError('Watch nao encontrada para este usuario.');
    }

    await prisma.watchSubscription.delete({
      where: { id: watch.id },
    });

    await recordWatchlistEvent({
      userId: user.id,
      eventName: 'watchlist_remove_success',
      targetType: watch.targetType,
    });

    return watch;
  } catch (error) {
    await recordWatchlistEvent({
      userId: user.id,
      eventName: 'watchlist_remove_failure',
      detail: classifyWatchlistFailure(error),
    });
    throw error;
  }
}

export function getWatchTargetTypeLabel(targetType: string): string {
  switch (targetType) {
    case WATCH_TARGET_TYPES.item:
      return 'Item';
    case WATCH_TARGET_TYPES.seller:
      return 'Seller';
    case WATCH_TARGET_TYPES.link:
      return 'Link';
    default:
      throw new AppError('Tipo de watch desconhecido.');
  }
}

export function getWatchStatusLabel(watch: WatchEntry): string {
  if (watch.targetType !== WATCH_TARGET_TYPES.link) {
    return 'Acompanhando';
  }

  switch (watch.lastLinkCheckStatus) {
    case 'ok':
      return 'OK';
    case 'problematic':
      return 'Possivelmente problematico';
    default:
      return 'Status desconhecido';
  }
}

export async function getWatchlistAlertSummary(discordId: string) {
  const watches = await listWatchlist(discordId);
  const watchedLinks = watches.filter((watch) => watch.targetType === WATCH_TARGET_TYPES.link);
  const unreadAlerts = await countUnreadNotificationsByTypePrefix(discordId, 'watchlist.link_');

  return {
    totalEntries: watches.length,
    checkedLinks: watchedLinks.filter((watch) => Boolean(watch.lastLinkCheckAt)).length,
    okLinks: watchedLinks.filter((watch) => watch.lastLinkCheckStatus === 'ok').length,
    problematicLinks: watchedLinks.filter((watch) => watch.lastLinkCheckStatus === 'problematic').length,
    unknownLinks: watchedLinks.filter((watch) => !watch.lastLinkCheckStatus).length,
    unreadAlerts,
  };
}
