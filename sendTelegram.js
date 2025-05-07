// sendTelegram.js
const axios = require('axios');
require('dotenv').config();

async function sendTelegram(message) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await axios.post(url, {
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: message,
    });
  } catch (err) {
    console.error('❌ Error sending Telegram message:', err.message);
  }
}

module.exports = sendTelegram;
