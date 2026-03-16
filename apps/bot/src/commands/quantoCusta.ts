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
const FOOTER      = { text: 'ChinaLab • Estimativa não oficial · Frete não inclui taxas futuras de pagamento' };

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

      // Produto: base (sem fee) e via BRS-PIX (com fee)
      const productBase = productCny * estimate.effectiveRate / (1 + (estimate.primaryMethod.feeAmount / (productCny * estimate.effectiveRate / (1 + 0.01))));
      const productBase2 = productCny * (estimate.effectiveRate / (1 + estimate.primaryMethod.feeAmount / estimate.primaryMethod.totalAmount));
      const feeRate      = estimate.primaryMethod.feeAmount / estimate.primaryMethod.totalAmount;
      const productBaseR = productCny * estimate.effectiveRate * (1 - feeRate);
      const productBRS   = estimate.productBrl;

      // Frete: só estimado com baseRate (sem fee)
      const shippingBrl = shippingCny * (estimate.effectiveRate / (1 + feeRate));

      // Total: produto via BRS-PIX + frete estimado
      const totalBrl = productBRS + shippingBrl;

      const e = embed()
        .setTitle('📊 Estimativa de Custo')
        .setDescription(`Cotação via **${estimate.primaryMethod.payTypeName}** · Fonte: ${sourceLabel(estimate.source)}`)
        .addFields(
          {
            name:  '🏷️ Produto',
            value: `Base HubbuyCN: \`R$${productBaseR.toFixed(2)}\`\nVia BRS-PIX: **\`R$${productBRS.toFixed(2)}\`**`,
            inline: false,
          },
          ...(shippingCny > 0 ? [{
            name:  '✈️ Frete estimado',
            value: `\`¥${shippingCny.toFixed(2)}\` → \`R$${shippingBrl.toFixed(2)}\` *(sem taxa de pagamento)*`,
            inline: false,
          }] : []),
          {
            name:  '💰 Total Estimado',
            value: `**\`R$${totalBrl.toFixed(2)}\`** *(produto via BRS-PIX + frete estimado)*`,
            inline: false,
          },
          {
            name:  '📈 Cotação BRS-PIX',
            value: `\`¥${estimate.displayRate.toFixed(4)}\` por R$1`,
            inline: true,
          },
          {
            name:  '⚡ Confiança',
            value: confidenceLabel(estimate.confidence),
            inline: true,
          },
        );

      await interaction.editReply({ embeds: [e] });

    } catch (err: any) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setDescription(`❌ ${err.message}`)
            .setFooter(FOOTER)
            .setTimestamp(),
        ],
      });
    }
  },
};