import { PrismaClient } from '@prisma/client';
import { ValidationError } from '@chinalab/utils';
import { getOrCreateUser } from './userService';
import { createNotification } from './notificationService';

const prisma = new PrismaClient();

const WATCH_TARGET_TYPE_LINK = 'link';
const CHECK_TIMEOUT_MS = 8000;
const CHECK_BODY_PREVIEW_LIMIT = 2048;
const PROBLEMATIC_RESPONSE_STATUSES = new Set([404, 410, 451, 500, 502, 503, 504]);
const PROBLEMATIC_BODY_PATTERNS = [
  /not found/i,
  /page not found/i,
  /item removed/i,
  /product removed/i,
  /listing unavailable/i,
  />404</i,
];

type LinkCheckState = 'ok' | 'problematic';

type LinkCheckReason =
  | 'request_failed'
  | 'http_status'
  | 'body_signal'
  | 'invalid_response';

type LinkHealthResult = {
  watchId: number;
  targetKey: string;
  state: LinkCheckState;
  reason?: LinkCheckReason;
  httpStatus?: number;
};

function validateDiscordId(discordId: string): string {
  const normalized = discordId.trim();

  if (!normalized) {
    throw new ValidationError('Identificador de usuario invalido.');
  }

  return normalized;
}

function classifyBodySignal(body: string): boolean {
  return PROBLEMATIC_BODY_PATTERNS.some((pattern) => pattern.test(body));
}

async function checkLinkHealth(targetKey: string): Promise<LinkHealthResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(targetKey, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'ChinaLab/1.0 passive-link-check',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (PROBLEMATIC_RESPONSE_STATUSES.has(response.status)) {
      return {
        watchId: 0,
        targetKey,
        state: 'problematic',
        reason: 'http_status',
        httpStatus: response.status,
      };
    }

    if (!response.ok) {
      return {
        watchId: 0,
        targetKey,
        state: 'problematic',
        reason: 'invalid_response',
        httpStatus: response.status,
      };
    }

    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('text/html')) {
      const body = (await response.text()).slice(0, CHECK_BODY_PREVIEW_LIMIT);

      if (classifyBodySignal(body)) {
        return {
          watchId: 0,
          targetKey,
          state: 'problematic',
          reason: 'body_signal',
          httpStatus: response.status,
        };
      }
    }

    return {
      watchId: 0,
      targetKey,
      state: 'ok',
      httpStatus: response.status,
    };
  } catch {
    return {
      watchId: 0,
      targetKey,
      state: 'problematic',
      reason: 'request_failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function maybeNotifyProblem(
  discordId: string,
  watch: {
    id: number;
    displayLabel: string;
    lastLinkCheckStatus: string | null;
    targetKey: string;
  },
  result: LinkHealthResult,
) {
  if (result.state !== 'problematic') {
    return false;
  }

  if (watch.lastLinkCheckStatus === 'problematic') {
    return false;
  }

  const message = result.httpStatus
    ? `O link acompanhado pode estar com problema (status ${result.httpStatus}).`
    : 'O link acompanhado pode estar com problema e precisa de revisao.';

  await createNotification({
    discordId,
    type: 'watchlist.link_problematic',
    title: 'Link acompanhado possivelmente problematico',
    message,
    payload: JSON.stringify({
      watchId: watch.id,
      targetType: WATCH_TARGET_TYPE_LINK,
      targetKey: watch.targetKey,
      reason: result.reason,
      httpStatus: result.httpStatus,
    }),
  });

  return true;
}

export async function checkWatchedLinksForUser(discordId: string, limit = 20) {
  const normalizedDiscordId = validateDiscordId(discordId);
  const user = await getOrCreateUser(normalizedDiscordId);
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : 20;

  const watches = await prisma.watchSubscription.findMany({
    where: {
      userId: user.id,
      targetType: WATCH_TARGET_TYPE_LINK,
    },
    orderBy: { createdAt: 'asc' },
    take: safeLimit,
  });

  const results: Array<
    LinkHealthResult & {
      notificationCreated: boolean;
      checkedAt: Date;
    }
  > = [];

  for (const watch of watches) {
    const checkedAt = new Date();
    const linkResult = await checkLinkHealth(watch.targetKey);
    const result = {
      ...linkResult,
      watchId: watch.id,
      checkedAt,
    };

    const notificationCreated = await maybeNotifyProblem(normalizedDiscordId, watch, result);

    await prisma.watchSubscription.update({
      where: { id: watch.id },
      data: {
        lastLinkCheckAt: checkedAt,
        lastLinkCheckStatus: result.state,
        lastLinkProblemReason: result.reason ?? null,
        lastLinkStatusChangedAt:
          watch.lastLinkCheckStatus !== result.state ? checkedAt : watch.lastLinkStatusChangedAt,
        lastProblemNotifiedAt:
          result.state === 'problematic' && notificationCreated ? checkedAt : watch.lastProblemNotifiedAt,
      },
    });

    results.push({
      ...result,
      notificationCreated,
    });
  }

  return results;
}

export async function runPassiveWatchlistLinkCheck(discordId: string, limit = 20) {
  const results = await checkWatchedLinksForUser(discordId, limit);

  return {
    checkedCount: results.length,
    okCount: results.filter((result) => result.state === 'ok').length,
    problematicCount: results.filter((result) => result.state === 'problematic').length,
    notificationsCreated: results.filter((result) => result.notificationCreated).length,
  };
}
