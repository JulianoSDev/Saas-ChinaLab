import path from 'path';
import { configDotenv } from 'dotenv';

configDotenv({ path: path.resolve(process.cwd(), '.env') });
configDotenv({ path: path.resolve(process.cwd(), '../../.env') });

import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import { createLogger } from '@chinalab/utils';
import { freteCommand }      from './commands/frete';
import { haulCommand }       from './commands/haul';
import { quantoCustaCommand } from './commands/quantoCusta';
import { handleLinkMessage } from './events/linkConverter';

const log = createLogger('Bot');

const DISCORD_TOKEN     = process.env.DISCORD_TOKEN!;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
const DISCORD_GUILD_ID  = process.env.DISCORD_GUILD_ID!;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID || !DISCORD_GUILD_ID) {
  console.error('❌ Variáveis de ambiente não encontradas no .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const commands = [freteCommand, haulCommand, quantoCustaCommand];

client.once('clientReady', async (c) => {
  log.info(`✅ Online como: ${c.user.tag}`);
  const rest = new REST().setToken(DISCORD_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
    { body: commands.map(cmd => cmd.data.toJSON()) },
  );
  log.info(`✅ ${commands.length} comandos registrados`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = commands.find(c => c.data.name === interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (err) {
    log.error({ err, command: interaction.commandName }, 'Erro ao executar comando');
    const msg = { content: '❌ Erro interno. Tente novamente.', ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
    else await interaction.reply(msg);
  }
});

// ─── Link Converter ───────────────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  try {
    await handleLinkMessage(message);
  } catch (err) {
    log.error({ err }, 'Erro no link converter');
  }
});

process.on('uncaughtException', (err) => { log.fatal({ err }, 'Uncaught Exception'); process.exit(1); });
process.on('unhandledRejection', (reason) => { log.error({ reason }, 'Unhandled Rejection'); });

client.login(DISCORD_TOKEN);