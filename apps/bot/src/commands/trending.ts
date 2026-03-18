import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ChatInputCommandInteraction,
} from 'discord.js';
import {
  getTrendingAlpha,
  type TrendingAlphaResult,
  type TrendingPressureHostEntry,
  type TrendingReviewEntry,
  type TrendingSellerEntry,
} from '@chinalab/services';
import { AppError } from '@chinalab/utils';
import NodeCache from 'node-cache';

const cooldown = new NodeCache({ stdTTL: 10 });

const COLOR = 0xF4A42C;
const COLOR_ERROR = 0xED4245;
const FOOTER = { text: 'ChinaLab | Trending alpha' };

function buildErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }

  return 'Nao foi possivel montar o trending agora.';
}

function renderTrending(trending: TrendingAlphaResult): string {
  const sections = [
    [
      '**Resumo de prioridade**',
      `- Revisar agora: ${trending.prioritySummary.reviewNow}`,
      `- Acompanhar: ${trending.prioritySummary.follow}`,
      `- Cautela: ${trending.prioritySummary.caution}`,
      `- Contexto insuficiente: ${trending.prioritySummary.limitedContext}`,
    ].join('\n'),
    trending.topSearches.length
      ? [
          '**Buscas em alta no ChinaLab**',
          ...trending.topSearches.map((entry) => `- ${entry.query} (${entry.saves})`),
        ].join('\n')
      : '**Buscas em alta no ChinaLab**\n- Ainda sem sinal suficiente',
    trending.topWatchedSellers.length
      ? [
          '**Sellers mais observados**',
          ...trending.topWatchedSellers.map(
            (entry: TrendingSellerEntry) =>
              `- ${entry.seller} (${entry.watches}) | ${entry.scoreSurface} | ${entry.summary} | evidencia ${entry.communityEvidence.evidenceStrength}${entry.communityEvidence.averageRating ? ` (${entry.communityEvidence.averageRating.toFixed(1)}/5)` : ''} | Proximo passo: ${entry.nextStep}`,
          ),
        ].join('\n')
      : '**Sellers mais observados**\n- Ainda sem sinal suficiente',
    trending.pressuredHosts.length
      ? [
          '**Hosts sob mais pressao**',
          ...trending.pressuredHosts.map(
            (entry: TrendingPressureHostEntry) =>
              `- ${entry.host} (${entry.problematicLinks} links problematicos) | cautela`,
          ),
        ].join('\n')
      : '**Hosts sob mais pressao**\n- Ainda sem sinal suficiente',
    trending.worthReviewing.length
      ? [
          '**Fila inicial de revisao**',
          ...trending.worthReviewing.map(
            (entry: TrendingReviewEntry) =>
              `- ${entry.label} | ${entry.summary} (${entry.bucket}): ${entry.reason} Proximo passo: ${entry.nextStep}`,
          ),
        ].join('\n')
      : '**Fila inicial de revisao**\n- Ainda sem sinal suficiente',
    trending.worthFollowing.length
      ? [
          '**Vale acompanhar**',
          ...trending.worthFollowing.map(
            (entry: TrendingReviewEntry) =>
              `- ${entry.label} | ${entry.summary}: ${entry.reason} Proximo passo: ${entry.nextStep}`,
          ),
        ].join('\n')
      : '**Vale acompanhar**\n- Ainda sem sinal suficiente',
    trending.limitedContext.length
      ? [
          '**Contexto mais fraco**',
          ...trending.limitedContext.map(
            (entry: TrendingReviewEntry) =>
              `- ${entry.label} | ${entry.summary}: ${entry.reason} Proximo passo: ${entry.nextStep}`,
          ),
        ].join('\n')
      : '**Contexto mais fraco**\n- Ainda sem sinal suficiente',
    `**Leitura pratica**\n${trending.recommendation}\nUse a fila de revisao para agir agora e os blocos de sellers/hosts para decidir o que acompanhar com mais cautela.`,
    trending.topWatchedSellers.some((entry) => entry.communityEvidence.reviewCount < 2)
      ? '**Contexto comunitario**\n- Alguns sinais estao em alta com pouca evidencia comunitaria. Se voce ja comprou, use `/review` para melhorar esse contexto.'
      : '**Contexto comunitario**\n- Ja existe alguma evidencia comunitaria util nos sellers mais observados.',
  ];

  return sections.join('\n\n');
}

export const trendingCommand = {
  data: new SlashCommandBuilder()
    .setName('trending')
    .setDescription('Ver o que esta ganhando atencao dentro do ChinaLab'),

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;

    if (cooldown.has(userId)) {
      return interaction.reply({
        content: 'Aguarde alguns segundos.',
        flags: [MessageFlags.Ephemeral],
      });
    }
    cooldown.set(userId, true);

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      const trending = await getTrendingAlpha();

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR)
            .setTitle('Trending alpha')
            .setDescription(renderTrending(trending))
            .setFooter(FOOTER)
            .setTimestamp(),
        ],
      });
    } catch (error) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setDescription(buildErrorMessage(error))
            .setFooter(FOOTER)
            .setTimestamp(),
        ],
      });
    }
  },
};
