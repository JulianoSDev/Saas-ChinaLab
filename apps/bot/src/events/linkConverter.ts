import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import NodeCache from 'node-cache';

// ─── Cooldown por usuário (15s) ───────────────────────────────────────────────
const cooldown = new NodeCache({ stdTTL: 15 });

// ─── Plataformas suportadas ───────────────────────────────────────────────────
const PLATFORMS = [
  { name: 'Weidian',  regex: /https?:\/\/(?:www\.)?weidian\.com\/[^\s]+/gi },
  { name: 'Taobao',   regex: /https?:\/\/(?:www\.)?(?:item\.)?taobao\.com\/[^\s]+/gi },
  { name: 'Tmall',    regex: /https?:\/\/(?:www\.)?(?:detail\.)?tmall\.com\/[^\s]+/gi },
  { name: '1688',     regex: /https?:\/\/(?:www\.)?(?:detail\.)?1688\.com\/[^\s]+/gi },
  { name: 'JD CN',    regex: /https?:\/\/(?:www\.)?item\.jd\.com\/[^\s]+/gi },
];

const AFFILIATE_CODE = process.env.AFFILIATE_CODE || '';
const COLOR          = 0xF4A42C;
const FOOTER         = { text: 'ChinaLab • Ferramenta não oficial' };

function buildAffiliateUrl(originalUrl: string): string {
  const encoded = encodeURIComponent(originalUrl);
  const base    = `https://www.hubbuycn.com/product/item?url=${encoded}`;
  return AFFILIATE_CODE ? `${base}&invitation_code=${AFFILIATE_CODE}` : base;
}

function detectLink(content: string): { platform: string; url: string } | null {
  for (const { name, regex } of PLATFORMS) {
    regex.lastIndex = 0;
    const match = content.match(regex);
    if (match) return { platform: name, url: match[0] };
  }
  return null;
}

export async function handleLinkMessage(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.guild)     return;
  if (!message.content)   return;

  // Guard clause leve antes do regex
  if (!message.content.includes('http')) return;

  // Cooldown por usuário
  if (cooldown.has(message.author.id)) return;

  const detected = detectLink(message.content);
  if (!detected) return;

  cooldown.set(message.author.id, true);

  const affiliateUrl = buildAffiliateUrl(detected.url);

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🔗 Link detectado!')
    .setDescription(
      `Link da **${detected.platform}** detectado!\n\n` +
      `Use o botão abaixo para abrir via **HubbuyCN** e calcular o frete.`
    )
    .addFields(
      { name: '🏪 Plataforma', value: `\`${detected.platform}\``, inline: true },
    )
    .setFooter(FOOTER)
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Comprar via HubbuyCN')
      .setEmoji('🛒')
      .setStyle(ButtonStyle.Link)
      .setURL(affiliateUrl),
  );

  await message.reply({ embeds: [embed], components: [row] });
}
