import { PrismaClient } from '@prisma/client';
import { ValidationError } from '@chinalab/utils';
import { getOrCreateUser } from './userService';
import { getSellerByName } from './sellerService';

const prisma = new PrismaClient();

const REVIEW_TARGET_LINK = 'link';
const REVIEW_TARGET_SELLER = 'seller';
const MIN_COMMENT_LENGTH = 4;
const MAX_COMMENT_LENGTH = 280;
const MAX_LIST_REVIEWS = 5;
const EXPERIENCE_TAGS: ReviewExperienceTag[] = ['boa', 'mista', 'ruim'];

export type ReviewTargetType = 'link' | 'seller';
export type ReviewExperienceTag = 'boa' | 'mista' | 'ruim';

export type CommunityEvidence = {
  reviewCount: number;
  averageRating: number | null;
  evidenceStrength: 'forte' | 'moderada' | 'limitada';
  reading: string;
  latestReviews: Array<{
    id: number;
    rating: number;
    comment: string | null;
    experienceTag: string | null;
    createdAt: Date;
  }>;
};

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeLink(rawLink: string): string {
  const value = normalizeText(rawLink);

  try {
    const url = new URL(value);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    return url.toString();
  } catch {
    throw new ValidationError('Informe um link valido para review.');
  }
}

function normalizeComment(comment: string): string {
  const normalized = normalizeText(comment);

  if (normalized.length < MIN_COMMENT_LENGTH) {
    throw new ValidationError('Escreva um comentario curto, mas util.');
  }

  if (normalized.length > MAX_COMMENT_LENGTH) {
    throw new ValidationError('Comentario muito longo. Limite de 280 caracteres.');
  }

  return normalized;
}

export function getAllowedExperienceTags(): ReviewExperienceTag[] {
  return [...EXPERIENCE_TAGS];
}

export function formatExperienceTag(tag: string | null): string {
  if (!tag) {
    return 'Nao informado';
  }

  if (tag === 'boa') {
    return 'Boa';
  }

  if (tag === 'mista') {
    return 'Mista';
  }

  if (tag === 'ruim') {
    return 'Ruim';
  }

  return tag;
}

function validateRating(rating: number): number {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ValidationError('A nota da review deve ser entre 1 e 5.');
  }

  return rating;
}

function normalizeExperienceTag(tag: string | null | undefined): ReviewExperienceTag | null {
  if (!tag) {
    return null;
  }

  const normalized = normalizeText(tag).toLocaleLowerCase() as ReviewExperienceTag;

  if (!EXPERIENCE_TAGS.includes(normalized)) {
    throw new ValidationError('Tipo de experiencia invalido. Use boa, mista ou ruim.');
  }

  return normalized;
}

function toEvidenceStrength(reviewCount: number, averageRating: number | null): CommunityEvidence['evidenceStrength'] {
  if (reviewCount >= 4 && averageRating !== null) {
    return 'forte';
  }

  if (reviewCount >= 2) {
    return 'moderada';
  }

  return 'limitada';
}

function buildEvidenceReading(
  targetLabel: string,
  reviewCount: number,
  averageRating: number | null,
  evidenceStrength: CommunityEvidence['evidenceStrength'],
): string {
  if (reviewCount === 0) {
    return `Ainda nao ha evidencia comunitaria suficiente para ${targetLabel}.`;
  }

  if (evidenceStrength === 'forte') {
    return `Ha evidencia comunitaria mais forte para ${targetLabel}${averageRating ? `, com media ${averageRating.toFixed(1)}/5` : ''}.`;
  }

  if (evidenceStrength === 'moderada') {
    return `Ja existe alguma evidencia comunitaria para ${targetLabel}, mas ainda vale revisar com cautela.`;
  }

  return `O contexto comunitario para ${targetLabel} ainda e limitado.`;
}

async function resolveTarget(targetType: ReviewTargetType, rawTarget: string) {
  if (targetType === REVIEW_TARGET_LINK) {
    return {
      targetType: REVIEW_TARGET_LINK,
      targetKey: normalizeLink(rawTarget),
      displayLabel: 'este link',
    };
  }

  const seller = await getSellerByName(rawTarget);

  return {
    targetType: REVIEW_TARGET_SELLER,
    targetKey: seller.sellerName.trim().toLocaleLowerCase(),
    displayLabel: `seller ${seller.sellerName}`,
  };
}

export async function createReview(input: {
  discordId: string;
  targetType: ReviewTargetType;
  target: string;
  rating: number;
  comment: string;
  experienceTag?: string | null;
}) {
  const user = await getOrCreateUser(input.discordId);
  const resolvedTarget = await resolveTarget(input.targetType, input.target);
  const rating = validateRating(input.rating);
  const comment = normalizeComment(input.comment);
  const experienceTag = normalizeExperienceTag(input.experienceTag);

  return prisma.review.create({
    data: {
      userId: user.id,
      targetType: resolvedTarget.targetType,
      targetKey: resolvedTarget.targetKey,
      rating,
      comment,
      experienceTag,
    },
  });
}

export async function listReviews(input: {
  targetType: ReviewTargetType;
  target: string;
}) {
  const resolvedTarget = await resolveTarget(input.targetType, input.target);

  return prisma.review.findMany({
    where: {
      targetType: resolvedTarget.targetType,
      targetKey: resolvedTarget.targetKey,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: MAX_LIST_REVIEWS,
    select: {
      id: true,
      rating: true,
      comment: true,
      experienceTag: true,
      createdAt: true,
    },
  });
}

export async function getCommunityEvidence(input: {
  targetType: ReviewTargetType;
  target: string;
}) : Promise<CommunityEvidence> {
  const resolvedTarget = await resolveTarget(input.targetType, input.target);

  const [aggregate, latestReviews] = await Promise.all([
    prisma.review.aggregate({
      where: {
        targetType: resolvedTarget.targetType,
        targetKey: resolvedTarget.targetKey,
      },
      _count: {
        _all: true,
      },
      _avg: {
        rating: true,
      },
    }),
    prisma.review.findMany({
      where: {
        targetType: resolvedTarget.targetType,
        targetKey: resolvedTarget.targetKey,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: MAX_LIST_REVIEWS,
      select: {
        id: true,
        rating: true,
        comment: true,
        experienceTag: true,
        createdAt: true,
      },
    }),
  ]);

  const reviewCount = aggregate._count._all;
  const averageRating = aggregate._avg.rating ?? null;
  const evidenceStrength = toEvidenceStrength(reviewCount, averageRating);

  return {
    reviewCount,
    averageRating,
    evidenceStrength,
    reading: buildEvidenceReading(resolvedTarget.displayLabel, reviewCount, averageRating, evidenceStrength),
    latestReviews,
  };
}

export async function getContributionSummary(discordId: string) {
  const user = await getOrCreateUser(discordId);

  const createdReviewCount = await prisma.review.count({
    where: {
      userId: user.id,
    },
  });

  return {
    createdReviewCount,
  };
}
