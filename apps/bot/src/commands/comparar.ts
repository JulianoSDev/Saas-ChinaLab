import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ChatInputCommandInteraction,
} from 'discord.js';
import {
  compareLinks,
  compareSellers,
  type LinkSignalSet,
  type SellerSignalSet,
} from '@chinalab/services';
import { AppError } from '@chinalab/utils';
import NodeCache from 'node-cache';

const cooldown = new NodeCache({ stdTTL: 5 });

const COLOR = 0xF4A42C;
const COLOR_ERROR = 0xED4245;
const FOOTER = { text: 'ChinaLab | Comparacao explicavel' };

function buildErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }

  return 'Nao foi possivel comparar esses dados agora.';
}

function formatDate(date: Date | null): string {
  if (!date) {
    return 'Sem dado';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

function renderLinkSignals(label: string, signals: LinkSignalSet): string {
  return [
    `**${label}**`,
    `Resumo: ${signals.decisionCard.summary}`,
    `Prioridade atual: ${signals.decisionCard.currentPriority}`,
    `Alpha: ${signals.scoreAlpha.surface} - ${signals.scoreAlpha.reading}`,
    `Status: ${signals.stability}`,
    `Estabilidade aparente: ${signals.decisionCard.apparentStability}`,
    `Pressao / alertas: ${signals.decisionCard.pressure}`,
    `Contexto disponivel: ${signals.decisionCard.availableContext}`,
    `Acao sugerida: ${signals.decisionCard.actionLabel}`,
    `Watches: ${signals.watchCount}`,
    `Alertas: ${signals.alertCount} (${signals.unreadAlertCount} nao lidos)`,
    `Reviews ligadas: ${signals.reviewCount}`,
    `Evidencia comunitaria: ${signals.communityEvidence.evidenceStrength}${signals.communityEvidence.averageRating ? ` | ${signals.communityEvidence.averageRating.toFixed(1)}/5` : ''}`,
    `Checks conhecidos: ${signals.checkedCount}`,
    `Ultima checagem: ${formatDate(signals.lastCheckedAt)}`,
    `Ultima mudanca: ${formatDate(signals.lastStatusChangedAt)}`,
  ].join('\n');
}

function renderSellerSignals(label: string, signals: SellerSignalSet): string {
  return [
    `**${label}**`,
    `Resumo: ${signals.decisionCard.summary}`,
    `Prioridade atual: ${signals.decisionCard.currentPriority}`,
    `Alpha: ${signals.scoreAlpha.surface} - ${signals.scoreAlpha.reading}`,
    `Estabilidade aparente: ${signals.decisionCard.apparentStability}`,
    `Pressao / alertas: ${signals.decisionCard.pressure}`,
    `Contexto disponivel: ${signals.decisionCard.availableContext}`,
    `Acao sugerida: ${signals.decisionCard.actionLabel}`,
    `Rating medio conhecido: ${signals.averageRating.toFixed(1)}`,
    `Watches do seller: ${signals.watchCount}`,
    `Achados ligados: ${signals.relatedFindCount}`,
    `Reviews ligadas: ${signals.reviewCount}`,
    `Evidencia comunitaria: ${signals.communityEvidence.evidenceStrength}${signals.communityEvidence.averageRating ? ` | ${signals.communityEvidence.averageRating.toFixed(1)}/5` : ''}`,
    `Pressao de links problematicos: ${signals.problematicLinkedWatchCount}`,
    `Atencao em buscas: ${signals.searchAttentionCount}`,
    `Notas de problema conhecidas: ${signals.hasIssueNotes ? 'Sim' : 'Nao'}`,
  ].join('\n');
}

export const compararCommand = {
  data: new SlashCommandBuilder()
    .setName('comparar')
    .setDescription('Comparar sinais explicaveis do ChinaLab')
    .addSubcommand((sub) =>
      sub
        .setName('link')
        .setDescription('Comparar dois links pelo que o ChinaLab ja conhece')
        .addStringOption((opt) =>
          opt.setName('a').setDescription('Primeiro link').setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('b').setDescription('Segundo link').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('seller')
        .setDescription('Comparar dois sellers pelos sinais atuais do ChinaLab')
        .addStringOption((opt) =>
          opt.setName('a').setDescription('Primeiro seller').setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('b').setDescription('Segundo seller').setRequired(true)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const subcommand = interaction.options.getSubcommand();

    if (cooldown.has(userId)) {
      return interaction.reply({
        content: 'Aguarde alguns segundos.',
        flags: [MessageFlags.Ephemeral],
      });
    }
    cooldown.set(userId, true);

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      if (subcommand === 'link') {
        const result = await compareLinks(
          interaction.options.getString('a', true),
          interaction.options.getString('b', true),
        );

        const reviewFirst =
          result.reviewFirst === 'a'
            ? 'Vale revisar primeiro: **link A**'
            : result.reviewFirst === 'b'
              ? 'Vale revisar primeiro: **link B**'
              : 'Nenhum dos dois pede prioridade forte pelos sinais atuais';
        const choiceSupport =
          result.left.decisionCard.summary === result.right.decisionCard.summary
            ? 'Os dois lados pedem um tipo de leitura parecido; a diferenca esta no contexto e nos alertas.'
            : `Resumo rapido: link A = ${result.left.decisionCard.summary}; link B = ${result.right.decisionCard.summary}.`;
        const communitySupport =
          result.left.communityEvidence.reviewCount === result.right.communityEvidence.reviewCount
            ? 'Os dois links tem nivel parecido de evidencia comunitaria.'
            : result.left.communityEvidence.reviewCount > result.right.communityEvidence.reviewCount
              ? 'O link A tem evidencia comunitaria um pouco melhor.'
              : 'O link B tem evidencia comunitaria um pouco melhor.';

        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(COLOR)
              .setTitle('Comparacao de links')
              .setDescription([
                renderLinkSignals('Link A', result.left),
                '',
                renderLinkSignals('Link B', result.right),
                '',
                `**Leitura pratica**\n${choiceSupport}\n${communitySupport}\n${result.recommendation}\n${reviewFirst}\nProximo passo: ${result.nextStep}`,
                `Se for agir agora: ${result.reviewFirst === 'a' ? result.left.decisionCard.nextStep : result.reviewFirst === 'b' ? result.right.decisionCard.nextStep : 'compare o contexto manual e acompanhe o que tiver menos contexto confiavel.'}${result.left.communityEvidence.reviewCount + result.right.communityEvidence.reviewCount < 2 ? '\nPouca evidencia comunitaria: `/review adicionar-link` pode melhorar esse contexto.' : '\nSe quiser aprofundar: `/review ver-link`.'}`,
              ].join('\n'))
              .setFooter(FOOTER)
              .setTimestamp(),
          ],
        });
        return;
      }

      const result = await compareSellers(
        interaction.options.getString('a', true),
        interaction.options.getString('b', true),
      );

      const reviewFirst =
        result.reviewFirst === 'a'
          ? 'Vale revisar primeiro: **seller A**'
          : result.reviewFirst === 'b'
            ? 'Vale revisar primeiro: **seller B**'
            : 'Nenhum dos dois pede prioridade forte pelos sinais atuais';
      const choiceSupport =
        result.left.decisionCard.summary === result.right.decisionCard.summary
          ? 'Os dois sellers pedem um tipo de leitura parecido; a diferenca esta na pressao e no contexto conhecido.'
          : `Resumo rapido: seller A = ${result.left.decisionCard.summary}; seller B = ${result.right.decisionCard.summary}.`;
      const communitySupport =
        result.left.communityEvidence.reviewCount === result.right.communityEvidence.reviewCount
          ? 'Os dois sellers tem nivel parecido de evidencia comunitaria.'
          : result.left.communityEvidence.reviewCount > result.right.communityEvidence.reviewCount
            ? 'O seller A tem evidencia comunitaria um pouco melhor.'
            : 'O seller B tem evidencia comunitaria um pouco melhor.';

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR)
            .setTitle('Comparacao de sellers')
            .setDescription([
              renderSellerSignals('Seller A', result.left),
              '',
              renderSellerSignals('Seller B', result.right),
              '',
              `**Leitura pratica**\n${choiceSupport}\n${communitySupport}\n${result.recommendation}\n${reviewFirst}\nProximo passo: ${result.nextStep}`,
              `Se for agir agora: ${result.reviewFirst === 'a' ? result.left.decisionCard.nextStep : result.reviewFirst === 'b' ? result.right.decisionCard.nextStep : 'compare links concretos dos dois sellers antes de priorizar um deles.'}${result.left.communityEvidence.reviewCount + result.right.communityEvidence.reviewCount < 2 ? '\nPouca evidencia comunitaria: `/review adicionar-seller` pode melhorar esse contexto.' : '\nSe quiser aprofundar: `/review ver-seller`.'}`,
            ].join('\n'))
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
