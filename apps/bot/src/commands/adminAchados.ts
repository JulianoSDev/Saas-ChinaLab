import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from 'discord.js';
import {
  approveFindSuggestion,
  createFind,
  getFindSuggestionById,
  listCatalogFinds,
  listPendingFindSuggestions,
  rejectFindSuggestion,
  removeFind,
  updatePendingFindSuggestion,
  updatePublishedFind,
} from '@chinalab/services';
import { createLogger } from '@chinalab/utils';

const log = createLogger('AdminAchadosCommand');

const COLOR = 0xF4A42C;
const COLOR_ERROR = 0xED4245;
const COLOR_YELLOW = 0xFEE75C;
const FOOTER = { text: 'ChinaLab Admin' };

const CATEGORY_LABELS: Record<string, string> = {
  tenis: 'Tenis',
  roupas: 'Roupas',
  acessorios: 'Acessorios',
  eletronicos: 'Eletronicos',
  utilidades: 'Utilidades',
};

function isAdmin(userId: string): boolean {
  const admins = (process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return admins.includes(userId);
}

function formatCategory(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

async function sendDM(
  client: ChatInputCommandInteraction['client'],
  discordId: string,
  embed: EmbedBuilder,
): Promise<void> {
  try {
    const user = await client.users.fetch(discordId);
    await user.send({ embeds: [embed] });
  } catch (error) {
    log.warn({ error, discordId }, 'Falha ao enviar DM de moderacao');
  }
}

export const adminAchadosCommand = {
  data: new SlashCommandBuilder()
    .setName('admin_achados')
    .setDescription('Gerenciar achados e sugestoes [ADMIN]')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Adicionar produto diretamente ao catalogo')
        .addStringOption((opt) => opt.setName('nome').setDescription('Nome do produto').setRequired(true))
        .addStringOption((opt) => opt.setName('link').setDescription('Link do produto').setRequired(true))
        .addNumberOption((opt) =>
          opt.setName('preco').setDescription('Preco em CNY').setRequired(true).setMinValue(0.01)
        )
        .addStringOption((opt) =>
          opt
            .setName('categoria')
            .setDescription('Categoria')
            .setRequired(true)
            .addChoices(
              { name: 'Tenis', value: 'tenis' },
              { name: 'Roupas', value: 'roupas' },
              { name: 'Acessorios', value: 'acessorios' },
              { name: 'Eletronicos', value: 'eletronicos' },
              { name: 'Utilidades', value: 'utilidades' },
            )
        )
        .addStringOption((opt) => opt.setName('seller').setDescription('Vendedor').setRequired(false))
        .addStringOption((opt) => opt.setName('imagem').setDescription('URL da imagem').setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remover produto do catalogo')
        .addIntegerOption((opt) => opt.setName('id').setDescription('ID do produto').setRequired(true))
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Listar produtos do catalogo'))
    .addSubcommand((sub) =>
      sub
        .setName('revisar')
        .setDescription('Ver sugestoes pendentes')
        .addIntegerOption((opt) =>
          opt.setName('id').setDescription('ID da sugestao para ver detalhes').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('editar')
        .setDescription('Editar sugestao pendente antes de aprovar')
        .addIntegerOption((opt) => opt.setName('id').setDescription('ID da sugestao').setRequired(true))
        .addStringOption((opt) =>
          opt
            .setName('campo')
            .setDescription('Campo a editar')
            .setRequired(true)
            .addChoices(
              { name: 'nome', value: 'name' },
              { name: 'preco', value: 'price' },
              { name: 'categoria', value: 'category' },
              { name: 'seller', value: 'seller' },
              { name: 'link', value: 'link' },
              { name: 'imagem', value: 'imageUrl' },
            )
        )
        .addStringOption((opt) => opt.setName('valor').setDescription('Novo valor').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('editar_publicado')
        .setDescription('Editar um achado ja publicado no catalogo')
        .addIntegerOption((opt) => opt.setName('id').setDescription('ID do achado publicado').setRequired(true))
        .addStringOption((opt) =>
          opt
            .setName('campo')
            .setDescription('Campo a editar')
            .setRequired(true)
            .addChoices(
              { name: 'nome', value: 'name' },
              { name: 'preco', value: 'price' },
              { name: 'categoria', value: 'category' },
              { name: 'seller', value: 'seller' },
              { name: 'link', value: 'link' },
              { name: 'imagem', value: 'imageUrl' },
            )
        )
        .addStringOption((opt) => opt.setName('valor').setDescription('Novo valor').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('aprovar')
        .setDescription('Aprovar uma sugestao da comunidade')
        .addIntegerOption((opt) => opt.setName('id').setDescription('ID da sugestao').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('rejeitar')
        .setDescription('Rejeitar uma sugestao da comunidade')
        .addIntegerOption((opt) => opt.setName('id').setDescription('ID da sugestao').setRequired(true))
        .addStringOption((opt) => opt.setName('motivo').setDescription('Motivo da rejeicao').setRequired(false))
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({
        content: 'Voce nao tem permissao para usar este comando.',
        flags: [MessageFlags.Ephemeral],
      });
    }

    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      switch (subcommand) {
        case 'add': {
          const find = await createFind({
            name: interaction.options.getString('nome', true),
            link: interaction.options.getString('link', true),
            price: interaction.options.getNumber('preco', true),
            category: interaction.options.getString('categoria', true),
            seller: interaction.options.getString('seller') ?? undefined,
            imageUrl: interaction.options.getString('imagem') ?? undefined,
          });

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(COLOR)
                .setTitle('Produto adicionado')
                .addFields(
                  { name: 'ID', value: `#${find.id}`, inline: true },
                  { name: 'Nome', value: find.name, inline: true },
                  { name: 'Preco', value: `Y${find.price.toFixed(2)}`, inline: true },
                )
                .setFooter(FOOTER)
                .setTimestamp(),
            ],
          });
          break;
        }

        case 'remove': {
          const id = interaction.options.getInteger('id', true);
          await removeFind(id);

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(COLOR)
                .setDescription(`Achado #${id} removido do catalogo.`)
                .setFooter(FOOTER)
                .setTimestamp(),
            ],
          });
          break;
        }

        case 'list': {
          const finds = await listCatalogFinds();

          if (!finds.length) {
            await interaction.editReply({ content: 'Catalogo vazio.' });
            break;
          }

          const list = finds
            .map(
              (find) =>
                `#${find.id} ${find.name} - Y${find.price.toFixed(2)} - ${formatCategory(find.category)}${
                  find.seller ? ` - ${find.seller}` : ''
                }`
            )
            .join('\n');

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(COLOR)
                .setTitle('Catalogo')
                .setDescription(list)
                .setFooter(FOOTER)
                .setTimestamp(),
            ],
          });
          break;
        }

        case 'revisar': {
          const id = interaction.options.getInteger('id');

          if (id) {
            const suggestion = await getFindSuggestionById(id);

            const embed = new EmbedBuilder()
              .setColor(suggestion.status === 'pending' ? COLOR_YELLOW : COLOR)
              .setTitle(`Sugestao #${id} - ${suggestion.name}`)
              .addFields(
                { name: 'Status', value: suggestion.status, inline: true },
                { name: 'Preco', value: `Y${suggestion.price.toFixed(2)}`, inline: true },
                { name: 'Categoria', value: formatCategory(suggestion.category), inline: true },
                { name: 'Seller', value: suggestion.seller ?? '-', inline: true },
                { name: 'Usuario', value: `${suggestion.username} (${suggestion.discordId})`, inline: false },
                { name: 'Link', value: suggestion.link, inline: false },
                ...(suggestion.notes ? [{ name: 'Observacao', value: suggestion.notes, inline: false }] : []),
              )
              .setFooter({ text: 'Sugestao pendente usa /admin_achados editar ou aprovar' })
              .setTimestamp();

            if (suggestion.imageUrl) {
              embed.setImage(suggestion.imageUrl);
            }

            await interaction.editReply({ embeds: [embed] });
            break;
          }

          const suggestions = await listPendingFindSuggestions();

          if (!suggestions.length) {
            await interaction.editReply({ content: 'Nenhuma sugestao pendente.' });
            break;
          }

          const list = suggestions
            .map(
              (suggestion: any) =>
                `#${suggestion.id} ${suggestion.name} - Y${suggestion.price.toFixed(2)} - ${formatCategory(
                  suggestion.category
                )} - por ${suggestion.username}`
            )
            .join('\n');

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(COLOR_YELLOW)
                .setTitle(`Sugestoes Pendentes (${suggestions.length})`)
                .setDescription(list)
                .setFooter({ text: 'Use /admin_achados revisar id:N para abrir o detalhe com imagem' })
                .setTimestamp(),
            ],
          });
          break;
        }

        case 'editar': {
          const id = interaction.options.getInteger('id', true);
          const field = interaction.options.getString('campo', true) as
            | 'name'
            | 'price'
            | 'category'
            | 'seller'
            | 'link'
            | 'imageUrl';
          await updatePendingFindSuggestion(id, field, interaction.options.getString('valor', true));

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(COLOR)
                .setDescription(`Sugestao #${id} atualizada em ${field}.`)
                .setFooter(FOOTER)
                .setTimestamp(),
            ],
          });
          break;
        }

        case 'editar_publicado': {
          const id = interaction.options.getInteger('id', true);
          const field = interaction.options.getString('campo', true) as
            | 'name'
            | 'price'
            | 'category'
            | 'seller'
            | 'link'
            | 'imageUrl';
          await updatePublishedFind(id, field, interaction.options.getString('valor', true));

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(COLOR)
                .setDescription(`Achado publicado #${id} atualizado em ${field}.`)
                .setFooter(FOOTER)
                .setTimestamp(),
            ],
          });
          break;
        }

        case 'aprovar': {
          const id = interaction.options.getInteger('id', true);
          const { suggestion, find } = await approveFindSuggestion(id, interaction.user.id);

          await sendDM(
            interaction.client,
            suggestion.discordId,
            new EmbedBuilder()
              .setColor(COLOR)
              .setTitle('Sua sugestao foi aprovada')
              .setDescription(
                `${suggestion.name} entrou no catalogo do ChinaLab. Use /achado id:${find.id} para abrir o item.`
              )
              .setFooter({ text: 'ChinaLab' })
              .setTimestamp(),
          );

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(COLOR)
                .setTitle('Sugestao aprovada')
                .setDescription(`${suggestion.name} foi publicado como achado #${find.id}.`)
                .setFooter(FOOTER)
                .setTimestamp(),
            ],
          });
          break;
        }

        case 'rejeitar': {
          const id = interaction.options.getInteger('id', true);
          const reason = interaction.options.getString('motivo');
          const suggestion = await rejectFindSuggestion(id, interaction.user.id);

          const dmDescription = reason
            ? `${suggestion.name} nao foi aprovado. Motivo: ${reason}`
            : `${suggestion.name} nao foi aprovado desta vez.`;

          await sendDM(
            interaction.client,
            suggestion.discordId,
            new EmbedBuilder()
              .setColor(COLOR_ERROR)
              .setTitle('Sua sugestao nao foi aprovada')
              .setDescription(dmDescription)
              .setFooter({ text: 'ChinaLab' })
              .setTimestamp(),
          );

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(COLOR_ERROR)
                .setDescription(`Sugestao #${id} rejeitada.`)
                .setFooter(FOOTER)
                .setTimestamp(),
            ],
          });
          break;
        }

        default: {
          await interaction.editReply({ content: 'Subcomando admin desconhecido.' });
        }
      }
    } catch (error: any) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setDescription(error.message ?? 'Erro interno ao processar o comando.')
            .setFooter(FOOTER)
            .setTimestamp(),
        ],
      });
    }
  },
};
