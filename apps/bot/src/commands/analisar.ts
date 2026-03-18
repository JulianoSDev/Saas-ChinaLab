import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ChatInputCommandInteraction,
} from 'discord.js';
import { buildLinkSignalSet, getShippingEstimate, estimateCost } from '@chinalab/services';
import { AppError } from '@chinalab/utils';
import NodeCache from 'node-cache';

const cooldown = new NodeCache({ stdTTL: 5 });

const COLOR = 0xF4A42C;
const COLOR_ERROR = 0xED4245;
const FOOTER = { text: 'ChinaLab | Analise de custo · Nao inclui taxas alfandegarias' };

function embed() {
  return new EmbedBuilder().setColor(COLOR).setFooter(FOOTER).setTimestamp();
}

function parseWeight(input: number): number | null {
  if (Number.isNaN(input) || input <= 0) return null;
  return input >= 30 ? input / 1000 : input;
}

function normalizeWeight(kg: number): number {
  return Math.ceil((kg * 1000) / 100) * 100;
}

function getRecommendation(freightRatio: number): { emoji: string; text: string } {
  if (freightRatio <= 0.20) {
    return { emoji: 'OK', text: 'Vale a pena importar' };
  }

  if (freightRatio <= 0.40) {
    return { emoji: 'ALERTA', text: 'Custo aceitavel, mas pode melhorar com haul' };
  }

  return { emoji: 'REVISAO', text: 'Frete alto para item solo; melhor juntar mais itens' };
}

function buildErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }

  return 'Nao foi possivel analisar esse item agora.';
}

export const analisarCommand = {
  data: new SlashCommandBuilder()
    .setName('analisar')
    .setDescription('Analisa o custo de importacao de um produto da China')
    .addNumberOption((opt) =>
      opt.setName('preco').setDescription('Preco do produto em CNY').setRequired(true).setMinValue(0.01)
    )
    .addNumberOption((opt) =>
      opt.setName('peso').setDescription('Peso em kg (1.5) ou gramas (1500)').setRequired(true).setMinValue(0.01).setMaxValue(30000)
    )
    .addStringOption((opt) =>
      opt.setName('link').setDescription('Link do produto (opcional)').setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;

    if (cooldown.has(userId)) {
      return interaction.reply({ content: 'Aguarde alguns segundos.', flags: [MessageFlags.Ephemeral] });
    }
    cooldown.set(userId, true);

    const productCny = interaction.options.getNumber('preco', true);
    const rawWeight = interaction.options.getNumber('peso', true);
    const link = interaction.options.getString('link') ?? null;
    const weightKg = parseWeight(rawWeight);

    if (!weightKg || weightKg > 30) {
      return interaction.reply({
        content: 'Peso invalido. Use kg (ex: `1.5`) ou gramas (ex: `1500`). Maximo: 30kg.',
        flags: [MessageFlags.Ephemeral],
      });
    }

    await interaction.deferReply();

    try {
      const weightGrams = normalizeWeight(weightKg);
      const freightEstimate = await getShippingEstimate(['8'], weightGrams, weightKg);
      const cheapestRoute = freightEstimate.top3.cheapest;
      const shippingCny = cheapestRoute?.costCNY ?? 0;
      const routeName = cheapestRoute?.name ?? 'Estimativa';

      const costEstimate = await estimateCost({ productCny, shippingCny });

      const freightRatio = shippingCny / productCny;
      const freightPercent = (freightRatio * 100).toFixed(0);
      const recommendation = getRecommendation(freightRatio);

      const feeRate = costEstimate.primaryMethod.feeAmount / costEstimate.primaryMethod.totalAmount;
      const productBaseR = productCny * costEstimate.effectiveRate * (1 - feeRate);
      const shippingBrl = shippingCny * costEstimate.effectiveRate * (1 - feeRate);
      const totalBrl = costEstimate.productBrl + shippingBrl;

      const e = embed()
        .setTitle('Analise de importacao')
        .addFields(
          {
            name: 'Produto',
            value: `\`Y${productCny.toFixed(2)}\` -> **\`R$${costEstimate.productBrl.toFixed(2)}\`** *(via BRS-PIX)*\nBase HubbuyCN: \`R$${productBaseR.toFixed(2)}\``,
            inline: false,
          },
          {
            name: 'Frete estimado',
            value: `\`${routeName}\`\n\`Y${shippingCny.toFixed(2)}\` -> \`R$${shippingBrl.toFixed(2)}\``,
            inline: false,
          },
          {
            name: 'Total estimado',
            value: `\`Y${(productCny + shippingCny).toFixed(2)}\` -> **\`R$${totalBrl.toFixed(2)}\`**`,
            inline: false,
          },
          {
            name: 'Peso',
            value: `\`${weightKg}kg\` *(cobrado como ${weightGrams}g)*`,
            inline: true,
          },
          {
            name: 'Proporcao do frete',
            value: `Frete representa \`${freightPercent}%\` do valor do produto`,
            inline: true,
          },
          {
            name: `${recommendation.emoji} Recomendacao`,
            value: `**${recommendation.text}**`,
            inline: false,
          },
        );

      if (link) {
        const linkSignals = await buildLinkSignalSet(link);
        e.addFields(
          {
            name: 'Card de decisao do link',
            value: [
              `Resumo: \`${linkSignals.decisionCard.summary}\``,
              `Prioridade atual: \`${linkSignals.decisionCard.currentPriority}\``,
              `Alpha: \`${linkSignals.scoreAlpha.surface}\` - ${linkSignals.scoreAlpha.reading}`,
              `Status: \`${linkSignals.stability}\``,
              `Estabilidade aparente: ${linkSignals.decisionCard.apparentStability}`,
              `Pressao / alertas: ${linkSignals.decisionCard.pressure}`,
              `Contexto disponivel: ${linkSignals.decisionCard.availableContext}`,
              `Evidencia comunitaria: ${linkSignals.communityEvidence.reading}`,
              `Acao sugerida: \`${linkSignals.decisionCard.actionLabel}\``,
              `Reviews ligadas: \`${linkSignals.reviewCount}\``,
            ].join('\n'),
            inline: false,
          },
          {
            name: 'Leitura rapida',
            value: `${linkSignals.priority.reading}\nProximo passo: ${linkSignals.decisionCard.nextStep}${linkSignals.communityEvidence.reviewCount < 2 ? '\nPouca evidencia comunitaria: use `/review adicionar-link` se voce ja comprou.' : '\nVer reviews: `/review ver-link`.'}`,
            inline: false,
          },
        );
      }

      const components = [];
      if (link) {
        const affiliateCode = process.env.AFFILIATE_CODE || '';
        const encoded = encodeURIComponent(link);
        const url = affiliateCode
          ? `https://www.hubbuycn.com/product/item?url=${encoded}&invitation_code=${affiliateCode}`
          : `https://www.hubbuycn.com/product/item?url=${encoded}`;

        components.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel('Comprar via HubbuyCN')
              .setStyle(ButtonStyle.Link)
              .setURL(url),
          ),
        );
      }

      await interaction.editReply({ embeds: [e], components });
    } catch (err) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setDescription(`Erro: ${buildErrorMessage(err)}`)
            .setFooter(FOOTER)
            .setTimestamp(),
        ],
      });
    }
  },
};
