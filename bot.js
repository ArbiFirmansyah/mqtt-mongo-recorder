import { Telegraf } from 'telegraf';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// --- Connect to MongoDB ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err.message));

// --- Define Schema ---
const GpsData = mongoose.model('GpsData', new mongoose.Schema({
  latitude: Number,
  longitude: Number,
  waktu: { type: Date, default: Date.now }
}));

// --- Create Telegram Bot ---
const bot = new Telegraf(process.env.BOT_TOKEN);

// --- Command: /lokasi (terakhir) ---
bot.command('lokasi', async (ctx) => {
  const data = await GpsData.findOne().sort({ waktu: -1 });
  if (!data) {
    return ctx.reply('⚠️ Tidak ada data lokasi');
  }

  return ctx.replyWithLocation(data.latitude, data.longitude);
});

// --- Command: /riwayat (list) ---
bot.command('riwayat', async (ctx) => {
  const data = await GpsData.find().sort({ waktu: -1 }).limit(5);
  if (!data.length) {
    return ctx.reply('⚠️ Tidak ada riwayat lokasi');
  }

  let msg = '📍 Riwayat Lokasi Terakhir:\n\n';
  data.forEach((d, i) => {
    msg += `${i + 1}. Lat: ${d.latitude}, Lng: ${d.longitude}, 🕒 ${d.waktu.toLocaleString()}\n`;
  });

  return ctx.reply(msg);
});

// --- Start Bot ---
bot.launch().then(() => {
  console.log('🤖 Telegram bot started');
});
