import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ChatInputCommandInteraction,
} from 'discord.js';
import { getShippingEstimate, estimateCost } from '@chinalab/services';
import NodeCache from 'node-cache';

const cooldown = new NodeCache({ stdTTL: 5 });

const COLOR       = 0xF4A42C;
const COLOR_ERROR = 0xED4245;
const FOOTER      = { text: 'ChinaLab • Análise de custo · Não inclui taxas alfandegárias' };

function embed() {
  return new EmbedBuilder().setColor(COLOR).setFooter(FOOTER).setTimestamp();
}

function parseWeight(input: number): number | null {
  if (isNaN(input) || input <= 0) return null;
  return input >= 30 ? input / 1000 : input;
}

function normalizeWeight(kg: number): number {
  return Math.ceil(kg * 1000 / 100) * 100;
}

function getRecommendation(freightRatio: number): { emoji: string; text: string } {
  if (freightRatio <= 0.20) {
    return { emoji: '✅', text: 'Vale a pena importar' };
  } else if (freightRatio <= 0.40) {
    return { emoji: '🟡', text: 'Custo aceitável, mas pode melhorar com haul' };
  } else {
    return { emoji: '⚠️', text: 'Frete alto para item solo; melhor juntar mais itens' };
  }
}

export const analisarCommand = {
  data: new SlashCommandBuilder()
    .setName('analisar')
    .setDescription('Analisa o custo de importação de um produto da China')
    .addNumberOption(opt =>
      opt.setName('preco').setDescription('Preço do produto em ¥ CNY').setRequired(true).setMinValue(0.01)
    )
    .addNumberOption(opt =>
      opt.setName('peso').setDescription('Peso em kg (1.5) ou gramas (1500)').setRequired(true).setMinValue(0.01).setMaxValue(30000)
    )
    .addStringOption(opt =>
      opt.setName('link').setDescription('Link do produto (opcional)').setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;

    if (cooldown.has(userId)) {
      return interaction.reply({ content: 'Aguarde alguns segundos.', flags: [MessageFlags.Ephemeral] });
    }
    cooldown.set(userId, true);

    const productCny = interaction.options.getNumber('preco', true);
    const rawWeight  = interaction.options.getNumber('peso', true);
    const link       = interaction.options.getString('link') ?? null;
    const weightKg   = parseWeight(rawWeight);

    if (!weightKg || weightKg > 30) {
      return interaction.reply({
        content: 'Peso inválido. Use kg (ex: `1.5`) ou gramas (ex: `1500`). Máximo: 30kg.',
        flags: [MessageFlags.Ephemeral],
      });
    }

    await interaction.deferReply();

    try {
      const weightGrams = normalizeWeight(weightKg);

      // Buscar frete real via HubbuyCN (categoria geral = id 8)
      const freightEstimate = await getShippingEstimate(['8'], weightGrams, weightKg);
      const cheapestRoute   = freightEstimate.top3.cheapest;
      const shippingCny     = cheapestRoute?.costCNY ?? 0;
      const routeName       = cheapestRoute?.name ?? 'Estimativa';

      // Converter para BRL via BRS-PIX
      const costEstimate = await estimateCost({ productCny, shippingCny });

      // Calcular proporção frete/produto
      const freightRatio    = shippingCny / productCny;
      const freightPercent  = (freightRatio * 100).toFixed(0);
      const recommendation  = getRecommendation(freightRatio);

      // Calcular base do produto (sem fee)
      const feeRate        = costEstimate.primaryMethod.feeAmount / costEstimate.primaryMethod.totalAmount;
      const productBaseR   = productCny  * costEstimate.effectiveRate * (1 - feeRate);
      const shippingBrl    = shippingCny * costEstimate.effectiveRate * (1 - feeRate);
      const totalBrl       = costEstimate.productBrl + shippingBrl;

      const e = embed()
        .setTitle('📊 Análise de Importação')
        .addFields(
          {
            name:  '🏷️ Produto',
            value: `\`¥${productCny.toFixed(2)}\` → **\`R$${costEstimate.productBrl.toFixed(2)}\`** *(via BRS-PIX)*\n↳ Base HubbuyCN: \`R$${productBaseR.toFixed(2)}\``,
            inline: false,
          },
          {
            name:  '✈️ Frete Estimado',
            value: `\`${routeName}\`\n↳ \`¥${shippingCny.toFixed(2)}\` → \`R$${shippingBrl.toFixed(2)}\``,
            inline: false,
          },
          {
            name:  '💰 Total Estimado',
            value: `\`¥${(productCny + shippingCny).toFixed(2)}\` → **\`R$${totalBrl.toFixed(2)}\`**`,
            inline: false,
          },
          {
            name:  '⚖️ Peso',
            value: `\`${weightKg}kg\` *(cobrado como ${weightGrams}g)*`,
            inline: true,
          },
          {
            name:  '📈 Proporção do Frete',
            value: `Frete representa \`${freightPercent}%\` do valor do produto`,
            inline: true,
          },
          {
            name:  `${recommendation.emoji} Recomendação`,
            value: `**${recommendation.text}**`,
            inline: false,
          },
        );

      const components = [];
      if (link) {
        const affiliateCode = process.env.AFFILIATE_CODE || '';
        const encoded       = encodeURIComponent(link);
        const url           = affiliateCode
          ? `https://www.hubbuycn.com/product/item?url=${encoded}&invitation_code=${affiliateCode}`
          : `https://www.hubbuycn.com/product/item?url=${encoded}`;

        components.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel('Comprar via HubbuyCN')
              .setEmoji('🛒')
              .setStyle(ButtonStyle.Link)
              .setURL(url),
          )
        );
      }

      await interaction.editReply({ embeds: [e], components });

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
