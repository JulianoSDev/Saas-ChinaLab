import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ChatInputCommandInteraction,
} from 'discord.js';
import { estimateCost } from '@chinalab/services';
import NodeCache from 'node-cache';

const cooldown = new NodeCache({ stdTTL: 5 });

const COLOR       = 0xF4A42C;
const COLOR_ERROR = 0xED4245;
const FOOTER      = { text: 'ChinaLab • Estimativa não oficial · Valores sujeitos a variação' };

function embed() {
  return new EmbedBuilder().setColor(COLOR).setFooter(FOOTER).setTimestamp();
}

function confidenceLabel(c: 'high' | 'medium' | 'low'): string {
  if (c === 'high')   return '🟢 Alta — taxa ao vivo da HubbuyCN';
  if (c === 'medium') return '🟡 Média — cache (até 24h)';
  return '🔴 Baixa — fallback manual';
}

function sourceLabel(s: string): string {
  if (s === 'hubbuy_recharge_live') return 'HubbuyCN (tempo real)';
  if (s === 'cached_last_known')    return 'HubbuyCN (cache)';
  return 'Estimativa manual';
}

export const quantoCustaCommand = {
  data: new SlashCommandBuilder()
    .setName('quanto-custa')
    .setDescription('Calcula o custo estimado em R$ de um produto da China')
    .addNumberOption(opt =>
      opt.setName('preco').setDescription('Preço do produto em ¥ CNY').setRequired(true).setMinValue(0.01)
    )
    .addNumberOption(opt =>
      opt.setName('frete').setDescription('Frete internacional em ¥ CNY (opcional)').setRequired(false).setMinValue(0)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;

    if (cooldown.has(userId)) {
      return interaction.reply({ content: 'Aguarde alguns segundos.', flags: [MessageFlags.Ephemeral] });
    }
    cooldown.set(userId, true);

    const productCny  = interaction.options.getNumber('preco', true);
    const shippingCny = interaction.options.getNumber('frete') ?? 0;

    await interaction.deferReply();

    try {
      const estimate = await estimateCost({ productCny, shippingCny });

      const e = embed()
        .setTitle('📊 Estimativa de Custo')
        .setDescription('Conversão baseada na taxa atual da HubbuyCN via Pix.')
        .addFields(
          { name: '🏷️ Produto',        value: `\`¥${productCny.toFixed(2)}\` → **\`R$${estimate.productBrl.toFixed(2)}\`**`,  inline: false },
          ...(shippingCny > 0 ? [{
            name: '✈️ Frete',           value: `\`¥${shippingCny.toFixed(2)}\` → **\`R$${estimate.shippingBrl.toFixed(2)}\`**`, inline: false,
          }] : []),
          { name: '💰 Total Estimado',  value: `\`¥${estimate.totalCny.toFixed(2)}\` → **\`R$${estimate.totalBrl.toFixed(2)}\`**`, inline: false },
          { name: '📈 Cotação',         value: `\`R$${estimate.cnyToBrl.toFixed(4)}\` por ¥1`,  inline: true },
          { name: '🔍 Fonte',           value: sourceLabel(estimate.source),                    inline: true },
          { name: '⚡ Confiança',       value: confidenceLabel(estimate.confidence),             inline: false },
        );

      await interaction.editReply({ embeds: [e] });

    } catch (err: any) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setDescription(`❌ ${err.message}`).setFooter(FOOTER).setTimestamp()],
      });
    }
  },
};