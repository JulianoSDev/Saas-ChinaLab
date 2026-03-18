import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ChatInputCommandInteraction,
} from 'discord.js';
import { listNotifications, markNotificationAsRead } from '@chinalab/services';
import { AppError } from '@chinalab/utils';
import NodeCache from 'node-cache';

const cooldown = new NodeCache({ stdTTL: 5 });

const COLOR = 0xF4A42C;
const COLOR_ERROR = 0xED4245;
const FOOTER = { text: 'ChinaLab | Notificacoes pessoais' };

function buildErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }

  return 'Nao foi possivel processar suas notificacoes agora.';
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

export const notificacoesCommand = {
  data: new SlashCommandBuilder()
    .setName('notificacoes')
    .setDescription('Veja e marque suas notificacoes internas do ChinaLab')
    .addSubcommand((sub) =>
      sub.setName('ver').setDescription('Ver suas notificacoes recentes')
    )
    .addSubcommand((sub) =>
      sub
        .setName('ler')
        .setDescription('Marcar uma notificacao como lida')
        .addIntegerOption((opt) =>
          opt.setName('id').setDescription('ID da notificacao').setRequired(true).setMinValue(1)
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
      switch (subcommand) {
        case 'ver': {
          const notifications = await listNotifications(userId, 10);

          if (!notifications.length) {
            await interaction.editReply({
              embeds: [
                new EmbedBuilder()
                  .setColor(COLOR)
                  .setTitle('Sem notificacoes')
                  .setDescription('Voce ainda nao tem notificacoes internas para revisar.')
                  .setFooter(FOOTER)
                  .setTimestamp(),
              ],
            });
            break;
          }

          const lines = notifications.map((notification) => {
            const state = notification.isRead ? 'Lida' : 'Nao lida';
            return [
              `\`#${notification.id}\` ${state}`,
              `**${notification.title}**`,
              `${notification.message}`,
              `Criada em ${formatDate(notification.createdAt)}`,
            ].join('\n');
          });

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(COLOR)
                .setTitle('Suas notificacoes')
                .setDescription(lines.join('\n\n'))
                .setFooter({ text: 'Use /notificacoes ler id:N para marcar como lida' })
                .setTimestamp(),
            ],
          });
          break;
        }

        case 'ler': {
          const notification = await markNotificationAsRead(
            userId,
            interaction.options.getInteger('id', true),
          );

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(COLOR)
                .setTitle('Notificacao marcada como lida')
                .setDescription(`\`#${notification.id}\` ${notification.title}`)
                .setFooter(FOOTER)
                .setTimestamp(),
            ],
          });
          break;
        }
      }
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
