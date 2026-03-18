import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ChatInputCommandInteraction,
} from 'discord.js';
import { buildSellerSignalSet, getSellerByName } from '@chinalab/services';
import { AppError } from '@chinalab/utils';
import NodeCache from 'node-cache';

const cooldown = new NodeCache({ stdTTL: 5 });

const COLOR = 0xF4A42C;
const COLOR_ERROR = 0xED4245;
const FOOTER = { text: 'ChinaLab | Base interna da comunidade' };

function formatCommonIssues(commonIssues: string | null): string {
  const normalized = commonIssues?.trim();
  return normalized && normalized.length > 0 ? normalized : 'Nenhum problema comum registrado.';
}

function buildErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }

  return 'Nao foi possivel consultar esse vendedor agora.';
}

export const vendedorCommand = {
  data: new SlashCommandBuilder()
    .setName('vendedor')
    .setDescription('Consulta um vendedor na base interna do ChinaLab')
    .addStringOption((opt) =>
      opt.setName('nome').setDescription('Nome do vendedor').setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const sellerName = interaction.options.getString('nome', true);

    if (cooldown.has(userId)) {
      return interaction.reply({
        content: 'Aguarde alguns segundos.',
        flags: [MessageFlags.Ephemeral],
      });
    }
    cooldown.set(userId, true);

    await interaction.deferReply();

    try {
      const [seller, signals] = await Promise.all([
        getSellerByName(sellerName),
        buildSellerSignalSet(sellerName),
      ]);

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR)
            .setTitle(`Vendedor | ${seller.sellerName}`)
            .setDescription('Consulta na base interna do ChinaLab/comunidade.')
            .addFields(
              {
                name: 'Card de decisao',
                value: [
                  `Resumo: \`${signals.decisionCard.summary}\``,
                  `Prioridade atual: \`${signals.decisionCard.currentPriority}\``,
                  `Alpha: \`${signals.scoreAlpha.surface}\` - ${signals.scoreAlpha.reading}`,
                  `Estabilidade aparente: ${signals.decisionCard.apparentStability}`,
                  `Pressao / alertas: ${signals.decisionCard.pressure}`,
                  `Contexto disponivel: ${signals.decisionCard.availableContext}`,
                  `Evidencia comunitaria: ${signals.communityEvidence.reading}`,
                  `Acao sugerida: \`${signals.decisionCard.actionLabel}\``,
                  `Proximo passo: ${signals.decisionCard.nextStep}`,
                ].join('\n'),
                inline: false,
              },
              { name: 'Media de rating', value: seller.averageRating.toFixed(2), inline: true },
              { name: 'Watches', value: String(signals.watchCount), inline: true },
              { name: 'Achados ligados', value: String(signals.relatedFindCount), inline: true },
              { name: 'Reviews ligadas', value: String(signals.reviewCount), inline: true },
              {
                name: 'Evidencia comunitaria',
                value: `${signals.communityEvidence.reviewCount} review(s) | ${signals.communityEvidence.evidenceStrength}${signals.communityEvidence.averageRating ? ` | ${signals.communityEvidence.averageRating.toFixed(1)}/5` : ''}`,
                inline: false,
              },
              { name: 'Pressao de links', value: String(signals.problematicLinkedWatchCount), inline: true },
              { name: 'Atencao recente', value: String(signals.searchAttentionCount), inline: true },
              { name: 'Problemas comuns', value: formatCommonIssues(seller.commonIssues), inline: false },
              {
                name: 'Leitura rapida',
                value: `${signals.priority.reading}\nAtalho util: \`/comparar seller\`${signals.communityEvidence.reviewCount < 2 ? ' | Pouca evidencia comunitaria: adicione uma review em `/review adicionar-seller` se voce ja comprou.' : ' | Ver reviews: `/review ver-seller`'}`,
                inline: false,
              },
            )
            .setFooter(FOOTER)
            .setTimestamp(),
        ],
      });
    } catch (err) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setDescription(buildErrorMessage(err))
            .setFooter(FOOTER)
            .setTimestamp(),
        ],
      });
    }
  },
};
