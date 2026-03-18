import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ChatInputCommandInteraction,
} from 'discord.js';
import {
  addItemToWatchlist,
  addLinkToWatchlist,
  addSellerToWatchlist,
  getWatchTargetTypeLabel,
  getWatchStatusLabel,
  getWatchlistAlertSummary,
  listWatchlist,
  removeWatchFromList,
  runPassiveWatchlistLinkCheck,
  type WatchEntry,
} from '@chinalab/services';
import { AppError } from '@chinalab/utils';
import NodeCache from 'node-cache';

const cooldown = new NodeCache({ stdTTL: 5 });

const COLOR = 0xF4A42C;
const COLOR_ERROR = 0xED4245;
const FOOTER = { text: 'ChinaLab | Watchlist pessoal' };

function buildErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }

  return 'Nao foi possivel processar sua watchlist agora.';
}

export const watchlistCommand = {
  data: new SlashCommandBuilder()
    .setName('watchlist')
    .setDescription('Gerencie seus acompanhamentos no ChinaLab')
    .addSubcommand((sub) =>
      sub
        .setName('adicionar-item')
        .setDescription('Salvar um item do catalogo na sua watchlist')
        .addIntegerOption((opt) =>
          opt.setName('id').setDescription('ID do item salvo em /achado').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('adicionar-seller')
        .setDescription('Salvar um seller na sua watchlist')
        .addStringOption((opt) =>
          opt.setName('nome').setDescription('Nome do seller').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('adicionar-link')
        .setDescription('Salvar um link normalizado na sua watchlist')
        .addStringOption((opt) =>
          opt.setName('link').setDescription('URL completa para acompanhar').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('ver').setDescription('Ver sua watchlist atual')
    )
    .addSubcommand((sub) =>
      sub.setName('checar').setDescription('Checar os links acompanhados na sua watchlist')
    )
    .addSubcommand((sub) =>
      sub
        .setName('remover')
        .setDescription('Remover um acompanhamento da watchlist')
        .addIntegerOption((opt) =>
          opt.setName('id').setDescription('ID da watchlist').setRequired(true).setMinValue(1)
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
        case 'adicionar-item': {
          const watch = await addItemToWatchlist(
            userId,
            interaction.options.getInteger('id', true),
          );

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(COLOR)
                .setTitle('Watch adicionada')
                .setDescription(`${watch.displayLabel} foi salvo na sua watchlist.`)
                .setFooter(FOOTER)
                .setTimestamp(),
            ],
          });
          break;
        }

        case 'adicionar-seller': {
          const watch = await addSellerToWatchlist(
            userId,
            interaction.options.getString('nome', true),
          );

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(COLOR)
                .setTitle('Watch adicionada')
                .setDescription(`${watch.displayLabel} foi salvo na sua watchlist.`)
                .setFooter(FOOTER)
                .setTimestamp(),
            ],
          });
          break;
        }

        case 'adicionar-link': {
          const watch = await addLinkToWatchlist(
            userId,
            interaction.options.getString('link', true),
          );

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(COLOR)
                .setTitle('Watch adicionada')
                .setDescription('O link foi salvo na sua watchlist.')
                .setFooter(FOOTER)
                .setTimestamp(),
            ],
          });
          break;
        }

        case 'ver': {
          const [watches, summary] = await Promise.all([
            listWatchlist(userId),
            getWatchlistAlertSummary(userId),
          ]);

          if (!watches.length) {
            await interaction.editReply({
              embeds: [
                new EmbedBuilder()
                  .setColor(COLOR)
                  .setTitle('Watchlist vazia')
                  .setDescription('Use os subcomandos de adicionar para acompanhar item, seller ou link.')
                  .setFooter(FOOTER)
                  .setTimestamp(),
              ],
            });
            break;
          }

          const lines = watches
            .map((watch: WatchEntry) => {
              const parts = [
                `\`#${watch.id}\` ${getWatchTargetTypeLabel(watch.targetType)} | ${watch.displayLabel}`,
              ];

              if (watch.targetType === 'link') {
                parts.push(`Status: ${getWatchStatusLabel(watch)}`);

                if (watch.lastLinkCheckAt) {
                  const checkedAt = new Intl.DateTimeFormat('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    timeZone: 'America/Sao_Paulo',
                  }).format(watch.lastLinkCheckAt);
                  parts.push(`Ultima checagem: ${checkedAt}`);
                }

                if (watch.lastLinkStatusChangedAt) {
                  const changedAt = new Intl.DateTimeFormat('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    timeZone: 'America/Sao_Paulo',
                  }).format(watch.lastLinkStatusChangedAt);
                  parts.push(`Ultima mudanca de status: ${changedAt}`);
                }

                if (watch.lastLinkCheckStatus === 'problematic' && watch.lastLinkProblemReason) {
                  parts.push('Vale revisar');
                }
              }

              return parts.join('\n');
            })
            .join('\n');

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(COLOR)
                .setTitle('Sua watchlist')
                .setDescription([
                  `Resumo: ${summary.totalEntries} watches | ${summary.checkedLinks} links checados | ${summary.okLinks} OK | ${summary.problematicLinks} possivelmente problematicos | ${summary.unknownLinks} com status desconhecido | ${summary.unreadAlerts} alertas nao lidos`,
                  '',
                  lines,
                ].join('\n'))
                .setFooter({ text: 'Use /watchlist remover id:N para limpar um acompanhamento' })
                .setTimestamp(),
            ],
          });
          break;
        }

        case 'checar': {
          const summary = await runPassiveWatchlistLinkCheck(userId, 20);

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(COLOR)
                .setTitle('Checagem de links concluida')
                .setDescription([
                  `Links checados: **${summary.checkedCount}**`,
                  `OK: **${summary.okCount}**`,
                  `Possivelmente problematicos: **${summary.problematicCount}**`,
                  `Notificacoes geradas: **${summary.notificationsCreated}**`,
                ].join('\n'))
                .setFooter({ text: 'Se um link parecer problemático, vale revisar antes de comprar.' })
                .setTimestamp(),
            ],
          });
          break;
        }

        case 'remover': {
          const watch = await removeWatchFromList(
            userId,
            interaction.options.getInteger('id', true),
          );

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(COLOR)
                .setTitle('Watch removida')
                .setDescription(`${watch.displayLabel} saiu da sua watchlist.`)
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
