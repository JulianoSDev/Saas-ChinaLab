import { PrismaClient } from '@prisma/client';
import { ValidationError } from '@chinalab/utils';
import { getSellerByName } from './sellerService';
import { getCommunityEvidence } from './reviewService';

const prisma = new PrismaClient();

const WATCH_TARGET_TYPE_LINK = 'link';
const WATCH_TARGET_TYPE_SELLER = 'seller';
const MIN_LINK_LENGTH = 8;
const MAX_LINK_LENGTH = 2000;

type SignalBucket = 'low' | 'medium' | 'high';
type LinkStabilityLabel = 'ok' | 'possivelmente problematico' | 'desconhecido';
type ScoreAlphaLabel = 'sinais fortes' | 'sinais mistos' | 'sinais limitados';
type PriorityLabel =
  | 'vale revisar primeiro'
  | 'sob mais pressao'
  | 'parece mais estavel'
  | 'contexto limitado';
type DecisionSummaryLabel = 'revisar agora' | 'acompanhar' | 'cautela' | 'contexto insuficiente';

export type PriorityReading = {
  label: PriorityLabel;
  reading: string;
  nextStep: string;
};

export type DecisionCard = {
  summary: DecisionSummaryLabel;
  currentPriority: PriorityLabel;
  apparentStability: string;
  pressure: string;
  availableContext: string;
  actionLabel: string;
  nextStep: string;
};

export type LinkSignalSet = {
  normalizedLink: string;
  watchCount: number;
  checkedCount: number;
  problematicCount: number;
  okCount: number;
  alertCount: number;
  unreadAlertCount: number;
  lastCheckedAt: Date | null;
  lastStatusChangedAt: Date | null;
  stability: LinkStabilityLabel;
  reviewCount: number;
  communityEvidence: {
    reviewCount: number;
    averageRating: number | null;
    evidenceStrength: 'forte' | 'moderada' | 'limitada';
    reading: string;
  };
  priority: PriorityReading;
  decisionCard: DecisionCard;
  scoreAlpha: {
    attention: SignalBucket;
    alertPressure: SignalBucket;
    dataCoverage: SignalBucket;
    surface: ScoreAlphaLabel;
    reading: string;
  };
};

export type SellerSignalSet = {
  sellerName: string;
  averageRating: number;
  hasIssueNotes: boolean;
  watchCount: number;
  relatedFindCount: number;
  problematicLinkedWatchCount: number;
  searchAttentionCount: number;
  dataCoverageCount: number;
  reviewCount: number;
  communityEvidence: {
    reviewCount: number;
    averageRating: number | null;
    evidenceStrength: 'forte' | 'moderada' | 'limitada';
    reading: string;
  };
  priority: PriorityReading;
  decisionCard: DecisionCard;
  scoreAlpha: {
    attention: SignalBucket;
    alertPressure: SignalBucket;
    dataCoverage: SignalBucket;
    surface: ScoreAlphaLabel;
    reading: string;
  };
};

export type LinkComparisonResult = {
  left: LinkSignalSet;
  right: LinkSignalSet;
  recommendation: string;
  reviewFirst: 'a' | 'b' | null;
  nextStep: string;
};

export type SellerComparisonResult = {
  left: SellerSignalSet;
  right: SellerSignalSet;
  recommendation: string;
  reviewFirst: 'a' | 'b' | null;
  nextStep: string;
};

export type TrendingSellerEntry = {
  seller: string;
  watches: number;
  relatedFinds: number;
  scoreSurface: ScoreAlphaLabel;
  summary: DecisionSummaryLabel;
  communityEvidence: {
    reviewCount: number;
    averageRating: number | null;
    evidenceStrength: 'forte' | 'moderada' | 'limitada';
    reading: string;
  };
  nextStep: string;
};

export type TrendingPressureHostEntry = {
  host: string;
  problematicLinks: number;
};

export type TrendingReviewEntry = {
  label: string;
  summary: DecisionSummaryLabel;
  bucket: PriorityLabel;
  reason: string;
  nextStep: string;
};

export type TrendingPrioritySummary = {
  reviewNow: number;
  follow: number;
  caution: number;
  limitedContext: number;
};

export type TrendingAlphaResult = {
  topSearches: Array<{ query: string; saves: number }>;
  topWatchedSellers: TrendingSellerEntry[];
  pressuredHosts: TrendingPressureHostEntry[];
  worthReviewing: TrendingReviewEntry[];
  worthFollowing: TrendingReviewEntry[];
  limitedContext: TrendingReviewEntry[];
  prioritySummary: TrendingPrioritySummary;
  recommendation: string;
};

function normalizeLink(rawLink: string): string {
  const value = rawLink.trim();

  if (value.length < MIN_LINK_LENGTH) {
    throw new ValidationError('Informe um link valido para comparar.');
  }

  if (value.length > MAX_LINK_LENGTH) {
    throw new ValidationError('Link muito longo.');
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

function normalizeSellerKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function toSignalBucket(value: number, highThreshold: number, mediumThreshold: number): SignalBucket {
  if (value >= highThreshold) {
    return 'high';
  }

  if (value >= mediumThreshold) {
    return 'medium';
  }

  return 'low';
}

function resolveLinkStability(problematicCount: number, okCount: number): LinkStabilityLabel {
  if (problematicCount > 0) {
    return 'possivelmente problematico';
  }

  if (okCount > 0) {
    return 'ok';
  }

  return 'desconhecido';
}

function resolveScoreAlphaSurface(
  attention: SignalBucket,
  alertPressure: SignalBucket,
  dataCoverage: SignalBucket,
): ScoreAlphaLabel {
  if (dataCoverage === 'low') {
    return 'sinais limitados';
  }

  if (alertPressure === 'high') {
    return 'sinais mistos';
  }

  if (attention === 'high' || attention === 'medium') {
    return 'sinais fortes';
  }

  return 'sinais mistos';
}

function buildScoreAlphaReading(surface: ScoreAlphaLabel): string {
  if (surface === 'sinais fortes') {
    return 'Ha contexto mais util para decidir agora.';
  }

  if (surface === 'sinais mistos') {
    return 'Ha sinal util, mas ainda com pressao ou incerteza.';
  }

  return 'Ainda ha pouco contexto confiavel para uma leitura forte.';
}

function extractHost(link: string): string {
  try {
    return new URL(link).hostname.toLowerCase();
  } catch {
    return link;
  }
}

function buildLinkRecommendation(left: LinkSignalSet, right: LinkSignalSet) {
  if (left.problematicCount > right.problematicCount) {
    return {
      reviewFirst: 'a' as const,
      recommendation: 'Vale revisar primeiro o link A. Ele tem mais sinais problematicos conhecidos.',
      nextStep: 'Confira alertas e estabilidade recente do link A antes de decidir.',
    };
  }

  if (right.problematicCount > left.problematicCount) {
    return {
      reviewFirst: 'b' as const,
      recommendation: 'Vale revisar primeiro o link B. Ele tem mais sinais problematicos conhecidos.',
      nextStep: 'Confira alertas e estabilidade recente do link B antes de decidir.',
    };
  }

  if (left.unreadAlertCount > right.unreadAlertCount) {
    return {
      reviewFirst: 'a' as const,
      recommendation: 'O link A pede revisao antes. Ele concentra mais alertas nao lidos.',
      nextStep: 'Abra as notificacoes ligadas ao link A e valide o contexto mais recente.',
    };
  }

  if (right.unreadAlertCount > left.unreadAlertCount) {
    return {
      reviewFirst: 'b' as const,
      recommendation: 'O link B pede revisao antes. Ele concentra mais alertas nao lidos.',
      nextStep: 'Abra as notificacoes ligadas ao link B e valide o contexto mais recente.',
    };
  }

  if (left.reviewCount > right.reviewCount) {
    return {
      reviewFirst: null,
      recommendation: 'O link A tem mais contexto ja registrado. Ele parece mais facil de revisar agora.',
      nextStep: 'Use o link A como referencia inicial e compare com cautela o contexto do link B.',
    };
  }

  if (right.reviewCount > left.reviewCount) {
    return {
      reviewFirst: null,
      recommendation: 'O link B tem mais contexto ja registrado. Ele parece mais facil de revisar agora.',
      nextStep: 'Use o link B como referencia inicial e compare com cautela o contexto do link A.',
    };
  }

  if (left.scoreAlpha.surface === 'sinais fortes' && right.scoreAlpha.surface !== 'sinais fortes') {
    return {
      reviewFirst: null,
      recommendation: 'O link A tem sinais mais fortes e menos incerteza no que o ChinaLab conhece agora.',
      nextStep: 'Se for decidir rapido, comece revisando o link A.',
    };
  }

  if (right.scoreAlpha.surface === 'sinais fortes' && left.scoreAlpha.surface !== 'sinais fortes') {
    return {
      reviewFirst: null,
      recommendation: 'O link B tem sinais mais fortes e menos incerteza no que o ChinaLab conhece agora.',
      nextStep: 'Se for decidir rapido, comece revisando o link B.',
    };
  }

  return {
    reviewFirst: null,
    recommendation: 'Os dois links estao parecidos pelos sinais atuais. Vale revisar manualmente o contexto final.',
    nextStep: 'Use custo, alertas e contexto manual antes de priorizar um dos dois.',
  };
}

function buildSellerRecommendation(left: SellerSignalSet, right: SellerSignalSet) {
  if (left.problematicLinkedWatchCount > right.problematicLinkedWatchCount) {
    return {
      reviewFirst: 'a' as const,
      recommendation: 'Vale revisar primeiro o seller A. Ele concentra mais pressao de links problematicos.',
      nextStep: 'Revise primeiro os links ligados ao seller A e trate com mais cautela.',
    };
  }

  if (right.problematicLinkedWatchCount > left.problematicLinkedWatchCount) {
    return {
      reviewFirst: 'b' as const,
      recommendation: 'Vale revisar primeiro o seller B. Ele concentra mais pressao de links problematicos.',
      nextStep: 'Revise primeiro os links ligados ao seller B e trate com mais cautela.',
    };
  }

  if (left.reviewCount > right.reviewCount) {
    return {
      reviewFirst: null,
      recommendation: 'O seller A tem mais reviews ligadas e um pouco mais de contexto confiavel.',
      nextStep: 'Use o seller A como referencia inicial e compare os links do seller B com mais cautela.',
    };
  }

  if (right.reviewCount > left.reviewCount) {
    return {
      reviewFirst: null,
      recommendation: 'O seller B tem mais reviews ligadas e um pouco mais de contexto confiavel.',
      nextStep: 'Use o seller B como referencia inicial e compare os links do seller A com mais cautela.',
    };
  }

  if (left.dataCoverageCount > right.dataCoverageCount) {
    return {
      reviewFirst: null,
      recommendation: 'O seller A tem mais dados associados no ChinaLab. Ha um pouco mais de contexto para decisao.',
      nextStep: 'Vale revisar primeiro o seller A se voce quiser decidir com menos incerteza.',
    };
  }

  if (right.dataCoverageCount > left.dataCoverageCount) {
    return {
      reviewFirst: null,
      recommendation: 'O seller B tem mais dados associados no ChinaLab. Ha um pouco mais de contexto para decisao.',
      nextStep: 'Vale revisar primeiro o seller B se voce quiser decidir com menos incerteza.',
    };
  }

  if (left.searchAttentionCount > right.searchAttentionCount) {
    return {
      reviewFirst: null,
      recommendation: 'O seller A recebeu mais atencao recente nas buscas salvas.',
      nextStep: 'Acompanhar o seller A pode fazer sentido se voce quiser observar movimento recente.',
    };
  }

  if (right.searchAttentionCount > left.searchAttentionCount) {
    return {
      reviewFirst: null,
      recommendation: 'O seller B recebeu mais atencao recente nas buscas salvas.',
      nextStep: 'Acompanhar o seller B pode fazer sentido se voce quiser observar movimento recente.',
    };
  }

  return {
    reviewFirst: null,
    recommendation: 'Os dois sellers estao parecidos pelos sinais atuais. Vale revisar links e contexto manualmente.',
    nextStep: 'Compare links concretos dos dois sellers antes de priorizar um deles.',
  };
}

function labelReviewReason(host: string, problematicLinks: number): string {
  return `${host} aparece com ${problematicLinks} links possivelmente problematicos. Vale revisar.`;
}

function resolveDecisionSummary(priority: PriorityLabel): DecisionSummaryLabel {
  if (priority === 'vale revisar primeiro') {
    return 'revisar agora';
  }

  if (priority === 'parece mais estavel') {
    return 'acompanhar';
  }

  if (priority === 'sob mais pressao') {
    return 'cautela';
  }

  return 'contexto insuficiente';
}

function resolveActionLabel(priority: PriorityLabel): string {
  if (priority === 'vale revisar primeiro') {
    return 'revisar primeiro';
  }

  if (priority === 'parece mais estavel') {
    return 'acompanhar';
  }

  if (priority === 'sob mais pressao') {
    return 'tratar com cautela';
  }

  return 'comparar antes de decidir';
}

function buildLinkDecisionCard(input: {
  stability: LinkStabilityLabel;
  alertCount: number;
  unreadAlertCount: number;
  checkedCount: number;
  reviewCount: number;
  scoreSurface: ScoreAlphaLabel;
  priority: PriorityReading;
}): DecisionCard {
  const apparentStability =
    input.stability === 'ok'
      ? 'Parece mais estavel pelos checks conhecidos.'
      : input.stability === 'possivelmente problematico'
        ? 'Ha sinal recente de instabilidade. Vale revisar.'
        : 'Estabilidade ainda pouco clara pelo que o ChinaLab conhece.';

  const pressure =
    input.unreadAlertCount > 0
      ? `Pressao alta: ${input.unreadAlertCount} alerta(s) nao lido(s).`
      : input.alertCount > 0
        ? `Pressao moderada: ${input.alertCount} alerta(s) historico(s).`
        : 'Pressao baixa: sem alertas conhecidos agora.';

  const availableContext =
    input.scoreSurface === 'sinais fortes'
      ? `Contexto disponivel: ${input.checkedCount} checks e ${input.reviewCount} review(s) ligada(s).`
      : input.scoreSurface === 'sinais mistos'
        ? `Contexto parcial: ${input.checkedCount} checks e ${input.reviewCount} review(s) ligada(s).`
        : 'Contexto limitado: ainda ha pouco historico confiavel aqui.';

  return {
    summary: resolveDecisionSummary(input.priority.label),
    currentPriority: input.priority.label,
    apparentStability,
    pressure,
    availableContext,
    actionLabel: resolveActionLabel(input.priority.label),
    nextStep: input.priority.nextStep,
  };
}

function buildSellerDecisionCard(input: {
  problematicLinkedWatchCount: number;
  watchCount: number;
  relatedFindCount: number;
  reviewCount: number;
  searchAttentionCount: number;
  scoreSurface: ScoreAlphaLabel;
  priority: PriorityReading;
}): DecisionCard {
  const apparentStability =
    input.problematicLinkedWatchCount > 0
      ? 'Ha links ligados sob pressao. Vale revisar com mais cautela.'
      : input.scoreSurface === 'sinais fortes'
        ? 'Os sinais atuais parecem mais estaveis para este seller.'
        : 'A estabilidade ainda depende de pouco contexto conhecido.';

  const attentionPressure = input.watchCount + input.searchAttentionCount;
  const pressure =
    input.problematicLinkedWatchCount > 0
      ? `Pressao alta: ${input.problematicLinkedWatchCount} link(s) ligado(s) com sinal problematico.`
      : attentionPressure >= 3
        ? `Pressao moderada: seller observado ${attentionPressure} vez(es) entre watches e buscas.`
        : 'Pressao baixa: pouca movimentacao recente conhecida.';

  const availableContext =
    input.scoreSurface === 'sinais fortes'
      ? `Contexto disponivel: ${input.relatedFindCount} achado(s) e ${input.reviewCount} review(s) ligada(s).`
      : input.scoreSurface === 'sinais mistos'
        ? `Contexto parcial: ${input.relatedFindCount} achado(s) e ${input.reviewCount} review(s) ligada(s).`
        : 'Contexto limitado: ainda ha pouco dado associado a este seller.';

  return {
    summary: resolveDecisionSummary(input.priority.label),
    currentPriority: input.priority.label,
    apparentStability,
    pressure,
    availableContext,
    actionLabel: resolveActionLabel(input.priority.label),
    nextStep: input.priority.nextStep,
  };
}

function resolveLinkPriority(input: {
  stability: LinkStabilityLabel;
  unreadAlertCount: number;
  alertCount: number;
  reviewCount: number;
  scoreSurface: ScoreAlphaLabel;
}): PriorityReading {
  if (input.stability === 'possivelmente problematico' || input.unreadAlertCount > 0) {
    return {
      label: 'vale revisar primeiro',
      reading: 'Ha sinais problematicos ou alertas recentes. Vale revisar este link primeiro.',
      nextStep: 'Confira alertas e estabilidade antes de decidir a compra.',
    };
  }

  if (input.alertCount > 0) {
    return {
      label: 'sob mais pressao',
      reading: 'O link acumulou pressao de alertas e merece uma leitura mais cuidadosa.',
      nextStep: 'Compare com outro link ou acompanhe mudancas recentes.',
    };
  }

  if (input.scoreSurface === 'sinais fortes' && input.reviewCount > 0) {
    return {
      label: 'parece mais estavel',
      reading: 'Os sinais atuais parecem mais estaveis e ja existe algum contexto ligado a este link.',
      nextStep: 'Use este link como base inicial de revisao.',
    };
  }

  return {
    label: 'contexto limitado',
    reading: 'Ainda ha pouco contexto confiavel aqui. Cautela recomendada.',
    nextStep: 'Acompanhe o link ou compare com outro antes de priorizar.',
  };
}

function resolveSellerPriority(input: {
  problematicLinkedWatchCount: number;
  watchCount: number;
  reviewCount: number;
  scoreSurface: ScoreAlphaLabel;
  searchAttentionCount: number;
}): PriorityReading {
  if (input.problematicLinkedWatchCount > 0) {
    return {
      label: 'vale revisar primeiro',
      reading: 'Ha pressao de links problematicos ligados a este seller. Vale revisar primeiro.',
      nextStep: 'Revise os links ligados ao seller antes de priorizar compra.',
    };
  }

  if (input.watchCount >= 3 || input.searchAttentionCount >= 2) {
    return {
      label: 'sob mais pressao',
      reading: 'Este seller recebe mais atencao recente dentro do ChinaLab.',
      nextStep: 'Se fizer sentido, acompanhe o seller ou compare com outro.',
    };
  }

  if (input.scoreSurface === 'sinais fortes' && input.reviewCount > 0) {
    return {
      label: 'parece mais estavel',
      reading: 'O seller parece mais estavel pelos sinais atuais e ja tem algum contexto ligado.',
      nextStep: 'Use este seller como referencia inicial antes de comparar alternativas.',
    };
  }

  return {
    label: 'contexto limitado',
    reading: 'Ha pouco contexto confiavel sobre este seller por enquanto.',
    nextStep: 'Trate com cautela e compare com outro seller antes de decidir.',
  };
}

export async function buildLinkSignalSet(rawLink: string): Promise<LinkSignalSet> {
  const normalizedLink = normalizeLink(rawLink);

  const [watchStats, lastWatchState, notifications, communityEvidence] = await Promise.all([
    prisma.watchSubscription.aggregate({
      where: {
        targetType: WATCH_TARGET_TYPE_LINK,
        targetKey: normalizedLink,
      },
      _count: {
        _all: true,
        lastLinkCheckAt: true,
      },
      _max: {
        lastLinkCheckAt: true,
        lastLinkStatusChangedAt: true,
      },
    }),
    prisma.watchSubscription.findMany({
      where: {
        targetType: WATCH_TARGET_TYPE_LINK,
        targetKey: normalizedLink,
      },
      select: {
        lastLinkCheckStatus: true,
      },
    }),
    prisma.notificationEvent.findMany({
      where: {
        type: 'watchlist.link_problematic',
        payload: {
          contains: `"targetKey":"${normalizedLink}"`,
        },
      },
      select: {
        isRead: true,
      },
    }),
    getCommunityEvidence({
      targetType: 'link',
      target: normalizedLink,
    }),
  ]);

  const reviewCount = communityEvidence.reviewCount;
  const problematicCount = lastWatchState.filter(
    (watch) => watch.lastLinkCheckStatus === 'problematic',
  ).length;
  const okCount = lastWatchState.filter((watch) => watch.lastLinkCheckStatus === 'ok').length;
  const alertCount = notifications.length;
  const unreadAlertCount = notifications.filter((notification) => !notification.isRead).length;
  const watchCount = watchStats._count._all;
  const checkedCount = watchStats._count.lastLinkCheckAt;
  const attention = toSignalBucket(watchCount, 5, 2);
  const alertPressure = toSignalBucket(alertCount, 3, 1);
  const dataCoverage = toSignalBucket(checkedCount, 3, 1);

  return {
    normalizedLink,
    watchCount,
    checkedCount,
    problematicCount,
    okCount,
    alertCount,
    unreadAlertCount,
    lastCheckedAt: watchStats._max.lastLinkCheckAt,
    lastStatusChangedAt: watchStats._max.lastLinkStatusChangedAt,
    stability: resolveLinkStability(problematicCount, okCount),
    reviewCount,
    communityEvidence: {
      reviewCount: communityEvidence.reviewCount,
      averageRating: communityEvidence.averageRating,
      evidenceStrength: communityEvidence.evidenceStrength,
      reading: communityEvidence.reading,
    },
    priority: resolveLinkPriority({
      stability: resolveLinkStability(problematicCount, okCount),
      unreadAlertCount,
      alertCount,
      reviewCount,
      scoreSurface: resolveScoreAlphaSurface(attention, alertPressure, dataCoverage),
    }),
    decisionCard: buildLinkDecisionCard({
      stability: resolveLinkStability(problematicCount, okCount),
      unreadAlertCount,
      alertCount,
      checkedCount,
      reviewCount,
      scoreSurface: resolveScoreAlphaSurface(attention, alertPressure, dataCoverage),
      priority: resolveLinkPriority({
        stability: resolveLinkStability(problematicCount, okCount),
        unreadAlertCount,
        alertCount,
        reviewCount,
        scoreSurface: resolveScoreAlphaSurface(attention, alertPressure, dataCoverage),
      }),
    }),
    scoreAlpha: {
      attention,
      alertPressure,
      dataCoverage,
      surface: resolveScoreAlphaSurface(attention, alertPressure, dataCoverage),
      reading: buildScoreAlphaReading(resolveScoreAlphaSurface(attention, alertPressure, dataCoverage)),
    },
  };
}

export async function buildSellerSignalSet(rawSellerName: string): Promise<SellerSignalSet> {
  const seller = await getSellerByName(rawSellerName);
  const sellerKey = normalizeSellerKey(seller.sellerName);

  const [sellerWatchCount, allFinds, savedSearches] = await Promise.all([
    prisma.watchSubscription.count({
      where: {
        targetType: WATCH_TARGET_TYPE_SELLER,
        targetKey: sellerKey,
      },
    }),
    prisma.find.findMany({
      where: {
        seller: {
          not: null,
        },
      },
      select: {
        link: true,
        seller: true,
      },
    }),
    prisma.savedSearch.findMany({
      select: {
        query: true,
      },
    }),
  ]);

  const relatedFinds = allFinds.filter(
    (find) => find.seller && normalizeSellerKey(find.seller) === sellerKey,
  );

  const communityEvidence = await getCommunityEvidence({
    targetType: 'seller',
    target: seller.sellerName,
  });
  const reviewCount = communityEvidence.reviewCount;
  const relatedLinks = relatedFinds.map((find) => find.link);
  const problematicLinkedWatchCount = relatedLinks.length
    ? await prisma.watchSubscription.count({
        where: {
          targetType: WATCH_TARGET_TYPE_LINK,
          targetKey: {
            in: relatedLinks,
          },
          lastLinkCheckStatus: 'problematic',
        },
      })
    : 0;

  const searchAttentionCount = savedSearches.filter((entry) =>
    entry.query.toLocaleLowerCase().includes(sellerKey),
  ).length;

  const dataCoverageCount =
    (seller.averageRating > 0 ? 1 : 0) +
    (seller.commonIssues ? 1 : 0) +
    relatedFinds.length +
    sellerWatchCount;

  const attention = toSignalBucket(sellerWatchCount + searchAttentionCount, 5, 2);
  const alertPressure = toSignalBucket(problematicLinkedWatchCount, 2, 1);
  const dataCoverage = toSignalBucket(dataCoverageCount, 4, 2);

  return {
    sellerName: seller.sellerName,
    averageRating: seller.averageRating,
    hasIssueNotes: Boolean(seller.commonIssues),
    watchCount: sellerWatchCount,
    relatedFindCount: relatedFinds.length,
    problematicLinkedWatchCount,
    searchAttentionCount,
    dataCoverageCount,
    reviewCount,
    communityEvidence: {
      reviewCount: communityEvidence.reviewCount,
      averageRating: communityEvidence.averageRating,
      evidenceStrength: communityEvidence.evidenceStrength,
      reading: communityEvidence.reading,
    },
    priority: resolveSellerPriority({
      problematicLinkedWatchCount,
      watchCount: sellerWatchCount,
      reviewCount,
      scoreSurface: resolveScoreAlphaSurface(attention, alertPressure, dataCoverage),
      searchAttentionCount,
    }),
    decisionCard: buildSellerDecisionCard({
      problematicLinkedWatchCount,
      watchCount: sellerWatchCount,
      relatedFindCount: relatedFinds.length,
      reviewCount,
      searchAttentionCount,
      scoreSurface: resolveScoreAlphaSurface(attention, alertPressure, dataCoverage),
      priority: resolveSellerPriority({
        problematicLinkedWatchCount,
        watchCount: sellerWatchCount,
        reviewCount,
        scoreSurface: resolveScoreAlphaSurface(attention, alertPressure, dataCoverage),
        searchAttentionCount,
      }),
    }),
    scoreAlpha: {
      attention,
      alertPressure,
      dataCoverage,
      surface: resolveScoreAlphaSurface(attention, alertPressure, dataCoverage),
      reading: buildScoreAlphaReading(resolveScoreAlphaSurface(attention, alertPressure, dataCoverage)),
    },
  };
}

export async function compareLinks(linkA: string, linkB: string): Promise<LinkComparisonResult> {
  const [left, right] = await Promise.all([
    buildLinkSignalSet(linkA),
    buildLinkSignalSet(linkB),
  ]);

  const recommendation = buildLinkRecommendation(left, right);

  return {
    left,
    right,
    recommendation: recommendation.recommendation,
    reviewFirst: recommendation.reviewFirst,
    nextStep: recommendation.nextStep,
  };
}

export async function compareSellers(
  sellerA: string,
  sellerB: string,
): Promise<SellerComparisonResult> {
  const [left, right] = await Promise.all([
    buildSellerSignalSet(sellerA),
    buildSellerSignalSet(sellerB),
  ]);

  const recommendation = buildSellerRecommendation(left, right);

  return {
    left,
    right,
    recommendation: recommendation.recommendation,
    reviewFirst: recommendation.reviewFirst,
    nextStep: recommendation.nextStep,
  };
}

export async function getTrendingAlpha(): Promise<TrendingAlphaResult> {
  const [searches, watchedSellers, watchedLinks] = await Promise.all([
    prisma.savedSearch.groupBy({
      by: ['query'],
      _count: { _all: true },
      orderBy: { _count: { query: 'desc' } },
      take: 5,
    }),
    prisma.watchSubscription.groupBy({
      by: ['targetKey'],
      where: { targetType: WATCH_TARGET_TYPE_SELLER },
      _count: { _all: true },
      orderBy: { _count: { targetKey: 'desc' } },
      take: 5,
    }),
    prisma.watchSubscription.findMany({
      where: { targetType: WATCH_TARGET_TYPE_LINK },
      select: { targetKey: true, lastLinkCheckStatus: true },
    }),
  ]);

  const sellerSignals = await Promise.all(
    watchedSellers.map(async (entry) => {
      try {
        const signals = await buildSellerSignalSet(entry.targetKey);
        return {
          seller: signals.sellerName,
          watches: entry._count._all,
          relatedFinds: signals.relatedFindCount,
          scoreSurface: signals.scoreAlpha.surface,
          summary: signals.decisionCard.summary,
          communityEvidence: signals.communityEvidence,
          nextStep: signals.decisionCard.nextStep,
        };
      } catch {
        return {
          seller: entry.targetKey,
          watches: entry._count._all,
          relatedFinds: 0,
          scoreSurface: 'sinais limitados' as ScoreAlphaLabel,
          summary: 'contexto insuficiente' as DecisionSummaryLabel,
          communityEvidence: {
            reviewCount: 0,
            averageRating: null,
            evidenceStrength: 'limitada' as const,
            reading: 'Pouca evidencia comunitaria disponivel.',
          },
          nextStep: 'Compare com outro seller antes de priorizar.',
        };
      }
    }),
  );

  const hostPressure = new Map<string, number>();

  watchedLinks.forEach((watch) => {
    if (watch.lastLinkCheckStatus !== 'problematic') {
      return;
    }

    const host = extractHost(watch.targetKey);
    hostPressure.set(host, (hostPressure.get(host) ?? 0) + 1);
  });

  const pressuredHosts = Array.from(hostPressure.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([host, problematicLinks]) => ({ host, problematicLinks }));

  const worthReviewing: TrendingReviewEntry[] = [];
  const worthFollowing: TrendingReviewEntry[] = [];
  const limitedContext: TrendingReviewEntry[] = [];
  const prioritySummary: TrendingPrioritySummary = {
    reviewNow: 0,
    follow: 0,
    caution: 0,
    limitedContext: 0,
  };

  pressuredHosts.slice(0, 3).forEach((entry) => {
      worthReviewing.push({
        label: entry.host,
        summary: 'revisar agora',
        bucket: 'vale revisar primeiro',
        reason: labelReviewReason(entry.host, entry.problematicLinks),
        nextStep: 'Checar novamente os links desse host e revisar alertas antes de comprar.',
      });
  });

  sellerSignals
    .filter((entry) => entry.summary === 'cautela')
    .slice(0, 2)
    .forEach((entry) => {
      worthReviewing.push({
        label: entry.seller,
        summary: 'cautela',
        bucket: 'sob mais pressao',
        reason: `${entry.seller} esta em alta no ChinaLab e ja tem algum contexto util para revisao.`,
        nextStep: entry.nextStep,
      });
    });

  sellerSignals
    .filter((entry) => entry.summary === 'acompanhar')
    .slice(0, 3)
    .forEach((entry) => {
      worthFollowing.push({
        label: entry.seller,
        summary: 'acompanhar',
        bucket: 'parece mais estavel',
        reason: `${entry.seller} parece mais estavel pelos sinais atuais e segue recebendo atencao no ChinaLab.`,
        nextStep: entry.nextStep,
      });
    });

  sellerSignals
    .filter((entry) => entry.summary === 'contexto insuficiente')
    .slice(0, 3)
    .forEach((entry) => {
      limitedContext.push({
        label: entry.seller,
        summary: 'contexto insuficiente',
        bucket: 'contexto limitado',
        reason: `${entry.seller} ainda tem pouco contexto util. Vale comparar antes de confiar demais.`,
        nextStep: entry.nextStep,
      });
    });

  [...worthReviewing, ...worthFollowing, ...limitedContext].forEach((entry) => {
    if (entry.summary === 'revisar agora') {
      prioritySummary.reviewNow += 1;
      return;
    }

    if (entry.summary === 'cautela') {
      prioritySummary.caution += 1;
      return;
    }

    if (entry.summary === 'acompanhar') {
      prioritySummary.follow += 1;
      return;
    }

    prioritySummary.limitedContext += 1;
  });

  let recommendation =
    'O sinal ainda e inicial. Vale revisar primeiro buscas repetidas, sellers mais acompanhados e hosts sob pressao.';

  if (pressuredHosts.length > 0) {
    recommendation =
      'Hosts com mais links problematicos merecem revisao primeiro. Eles concentram mais pressao agora.';
  } else if (sellerSignals.length > 0) {
    recommendation =
      'Os sellers mais acompanhados no ChinaLab merecem revisao primeiro. Eles concentram mais atencao recente.';
  } else if (searches.length > 0) {
    recommendation =
      'As buscas salvas mais repetidas estao em alta no ChinaLab e valem acompanhamento primeiro.';
  }

  return {
    topSearches: searches.map((entry) => ({
      query: entry.query,
      saves: entry._count._all,
    })),
    topWatchedSellers: sellerSignals,
    pressuredHosts,
    worthReviewing: worthReviewing.slice(0, 5),
    worthFollowing: worthFollowing.slice(0, 5),
    limitedContext: limitedContext.slice(0, 5),
    prioritySummary,
    recommendation,
  };
}
