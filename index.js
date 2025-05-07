const express = require('express');
const cron = require('node-cron');
const db = require('./db');
const sendTelegram = require('./sendTelegram'); // ตรวจสอบชื่อไฟล์ให้ตรง
require('dotenv').config();

const app = express();
const PORT = 3000;

// 🔧 ฟังก์ชันแปลงวันที่เป็น d-m-yyyy แบบไทย
function formatThaiDMY(isoDateStr) {
  const date = new Date(isoDateStr);
  const day = date.getDate();
  const month = String(date.getMonth() + 1);
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

// 🔧 ฟังก์ชันหาวันปัจจุบันในรูปแบบ yyyy-mm-dd แบบ พ.ศ.
function getTodayInThaiDate() {
  const today = new Date();
  const yyyy = today.getFullYear() + 543; // แปลงเป็น พ.ศ.
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// 🧠 ฟังก์ชันหลักสำหรับดึงข้อมูลและส่ง Telegram
async function checkBookingAndNotify() {
  try {
    const todayStr = getTodayInThaiDate();
    const [rows] = await db.query(`
      SELECT b.booking_id, r.name as roomName, u.name, b.subject,
             b.startDate, b.endDate, b.startTime, b.endTime
      FROM prefix_r_bookings b
      LEFT JOIN prefix_r_room r ON r.room_id = b.room_id
      LEFT JOIN opduser u on u.loginname = b.organization_id
      WHERE b.startDate = ?`, [todayStr]);

    console.log('📥 ผลลัพธ์จากฐานข้อมูล:', rows);

    if (rows.length > 0) {
      let message = `📢 พบ ${rows.length} รายการจองห้องประชุมประจำวันที่ ${formatThaiDMY(todayStr)}:\n\n`;

      rows.forEach((row, i) => {
        message += `📌 รายการที่ ${i + 1}
📝 เรื่อง: ${row.subject}
🏢 ห้อง: ${row.roomName}
🕒 เวลา: ${row.startTime} น. - ${row.endTime} น.
📅 วันที่: ${formatThaiDMY(row.startDate)} ถึง ${formatThaiDMY(row.endDate)}
👤 ผู้จอง: ${row.name}

`;
      });

      await sendTelegram(message);
    }

  } catch (err) {
    console.error('❌ เกิดข้อผิดพลาดใน checkBookingAndNotify:', err);
  }
}

// 📅 ตั้งเวลาให้ทำงานอัตโนมัติทุกวัน
cron.schedule('0 8 * * *', () => {
  console.log('🔔 เริ่มตรวจสอบตอน 08:00');
  checkBookingAndNotify();
});
cron.schedule('30 12 * * *', () => {
  console.log('🔔 เริ่มตรวจสอบตอน 12:30');
  checkBookingAndNotify();
});

// 🔗 เส้นทาง API manual ตรวจสอบได้เอง
app.get('/check', async (req, res) => {
  await checkBookingAndNotify();
  res.json({ message: 'Checked and notified (manual)' });
});

// ▶️ เริ่มเซิร์ฟเวอร์
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
