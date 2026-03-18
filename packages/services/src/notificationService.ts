import { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError } from '@chinalab/utils';
import { getOrCreateUser } from './userService';

const prisma = new PrismaClient();

const MIN_TEXT_LENGTH = 1;
const MAX_TYPE_LENGTH = 64;
const MAX_TITLE_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 500;
const MAX_PAYLOAD_LENGTH = 2000;

type CreateNotificationInput = {
  discordId: string;
  type: string;
  title: string;
  message: string;
  payload?: string;
};

export type UserNotification = {
  id: number;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
  readAt: Date | null;
};

function validateDiscordId(discordId: string): string {
  const normalized = discordId.trim();

  if (normalized.length === 0) {
    throw new ValidationError('Identificador de usuario invalido.');
  }

  return normalized;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function validateBoundedText(value: string, field: string, maxLength: number): string {
  const normalized = normalizeText(value);

  if (normalized.length < MIN_TEXT_LENGTH) {
    throw new ValidationError(`${field} invalido.`);
  }

  if (normalized.length > maxLength) {
    throw new ValidationError(`${field} muito longo.`);
  }

  return normalized;
}

function validatePayload(payload?: string): string | undefined {
  if (payload === undefined) {
    return undefined;
  }

  const normalized = payload.trim();

  if (normalized.length === 0) {
    return undefined;
  }

  if (normalized.length > MAX_PAYLOAD_LENGTH) {
    throw new ValidationError('Payload de notificacao muito longo.');
  }

  return normalized;
}

export async function createNotification(input: CreateNotificationInput) {
  const user = await getOrCreateUser(validateDiscordId(input.discordId));

  return prisma.notificationEvent.create({
    data: {
      userId: user.id,
      type: validateBoundedText(input.type, 'Tipo de notificacao', MAX_TYPE_LENGTH),
      title: validateBoundedText(input.title, 'Titulo da notificacao', MAX_TITLE_LENGTH),
      message: validateBoundedText(input.message, 'Mensagem da notificacao', MAX_MESSAGE_LENGTH),
      payload: validatePayload(input.payload),
    },
  });
}

export async function listNotifications(discordId: string, limit = 20) {
  const user = await getOrCreateUser(validateDiscordId(discordId));

  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : 20;

  const notifications = await prisma.notificationEvent.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: safeLimit,
  });

  return notifications.map((notification): UserNotification => ({
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    isRead: notification.isRead,
    createdAt: notification.createdAt,
    readAt: notification.readAt,
  }));
}

export async function countUnreadNotificationsByTypePrefix(discordId: string, typePrefix: string) {
  const user = await getOrCreateUser(validateDiscordId(discordId));
  const normalizedTypePrefix = validateBoundedText(typePrefix, 'Prefixo de notificacao', MAX_TYPE_LENGTH);

  return prisma.notificationEvent.count({
    where: {
      userId: user.id,
      isRead: false,
      type: {
        startsWith: normalizedTypePrefix,
      },
    },
  });
}

export async function markNotificationAsRead(discordId: string, notificationId: number) {
  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    throw new ValidationError('ID de notificacao invalido.');
  }

  const user = await getOrCreateUser(validateDiscordId(discordId));

  const notification = await prisma.notificationEvent.findFirst({
    where: {
      id: notificationId,
      userId: user.id,
    },
  });

  if (!notification) {
    throw new NotFoundError('Notificacao nao encontrada para este usuario.');
  }

  if (notification.isRead) {
    return notification;
  }

  return prisma.notificationEvent.update({
    where: { id: notification.id },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
}
