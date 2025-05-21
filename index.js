import mqtt from 'mqtt';
import mongoose from 'mongoose';
import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';

dotenv.config();

// --- MongoDB Setup ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err.message));

const GpsData = mongoose.model('GpsData', new mongoose.Schema({
  latitude: Number,
  longitude: Number,
  waktu: { type: Date, default: Date.now }
}));

// --- MQTT Setup (HiveMQ) ---
const client = mqtt.connect({
  host: process.env.MQTT_HOST,
  port: 8883,
  protocol: 'mqtts',
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD
});

client.on('connect', () => {
  console.log('📡 Connected to MQTT Broker');
  client.subscribe('esp32/gps');
});

client.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
      await new GpsData(data).save();
      console.log('✅ GPS data saved:', data);
    } else {
      throw new Error('Invalid GPS format');
    }
  } catch (err) {
    console.error('❌ MQTT Error:', err.message);
  }
});

// --- Telegram Bot Setup ---
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.command('lokasi', async (ctx) => {
  const data = await GpsData.findOne().sort({ waktu: -1 });
  if (!data) return ctx.reply('⚠️ Tidak ada data lokasi');
  return ctx.replyWithLocation(data.latitude, data.longitude);
});

bot.command('riwayat', async (ctx) => {
  const data = await GpsData.find().sort({ waktu: -1 }).limit(5);
  if (!data.length) return ctx.reply('⚠️ Tidak ada riwayat lokasi');
  let msg = '📍 Riwayat Lokasi:\n\n';
  data.forEach((d, i) => {
    msg += `${i + 1}. Lat: ${d.latitude}, Long: ${d.longitude}, 🕒 ${d.waktu.toLocaleString()}\n`;
  });
  ctx.reply(msg);
});

bot.launch().then(() => console.log('🤖 Telegram Bot ready'));
