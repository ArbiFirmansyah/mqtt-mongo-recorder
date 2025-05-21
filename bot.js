import mqtt from 'mqtt';
import mongoose from 'mongoose';
import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

// === MongoDB Setup ===
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB Error:', err.message));

const gpsSchema = new mongoose.Schema({
  latitude: Number,
  longitude: Number,
  waktu: { type: Date, default: Date.now }
});
const GpsData = mongoose.model('GpsData', gpsSchema);

// === MQTT Setup (HiveMQ) ===
const mqttClient = mqtt.connect({
  host: process.env.MQTT_HOST,
  port: 8883,
  protocol: 'mqtts',
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD
});

mqttClient.on('connect', () => {
  console.log('📡 MQTT Connected');
  mqttClient.subscribe('esp32/gps');
});

mqttClient.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
      await new GpsData(data).save();
      console.log('✅ Data saved:', data);
    } else {
      throw new Error('Invalid GPS format');
    }
  } catch (err) {
    console.error('❌ Error parsing/saving data:', err.message);
  }
});

// === Telegram Bot Setup ===
const bot = new Telegraf(process.env.BOT_TOKEN);
const activeUsers = new Set();

// === Cleanup webhook before polling ===
(async () => {
  try {
    // Pastikan webhook dihapus agar tidak bentrok
    await bot.telegram.deleteWebhook();
    console.log('✅ Webhook deleted');

    // Luncurkan polling setelah webhook dihapus
    await bot.launch();
    console.log('🤖 Telegram Bot started');
  } catch (err) {
    if (err.description?.includes('Conflict')) {
      console.error('❗ Bot conflict: another instance is running.');
    } else {
      console.error('❌ Telegram Bot Error:', err);
    }
    process.exit(1); // keluar supaya Railway tidak menjalankan bot yang gagal
  }
})();

// === /start command ===
bot.start((ctx) => {
  activeUsers.add(ctx.chat.id);
  ctx.reply('👋 Selamat datang! Silakan pilih menu:', {
    reply_markup: {
      keyboard: [['/lokasi', '/riwayat'], ['/stop']],
      resize_keyboard: true
    }
  });
});

// === /stop command ===
bot.command('stop', (ctx) => {
  activeUsers.delete(ctx.chat.id);
  ctx.reply('🛑 Kamu telah menghentikan bot.', {
    reply_markup: {
      keyboard: [['/start']],
      resize_keyboard: true
    }
  });
});

// === /lokasi command ===
bot.command('lokasi', async (ctx) => {
  if (!activeUsers.has(ctx.chat.id)) return;

  const latest = await GpsData.findOne().sort({ waktu: -1 });
  if (!latest) return ctx.reply('⚠️ Tidak ada data lokasi.');

  const msg = `📍 Lokasi Terakhir Sepeda Motor Anda:\n\n🕒 ${latest.waktu.toLocaleString()}\n📌 Latitude: ${latest.latitude}\n📌 Longitude: ${latest.longitude}`;
  await ctx.reply(msg);
  await ctx.replyWithLocation(latest.latitude, latest.longitude);
});

// === /riwayat command ===
bot.command('riwayat', async (ctx) => {
  if (!activeUsers.has(ctx.chat.id)) return;

  const data = await GpsData.find().sort({ waktu: -1 }).limit(5);
  if (!data.length) return ctx.reply('⚠️ Tidak ada riwayat.');

  let msg = '📍 Riwayat Lokasi:\n\n';
  data.forEach((d, i) => {
    msg += `${i + 1}. Lat: ${d.latitude}, Long: ${d.longitude}\n   🕒 ${d.waktu.toLocaleString()}\n`;
  });
  ctx.reply(msg);
});

// === Graceful shutdown ===
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
