require('dotenv').config();
const mqtt = require('mqtt');
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error(err));

const SensorData = mongoose.model('SensorData', new mongoose.Schema({
  suhu: Number,
  kelembaban: Number,
  waktu: { type: Date, default: Date.now }
}));

const client = mqtt.connect(process.env.MQTT_BROKER);

client.on('connect', () => {
  client.subscribe(process.env.MQTT_TOPIC || 'esp32/sensor');
  console.log('MQTT connected & subscribed');
});

client.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    await new SensorData(data).save();
    console.log('Data saved:', data);
  } catch (e) {
    console.error('Failed to save:', e.message);
  }
});
