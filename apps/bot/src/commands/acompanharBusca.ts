import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ChatInputCommandInteraction,
} from 'discord.js';
import {
  addSavedSearch,
  listSavedSearches,
  removeSavedSearch,
  type SavedSearchEntry,
} from '@chinalab/services';
import { AppError } from '@chinalab/utils';
import NodeCache from 'node-cache';

const cooldown = new NodeCache({ stdTTL: 5 });

const COLOR = 0xF4A42C;
const COLOR_ERROR = 0xED4245;
const FOOTER = { text: 'ChinaLab | Buscas salvas' };

function buildErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }

  return 'Nao foi possivel processar suas buscas salvas agora.';
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

export const acompanharBuscaCommand = {
  data: new SlashCommandBuilder()
    .setName('acompanhar-busca')
    .setDescription('Salvar e revisar buscas recorrentes no ChinaLab')
    .addSubcommand((sub) =>
      sub
        .setName('adicionar')
        .setDescription('Salvar uma busca para lembrar depois')
        .addStringOption((opt) =>
          opt.setName('query').setDescription('Texto da busca').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('ver').setDescription('Ver suas buscas salvas')
    )
    .addSubcommand((sub) =>
      sub
        .setName('remover')
        .setDescription('Remover uma busca salva')
        .addIntegerOption((opt) =>
          opt.setName('id').setDescription('ID da busca salva').setRequired(true).setMinValue(1)
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
        case 'adicionar': {
          const savedSearch = await addSavedSearch(
            userId,
            interaction.options.getString('query', true),
          );

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(COLOR)
                .setTitle('Busca salva')
                .setDescription(`\`#${savedSearch.id}\` ${savedSearch.query}`)
                .setFooter(FOOTER)
                .setTimestamp(),
            ],
          });
          break;
        }

        case 'ver': {
          const searches = await listSavedSearches(userId);

          if (!searches.length) {
            await interaction.editReply({
              embeds: [
                new EmbedBuilder()
                  .setColor(COLOR)
                  .setTitle('Nenhuma busca salva')
                  .setDescription('Use /acompanhar-busca adicionar para guardar uma busca recorrente.')
                  .setFooter(FOOTER)
                  .setTimestamp(),
              ],
            });
            break;
          }

          const lines = searches.map((search: SavedSearchEntry) =>
            [`\`#${search.id}\` ${search.query}`, `Salva em ${formatDate(search.createdAt)}`].join('\n')
          );

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(COLOR)
                .setTitle('Suas buscas salvas')
                .setDescription(lines.join('\n\n'))
                .setFooter({ text: 'Use /acompanhar-busca remover id:N para limpar uma busca' })
                .setTimestamp(),
            ],
          });
          break;
        }

        case 'remover': {
          const savedSearch = await removeSavedSearch(
            userId,
            interaction.options.getInteger('id', true),
          );

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(COLOR)
                .setTitle('Busca removida')
                .setDescription(`\`#${savedSearch.id}\` ${savedSearch.query}`)
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
