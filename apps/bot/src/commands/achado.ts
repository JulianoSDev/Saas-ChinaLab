import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ChatInputCommandInteraction,
} from 'discord.js';
import { getFindById, recordFindClick } from '@chinalab/services';
import NodeCache from 'node-cache';

const cooldown = new NodeCache({ stdTTL: 5 });

const COLOR = 0xF4A42C;
const COLOR_ERROR = 0xED4245;
const FOOTER = { text: 'ChinaLab | Achados da comunidade' };

const CATEGORY_LABELS: Record<string, string> = {
  tenis: 'Tenis',
  roupas: 'Roupas',
  acessorios: 'Acessorios',
  eletronicos: 'Eletronicos',
  utilidades: 'Utilidades',
};

function affiliateUrl(link: string): string {
  const code = process.env.AFFILIATE_CODE || '';
  const encoded = encodeURIComponent(link);
  const base = `https://www.hubbuycn.com/product/item?url=${encoded}`;
  return code ? `${base}&invitation_code=${code}` : base;
}

export const achadoCommand = {
  data: new SlashCommandBuilder()
    .setName('achado')
    .setDescription('Ver detalhes de um achado especifico')
    .addIntegerOption((opt) =>
      opt.setName('id').setDescription('ID do achado').setRequired(true).setMinValue(1)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const id = interaction.options.getInteger('id', true);

    if (cooldown.has(userId)) {
      return interaction.reply({
        content: 'Aguarde alguns segundos.',
        flags: [MessageFlags.Ephemeral],
      });
    }
    cooldown.set(userId, true);

    await interaction.deferReply();

    try {
      const find = await getFindById(id);
      await recordFindClick(id);

      const category = CATEGORY_LABELS[find.category] ?? find.category;

      const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setTitle(find.name)
        .addFields(
          { name: 'Preco', value: `\`Y${find.price.toFixed(2)}\``, inline: true },
          { name: 'Categoria', value: category, inline: true },
          { name: 'Seller', value: `\`${find.seller ?? 'Nao informado'}\``, inline: true },
        )
        .setFooter(FOOTER)
        .setTimestamp();

      if (find.imageUrl) {
        embed.setImage(find.imageUrl);
      }

      const components = find.link
        ? [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setLabel('Comprar via HubbuyCN')
                .setEmoji('🛒')
                .setStyle(ButtonStyle.Link)
                .setURL(affiliateUrl(find.link)),
            ),
          ]
        : [];

      await interaction.editReply({ embeds: [embed], components });
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
