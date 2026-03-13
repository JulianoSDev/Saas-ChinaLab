import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  ChatInputCommandInteraction,
} from 'discord.js';
import { getShippingEstimate, FreightEstimate } from '@chinalab/services';
import NodeCache from 'node-cache';
import { env } from '@chinalab/config';

const cooldown = new NodeCache({ stdTTL: env.USER_COOLDOWN_SECONDS });

const CATEGORIES: Record<string, { label: string; ids: string[] }> = {
  tenis:     { label: '👟 Tênis / Sneakers',      ids: ['9'] },
  roupa:     { label: '👕 Roupas',                ids: ['8'] },
  bolsa:     { label: '👜 Bolsa / Mochila',       ids: ['9'] },
  eletronico:{ label: '📱 Celular / Eletrônico',  ids: ['15'] },
  notebook:  { label: '💻 Notebook / Tablet',     ids: ['15'] },
  fone:      { label: '🎧 Fone / Acessório Tech', ids: ['15'] },
  relogio:   { label: '⌚ Relógio',               ids: ['9'] },
  oculos:    { label: '🕶️ Óculos',               ids: ['14'] },
  perfume:   { label: '🌸 Perfume',              ids: ['24'] },
  cosmetico: { label: '💄 Cosmético / Maquiagem', ids: ['16'] },
  geral:     { label: '📦 Geral / Outros',        ids: ['8'] },
};

const CHOICES = Object.entries(CATEGORIES).map(([value, { label }]) => ({ name: label, value }));

function parseWeight(input: number): number | null {
  if (isNaN(input) || input <= 0) return null;
  return input >= 30 ? input / 1000 : input;
}

function normalizeWeight(kg: number): number {
  return Math.ceil(kg * 1000 / 100) * 100;
}

const FOOTER = 'China Lab • Ferramenta não oficial. Confirme os valores no site da HubbuyCN.';

function buildEmbed(estimate: FreightEstimate, categoryLabel: string): EmbedBuilder {
  const { top3, weightKg, weightGrams, airRoutesCount } = estimate;

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle('📦 Estimativa de Frete — China Lab')
    .setDescription(
      `**Peso:** ${weightKg}kg *(cobrado como ${weightGrams}g)*\n` +
      `**Categoria:** ${categoryLabel}\n` +
      `**Destino:** 🇧🇷 Brasil · **${airRoutesCount} rotas aéreas**`
    )
    .setTimestamp()
    .setFooter({ text: FOOTER });

  if (top3.cheapest) embed.addFields({
    name: '💰 Mais Barata',
    value: `**${top3.cheapest.name}**\n${top3.cheapest.costFormatted} *(${top3.cheapest.pricePerKg})*\n⏱️ ${top3.cheapest.deliveryTime}`,
    inline: false,
  });

  if (top3.fastest) embed.addFields({
    name: '⚡ Mais Rápida',
    value: `**${top3.fastest.name}**\n${top3.fastest.costFormatted} *(${top3.fastest.pricePerKg})*\n⏱️ ${top3.fastest.deliveryTime}`,
    inline: false,
  });

  if (top3.recommended) embed.addFields({
    name: '🛡️ Recomendada',
    value: `**${top3.recommended.name}**\n${top3.recommended.costFormatted} *(${top3.recommended.pricePerKg})*\n⏱️ ${top3.recommended.deliveryTime}`,
    inline: false,
  });

  return embed;
}

export const freteCommand = {
  data: new SlashCommandBuilder()
    .setName('frete')
    .setDescription('Estima o custo de frete da China para o Brasil via HubbuyCN')
    .addStringOption(opt =>
      opt.setName('categoria').setDescription('Tipo do produto').setRequired(true).addChoices(...CHOICES)
    )
    .addNumberOption(opt =>
      opt.setName('peso').setDescription('Peso em kg (1.5) ou gramas (1500)').setRequired(true).setMinValue(0.01).setMaxValue(30000)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;

    if (cooldown.has(userId)) {
      const ttl = cooldown.getTtl(userId)!;
      const remaining = Math.ceil((ttl - Date.now()) / 1000);
      return interaction.reply({
        content: `⏱️ Aguarde **${remaining}s** antes de usar novamente.`,
        flags: [MessageFlags.Ephemeral],
      });
    }
    cooldown.set(userId, true);

    const categoryInput = interaction.options.getString('categoria', true);
    const rawWeight = interaction.options.getNumber('peso', true);
    const weightKg = parseWeight(rawWeight);

    if (!weightKg || weightKg > 30) {
      return interaction.reply({
        content: '⚠️ Peso inválido. Use kg (ex: `1.5`) ou gramas (ex: `1500`). Máximo: 30kg.',
        flags: [MessageFlags.Ephemeral],
      });
    }

    const category = CATEGORIES[categoryInput];
    const weightGrams = normalizeWeight(weightKg);

    await interaction.deferReply();

    const estimate = await getShippingEstimate(category.ids, weightGrams, weightKg);
    const embed = buildEmbed(estimate, category.label);

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`allroutes_${userId}`)
        .setLabel('Ver Todas as Rotas')
        .setEmoji('📋')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setLabel('Site Oficial')
        .setEmoji('🔗')
        .setStyle(ButtonStyle.Link)
        .setURL('https://www.hubbuycn.com/calculation'),
    );

    const reply = await interaction.editReply({ embeds: [embed], components: [buttons] });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 300_000,
    });

    collector.on('collect', async btn => {
      if (!btn.customId.startsWith('allroutes_')) return;
      await btn.deferReply({ flags: [MessageFlags.Ephemeral] });

      const routes = estimate.allRoutes.slice(0, 25);
      const lines = routes.map((r, i) =>
        `**${i + 1}. ${r.name}**\n💵 ${r.costFormatted} · ⏱️ ${r.deliveryTime}`
      ).join('\n\n');

      await btn.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2b2d31)
            .setTitle(`📋 Todas as Rotas — ${weightGrams}g`)
            .setDescription(lines)
            .setFooter({ text: FOOTER })
            .setTimestamp(),
        ],
      });
    });
  },
};
