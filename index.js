import dotenv from 'dotenv';
import mongoose from 'mongoose';
import mqtt from 'mqtt';

dotenv.config();

// --- 1. Connect MongoDB ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err.message));

// --- 2. MongoDB Schema ---
const SensorData = mongoose.model('SensorData', new mongoose.Schema({
  suhu: Number,
  kelembaban: Number,
  waktu: { type: Date, default: Date.now }
}));

// --- 3. Connect MQTT HiveMQ ---
const mqttOptions = {
  host: process.env.MQTT_HOST,
  port: 8883,
  protocol: 'mqtts',
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  rejectUnauthorized: false
};

const client = mqtt.connect(mqttOptions);

client.on('connect', () => {
  console.log('✅ MQTT connected to HiveMQ');
  const topic = process.env.MQTT_TOPIC || 'esp32/sensor';
  client.subscribe(topic, (err) => {
    if (err) console.error('❌ MQTT subscribe error:', err.message);
    else console.log(`📡 Subscribed to topic: ${topic}`);
  });
});

client.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    console.log('📥 Received from MQTT:', data);
    await new SensorData(data).save();
    console.log('✅ Data saved to MongoDB');
  } catch (err) {
    console.error('❌ Error processing message:', err.message);
  }
});
