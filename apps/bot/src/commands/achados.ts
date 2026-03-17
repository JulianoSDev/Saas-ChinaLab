import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ChatInputCommandInteraction,
} from 'discord.js';
import { listFinds } from '@chinalab/services';
import NodeCache from 'node-cache';

const cooldown = new NodeCache({ stdTTL: 5 });

const COLOR = 0xF4A42C;
const COLOR_ERROR = 0xED4245;
const FOOTER = { text: 'ChinaLab | Use /achado id:N para ver detalhes' };

const CATEGORY_LABELS: Record<string, string> = {
  tenis: 'Tenis',
  roupas: 'Roupas',
  acessorios: 'Acessorios',
  eletronicos: 'Eletronicos',
  utilidades: 'Utilidades',
};

export const achadosCommand = {
  data: new SlashCommandBuilder()
    .setName('achados')
    .setDescription('Lista os achados da China curados pelo ChinaLab')
    .addStringOption((opt) =>
      opt
        .setName('categoria')
        .setDescription('Filtrar por categoria')
        .setRequired(false)
        .addChoices(
          { name: 'Tenis', value: 'tenis' },
          { name: 'Roupas', value: 'roupas' },
          { name: 'Acessorios', value: 'acessorios' },
          { name: 'Eletronicos', value: 'eletronicos' },
          { name: 'Utilidades', value: 'utilidades' },
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const category = interaction.options.getString('categoria') ?? undefined;

    if (cooldown.has(userId)) {
      return interaction.reply({
        content: 'Aguarde alguns segundos.',
        flags: [MessageFlags.Ephemeral],
      });
    }
    cooldown.set(userId, true);

    await interaction.deferReply();

    try {
      const finds = await listFinds(category);

      if (finds.length === 0) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(COLOR)
              .setTitle('Achados')
              .setDescription(
                category
                  ? `Nenhum achado em ${CATEGORY_LABELS[category] ?? category} ainda.`
                  : 'Nenhum achado cadastrado ainda. Volte em breve.'
              )
              .setFooter(FOOTER)
              .setTimestamp(),
          ],
        });
        return;
      }

      const title = category
        ? `Achados | ${CATEGORY_LABELS[category] ?? category}`
        : 'Achados Recentes';

      const lines = finds
        .map((find) => {
          const seller = find.seller ? ` | ${find.seller}` : '';
          const categoryLabel = CATEGORY_LABELS[find.category] ?? find.category;
          return `\`#${find.id}\` **${find.name}**${seller} | \`Y${find.price.toFixed(2)}\` | ${categoryLabel}`;
        })
        .join('\n');

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR)
            .setTitle(title)
            .setDescription(lines)
            .setFooter({ text: 'ChinaLab | Use /achado id:N para ver detalhes e comprar' })
            .setTimestamp(),
        ],
      });
    } catch (err: any) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setDescription(`Erro: ${err.message}`)
            .setFooter(FOOTER)
            .setTimestamp(),
        ],
      });
    }
  },
};
