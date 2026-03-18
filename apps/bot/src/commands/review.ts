import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ChatInputCommandInteraction,
} from 'discord.js';
import {
  createReview,
  formatExperienceTag,
  getCommunityEvidence,
  listReviews,
  getContributionSummary,
} from '@chinalab/services';
import { AppError } from '@chinalab/utils';
import NodeCache from 'node-cache';

const cooldown = new NodeCache({ stdTTL: 5 });

const COLOR = 0xF4A42C;
const COLOR_ERROR = 0xED4245;
const FOOTER = { text: 'ChinaLab | Evidencia comunitaria' };

function buildErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }

  return 'Nao foi possivel processar essa review agora.';
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

function renderLatestReviews(
  reviews: Array<{
    id: number;
    rating: number;
    comment: string | null;
    experienceTag: string | null;
    createdAt: Date;
  }>,
): string {
  if (reviews.length === 0) {
    return 'Ainda nao ha reviews visiveis.';
  }

  return reviews
    .map(
      (review) =>
        `#${review.id} | ${review.rating}/5${review.experienceTag ? ` | ${formatExperienceTag(review.experienceTag)}` : ''} | ${formatDate(review.createdAt)}\n${review.comment ?? 'Sem comentario.'}`,
    )
    .join('\n\n');
}

export const reviewCommand = {
  data: new SlashCommandBuilder()
    .setName('review')
    .setDescription('Adicionar ou consultar evidencia comunitaria')
    .addSubcommand((sub) =>
      sub
        .setName('adicionar-seller')
        .setDescription('Adicionar review estruturada para um seller')
        .addStringOption((opt) => opt.setName('nome').setDescription('Nome do seller').setRequired(true))
        .addIntegerOption((opt) =>
          opt.setName('nota').setDescription('Nota de 1 a 5').setRequired(true).setMinValue(1).setMaxValue(5),
        )
        .addStringOption((opt) =>
          opt.setName('comentario').setDescription('Comentario curto e util').setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('tipo')
            .setDescription('Tipo de experiencia')
            .setRequired(false)
            .addChoices(
              { name: 'Boa', value: 'boa' },
              { name: 'Mista', value: 'mista' },
              { name: 'Ruim', value: 'ruim' },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('adicionar-link')
        .setDescription('Adicionar review estruturada para um link')
        .addStringOption((opt) => opt.setName('link').setDescription('Link completo').setRequired(true))
        .addIntegerOption((opt) =>
          opt.setName('nota').setDescription('Nota de 1 a 5').setRequired(true).setMinValue(1).setMaxValue(5),
        )
        .addStringOption((opt) =>
          opt.setName('comentario').setDescription('Comentario curto e util').setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('tipo')
            .setDescription('Tipo de experiencia')
            .setRequired(false)
            .addChoices(
              { name: 'Boa', value: 'boa' },
              { name: 'Mista', value: 'mista' },
              { name: 'Ruim', value: 'ruim' },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('ver-seller')
        .setDescription('Ver reviews conhecidas de um seller')
        .addStringOption((opt) => opt.setName('nome').setDescription('Nome do seller').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('ver-link')
        .setDescription('Ver reviews conhecidas de um link')
        .addStringOption((opt) => opt.setName('link').setDescription('Link completo').setRequired(true)),
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
      if (subcommand === 'adicionar-seller' || subcommand === 'adicionar-link') {
        const targetType = subcommand === 'adicionar-seller' ? 'seller' : 'link';
        const target =
          targetType === 'seller'
            ? interaction.options.getString('nome', true)
            : interaction.options.getString('link', true);

        const review = await createReview({
          discordId: interaction.user.id,
          targetType,
          target,
          rating: interaction.options.getInteger('nota', true),
          comment: interaction.options.getString('comentario', true),
          experienceTag: interaction.options.getString('tipo'),
        });
        const contribution = await getContributionSummary(interaction.user.id);

        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(COLOR)
              .setTitle('Review registrada')
              .setDescription('Sua contribuicao entrou como evidencia comunitaria estruturada do ChinaLab.')
              .addFields(
                { name: 'Review', value: `#${review.id}`, inline: true },
                { name: 'Nota', value: `${review.rating}/5`, inline: true },
                { name: 'Tipo', value: formatExperienceTag(review.experienceTag), inline: true },
                { name: 'Comentario', value: review.comment ?? 'Sem comentario.', inline: false },
                { name: 'Contribuicoes', value: `${contribution.createdReviewCount} review(s) registrada(s) por voce`, inline: false },
              )
              .setFooter(FOOTER)
              .setTimestamp(),
          ],
        });
        return;
      }

      const targetType = subcommand === 'ver-seller' ? 'seller' : 'link';
      const target =
        targetType === 'seller'
          ? interaction.options.getString('nome', true)
          : interaction.options.getString('link', true);

      const [evidence, reviews] = await Promise.all([
        getCommunityEvidence({ targetType, target }),
        listReviews({ targetType, target }),
      ]);

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR)
            .setTitle(targetType === 'seller' ? 'Reviews do seller' : 'Reviews do link')
            .setDescription(evidence.reading)
            .addFields(
              { name: 'Reviews conhecidas', value: String(evidence.reviewCount), inline: true },
              { name: 'Media simples', value: evidence.averageRating ? `${evidence.averageRating.toFixed(1)}/5` : 'Sem media ainda', inline: true },
              { name: 'Forca da evidencia', value: evidence.evidenceStrength, inline: true },
              { name: 'Ultimas reviews', value: renderLatestReviews(reviews), inline: false },
            )
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
