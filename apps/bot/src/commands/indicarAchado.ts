import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ChatInputCommandInteraction,
} from 'discord.js';
import { createFindSuggestion } from '@chinalab/services';
import NodeCache from 'node-cache';

const cooldown = new NodeCache({ stdTTL: 30 });

const COLOR = 0xF4A42C;
const COLOR_ERROR = 0xED4245;
const FOOTER = { text: 'ChinaLab | Sugestoes sao revisadas pelos admins antes de publicar' };

export const indicarAchadoCommand = {
  data: new SlashCommandBuilder()
    .setName('indicar-achado')
    .setDescription('Indica um produto para o catalogo de achados')
    .addStringOption((opt) => opt.setName('nome').setDescription('Nome do produto').setRequired(true))
    .addStringOption((opt) => opt.setName('link').setDescription('Link do produto').setRequired(true))
    .addNumberOption((opt) =>
      opt.setName('preco').setDescription('Preco em CNY').setRequired(true).setMinValue(0.01)
    )
    .addStringOption((opt) =>
      opt
        .setName('categoria')
        .setDescription('Categoria do produto')
        .setRequired(true)
        .addChoices(
          { name: 'Tenis', value: 'tenis' },
          { name: 'Roupas', value: 'roupas' },
          { name: 'Acessorios', value: 'acessorios' },
          { name: 'Eletronicos', value: 'eletronicos' },
          { name: 'Utilidades', value: 'utilidades' },
        )
    )
    .addStringOption((opt) => opt.setName('seller').setDescription('Nome do vendedor').setRequired(false))
    .addStringOption((opt) => opt.setName('imagem').setDescription('URL da foto do produto').setRequired(false))
    .addStringOption((opt) => opt.setName('observacao').setDescription('Observacao sobre o produto').setRequired(false)),

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;

    if (cooldown.has(userId)) {
      return interaction.reply({
        content: 'Aguarde 30 segundos antes de enviar outra sugestao.',
        flags: [MessageFlags.Ephemeral],
      });
    }
    cooldown.set(userId, true);

    const nome = interaction.options.getString('nome', true);
    const link = interaction.options.getString('link', true);
    const preco = interaction.options.getNumber('preco', true);
    const categoria = interaction.options.getString('categoria', true);
    const seller = interaction.options.getString('seller') ?? undefined;
    const imageUrl = interaction.options.getString('imagem') ?? undefined;
    const notes = interaction.options.getString('observacao') ?? undefined;

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      await createFindSuggestion({
        discordId: userId,
        username: interaction.user.username,
        name: nome,
        link,
        price: preco,
        category: categoria,
        seller,
        imageUrl,
        notes,
      });

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR)
            .setTitle('Sugestao enviada')
            .setDescription(
              `Obrigado pela indicacao de **${nome}**.\n\nSua sugestao sera revisada pelos admins antes de entrar no catalogo.`
            )
            .addFields(
              { name: 'Produto', value: `\`${nome}\``, inline: true },
              { name: 'Preco', value: `\`Y${preco.toFixed(2)}\``, inline: true },
              { name: 'Categoria', value: `\`${categoria}\``, inline: true },
            )
            .setFooter(FOOTER)
            .setTimestamp(),
        ],
      });

      const adminChannelId = process.env.ADMIN_CHANNEL_ID;
      if (adminChannelId) {
        const channel = interaction.client.channels.cache.get(adminChannelId);
        if (channel?.isTextBased()) {
          await (channel as any).send({
            embeds: [
              new EmbedBuilder()
                .setColor(0xFEE75C)
                .setTitle('Nova sugestao de achado')
                .setDescription(`Enviada por **${interaction.user.username}**`)
                .addFields(
                  { name: 'Produto', value: `\`${nome}\``, inline: true },
                  { name: 'Preco', value: `\`Y${preco.toFixed(2)}\``, inline: true },
                  { name: 'Categoria', value: `\`${categoria}\``, inline: true },
                  { name: 'Link', value: link, inline: false },
                  ...(notes ? [{ name: 'Observacao', value: notes, inline: false }] : []),
                )
                .setFooter({ text: 'Use /admin_achados revisar para ver as pendencias' })
                .setTimestamp(),
            ],
          });
        }
      }
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
