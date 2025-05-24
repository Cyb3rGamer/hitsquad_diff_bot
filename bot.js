const { Client, GatewayIntentBits } = require('discord.js');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Use environment variables set by GitHub Actions
const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const CACHE_DIR = '.cache';
const CACHE_FILE = path.join(CACHE_DIR, 'items.json');

const API_URL = 'https://api.streamelements.com/kappa/v2/store/61e8d63d3d12f65a5584b351/items?source=website';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR);
  }
}

function loadCachedItems() {
  if (fs.existsSync(CACHE_FILE)) {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  } else {
    return null;
  }
}

function saveCachedItems(items) {
  ensureCacheDir();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(items, null, 2));
}

function getIdSet(items) {
  return new Set(items.map(item => item._id));
}

function diffItems(oldItems, newItems) {
  const oldIds = getIdSet(oldItems);
  const newIds = getIdSet(newItems);

  const added = newItems.filter(item => !oldIds.has(item._id));
  const removed = oldItems.filter(item => !newIds.has(item._id));
  return { added, removed };
}

async function fetchItems() {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`Failed to fetch items: ${res.status}`);
  return await res.json();
}

async function reportChanges(channel) {
  try {
    const fresh = await fetchItems();
    const cached = loadCachedItems();

    if (!cached) {
      saveCachedItems(fresh);
      await channel.send('📦 First run: items cached.');
      return;
    }

    const { added, removed } = diffItems(cached, fresh);

    if (added.length === 0 && removed.length === 0) {
      await channel.send('✅ No changes since last check.');
    } else {
      const lines = [];

      if (added.length > 0) {
        lines.push('🟢 **Added Items:**');
        for (const item of added) {
          lines.push(`+ ${item.name}`);
        }
      }

      if (removed.length > 0) {
        lines.push('🔴 **Removed Items:**');
        for (const item of removed) {
          lines.push(`− ${item.name}`);
        }
      }

      await channel.send(lines.join('\n'));
    }

    saveCachedItems(fresh);
  } catch (err) {
    await channel.send(`⚠️ Error: ${err.message}`);
  }
}

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log("channelid is",CHANNEL_ID);
  const channel = await client.channels.fetch(CHANNEL_ID);
  await reportChanges(channel);
  client.destroy(); // Exit after sending
});

client.login(TOKEN);
