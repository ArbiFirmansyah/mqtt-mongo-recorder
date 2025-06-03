import mqtt from 'mqtt';
import mongoose from 'mongoose';
import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';

dotenv.config();

// MongoDB
mongoose.connect(process.env.MONGODB_URI).then(() => console.log('✅ MongoDB Connected'));

const gpsSchema = new mongoose.Schema({
  latitude: Number,
  longitude: Number,
  waktu: { type: Date, default: Date.now }
});
const GpsData = mongoose.model('GpsData', gpsSchema);

// MQTT (HiveMQ)
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
  mqttClient.subscribe('esp32/alarm');
});

mqttClient.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());

    if (topic === 'esp32/gps') {
      if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
        await new GpsData(data).save();
        const latest = await GpsData.findOne().sort({ waktu: -1 });
        if (!latest) return ctx.reply('⚠️ Tidak ada data lokasi.');
        await ctx.reply(`📍 Lokasi terakhir:
        🕒 ${latest.waktu.toLocaleString()}
        📌 Lat: ${latest.latitude}, Long: ${latest.longitude}`);
        await ctx.replyWithLocation(latest.latitude, latest.longitude);
      }
    } else if (topic === 'esp32/alarm' && data.alarm) {
      for (let id of activeUsers) {
        bot.telegram.sendMessage(id, '🚨 Deteksi getaran terdeteksi! Periksa sepeda motor Anda!');
      }
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
});

// Telegram Bot
const bot = new Telegraf(process.env.BOT_TOKEN);
const activeUsers = new Set();

bot.start((ctx) => {
  activeUsers.add(ctx.chat.id);
  ctx.reply('👋 Bot aktif. Menu:', {
    reply_markup: {
      keyboard: [['/lokasi', '/riwayat'], ['/alarm_mati', '/stop']],
      resize_keyboard: true
    }
  });
});

bot.command('stop', (ctx) => {
  activeUsers.delete(ctx.chat.id);
  ctx.reply('🛑 Bot dihentikan.', {
    reply_markup: {
      keyboard: [['/start']],
      resize_keyboard: true
    }
  });
});

bot.command('lokasi', async (ctx) => {
  if (!activeUsers.has(ctx.chat.id)) return;
  const latest = await GpsData.findOne().sort({ waktu: -1 });
  if (!latest) return ctx.reply('⚠️ Tidak ada data lokasi.');
  await ctx.reply(`📍 Lokasi terakhir:
🕒 ${latest.waktu.toLocaleString()}
📌 Lat: ${latest.latitude}, Long: ${latest.longitude}`);
  await ctx.replyWithLocation(latest.latitude, latest.longitude);
});

bot.command('riwayat', async (ctx) => {
  if (!activeUsers.has(ctx.chat.id)) return;
  const data = await GpsData.find().sort({ waktu: -1 }).limit(5);
  if (!data.length) return ctx.reply('⚠️ Tidak ada riwayat.');
  let msg = '📍 Riwayat Lokasi:\n\n';
  data.forEach((d, i) => {
    msg += `${i + 1}. Lat: ${d.latitude}, Long: ${d.longitude} 🕒 ${d.waktu.toLocaleString()}\n`;
  });
  ctx.reply(msg);
});

bot.command('alarm_mati', async (ctx) => {
  mqttClient.publish('esp32/alarm', 'false');
  ctx.reply('🔕 Alarm dimatikan.');
});

// Start bot
bot.launch()
  .then(() => console.log('🤖 Telegram Bot started'))
  .catch((err) => {
    if (err.description?.includes('Conflict')) {
      console.error('❗ Conflict: Bot sudah berjalan di tempat lain.');
    } else {
      console.error('❌ Bot Error:', err.message);
    }
  });

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
