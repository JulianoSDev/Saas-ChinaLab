import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ChatInputCommandInteraction,
} from 'discord.js';
import {
  createHaul,
  getActiveHaul,
  addItem,
  removeItem,
  clearHaul,
  calcHaulTotals,
} from '@chinalab/services';
import NodeCache from 'node-cache';

const cooldown = new NodeCache({ stdTTL: 5 });

const COLOR       = 0xF4A42C;
const COLOR_ERROR = 0xED4245;
const FOOTER      = { text: 'ChinaLab • Ferramenta não oficial' };

function embed() {
  return new EmbedBuilder().setColor(COLOR).setFooter(FOOTER).setTimestamp();
}

function formatItem(i: number, price: number, weightGrams: number, seller?: string | null) {
  const s = seller ? ` · ${seller}` : '';
  return `**${i}.** 🏷️ \`Produto${s}\`\n↳ 💰 **¥${price.toFixed(2)}** | ⚖️ **${weightGrams}g**`;
}

export const haulCommand = {
  data: new SlashCommandBuilder()
    .setName('haul')
    .setDescription('Gerencie seu carrinho de importação')
    .addSubcommand(sub =>
      sub.setName('criar').setDescription('Cria um novo haul')
        .addStringOption(opt => opt.setName('nome').setDescription('Nome do haul').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('adicionar').setDescription('Adiciona um item ao haul')
        .addStringOption(opt => opt.setName('link').setDescription('Link do produto').setRequired(true))
        .addNumberOption(opt => opt.setName('preco').setDescription('Preço em ¥ CNY').setRequired(true).setMinValue(0.01))
        .addNumberOption(opt => opt.setName('peso').setDescription('Peso em gramas').setRequired(true).setMinValue(1))
        .addStringOption(opt => opt.setName('vendedor').setDescription('Nome do vendedor (opcional)').setRequired(false))
    )
    .addSubcommand(sub => sub.setName('ver').setDescription('Mostra seu haul atual'))
    .addSubcommand(sub =>
      sub.setName('remover').setDescription('Remove um item do haul')
        .addIntegerOption(opt => opt.setName('numero').setDescription('Número do item').setRequired(true).setMinValue(1))
    )
    .addSubcommand(sub => sub.setName('limpar').setDescription('Limpa o haul inteiro')),

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const sub    = interaction.options.getSubcommand();

    if (cooldown.has(userId)) {
      return interaction.reply({ content: 'Aguarde alguns segundos.', flags: [MessageFlags.Ephemeral] });
    }
    cooldown.set(userId, true);
    await interaction.deferReply();

    try {
      switch (sub) {

        case 'criar': {
          const nome = interaction.options.getString('nome', true);
          const haul = await createHaul(userId, nome);
          await interaction.editReply({
            embeds: [
              embed()
                .setTitle(`🛒 ${haul.name}`)
                .setDescription('Carrinho criado!\nUse `/haul adicionar` para incluir produtos.'),
            ],
          });
          break;
        }

        case 'adicionar': {
          const link     = interaction.options.getString('link', true);
          const preco    = interaction.options.getNumber('preco', true);
          const peso     = interaction.options.getNumber('peso', true);
          const vendedor = interaction.options.getString('vendedor') ?? undefined;

          await addItem(userId, { productLink: link, price: preco, weightGrams: peso, seller: vendedor });

          const haul   = await getActiveHaul(userId);
          const totals = calcHaulTotals(haul!.items);

          const url = link.startsWith('https://www.hubbuycn.com')
            ? link
            : `https://www.hubbuycn.com/product/item?url=${encodeURIComponent(link)}`;

          await interaction.editReply({
            embeds: [
              embed()
                .setTitle('🛒 Item adicionado!')
                .setDescription(formatItem(haul!.items.length, preco, peso, vendedor))
                .addFields(
                  { name: '💰 Total',   value: `\`¥${totals.totalPrice.toFixed(2)}\``,      inline: true },
                  { name: '⚖️ Peso',    value: `\`${totals.totalWeightKg.toFixed(2)}kg\``,  inline: true },
                  { name: '📦 Itens',   value: `\`${haul!.items.length}/20\``,              inline: true },
                ),
            ],
            components: [
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setLabel('Checkout HubbuyCN').setEmoji('🔗').setStyle(ButtonStyle.Link).setURL(url)
              ),
            ],
          });
          break;
        }

        case 'ver': {
          const haul = await getActiveHaul(userId);

          if (!haul || haul.items.length === 0) {
            await interaction.editReply({
              embeds: [embed().setTitle('🛒 Carrinho vazio').setDescription('Nenhum item.\nUse `/haul criar` para começar.')],
            });
            break;
          }

          const totals   = calcHaulTotals(haul.items);
          const itemList = haul.items
            .map((item, i) => formatItem(i + 1, item.price, item.weightGrams, item.seller))
            .join('\n\n');

          await interaction.editReply({
            embeds: [
              embed()
                .setTitle(`🛒 ${haul.name}`)
                .setDescription(itemList)
                .addFields(
                  { name: '💰 Total',  value: `\`¥${totals.totalPrice.toFixed(2)}\``,      inline: true },
                  { name: '⚖️ Peso',   value: `\`${totals.totalWeightKg.toFixed(2)}kg\``,  inline: true },
                  { name: '📦 Itens',  value: `\`${haul.items.length}/20\``,               inline: true },
                ),
            ],
            components: [
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`calcfrete_${userId}`).setLabel('Calcular Frete').setEmoji('✈️').setStyle(ButtonStyle.Primary)
              ),
            ],
          });
          break;
        }

        case 'remover': {
          const numero = interaction.options.getInteger('numero', true);
          await removeItem(userId, numero);
          await interaction.editReply({
            embeds: [embed().setTitle('🗑️ Item removido').setDescription(`Item **#${numero}** removido.`)],
          });
          break;
        }

        case 'limpar': {
          await clearHaul(userId);
          await interaction.editReply({
            embeds: [embed().setTitle('🗑️ Carrinho limpo').setDescription('Haul removido com sucesso.')],
          });
          break;
        }
      }

    } catch (err: any) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setDescription(`❌ ${err.message}`).setFooter(FOOTER).setTimestamp()],
      });
    }
  },
};
