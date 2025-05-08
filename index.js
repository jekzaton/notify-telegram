const express = require('express');
const cron = require('node-cron');
const db = require('./db');
const sendTelegram = require('./sendTelegram');
require('dotenv').config();

const app = express();
const PORT = 3000;

// ตัวแปรเก็บ booking_id ล่าสุด (ใช้สำหรับ real-time)
let lastBookingId = 0;

// ฟังก์ชันแปลงวันที่เป็น d-m-yyyy แบบไทย
function formatThaiDMY(isoDateStr) {
  const date = new Date(isoDateStr);
  const day = date.getDate();
  const month = String(date.getMonth() + 1);
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

// ฟังก์ชันหาวันปัจจุบันในรูปแบบ yyyy-mm-dd แบบ พ.ศ.
function getTodayInThaiDate() {
  const today = new Date();
  const yyyy = today.getFullYear() + 543; // แปลงเป็น พ.ศ.
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ✅ แจ้งเตือนแบบกำหนดเวลา (เช็คเฉพาะวันนี้)
async function checkBookingAndNotify() {
  try {
    const todayStr = getTodayInThaiDate();
    const [rows] = await db.query(`
      SELECT b.booking_id, r.name as roomName, u.name, b.subject,
             b.startDate, b.endDate, b.startTime, b.endTime
      FROM prefix_r_bookings b
      LEFT JOIN prefix_r_room r ON r.room_id = b.room_id
      LEFT JOIN opduser u on u.loginname = b.organization_id
      WHERE b.startDate = ? AND b.endTime >= CURRENT_TIME
    `, [todayStr]);

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

// ✅ แจ้งเตือนแบบ Real-time (เช็คว่ามี booking_id ใหม่เข้ามาหรือไม่)
async function watchNewBookings() {
  try {
    const [rows] = await db.query(`
      SELECT b.booking_id, r.name as roomName, u.name, b.subject,
             b.startDate, b.endDate, b.startTime, b.endTime
      FROM prefix_r_bookings b
      LEFT JOIN prefix_r_room r ON r.room_id = b.room_id
      LEFT JOIN opduser u on u.loginname = b.organization_id
      WHERE b.booking_id > ?
      ORDER BY b.booking_id ASC
    `, [lastBookingId]);

    if (rows.length > 0) {
      for (const row of rows) {
        const message = `📌 พบการจองห้องใหม่!
📝 เรื่อง: ${row.subject}
🏢 ห้อง: ${row.roomName}
🕒 เวลา: ${row.startTime} น. - ${row.endTime} น.
📅 วันที่: ${formatThaiDMY(row.startDate)} ถึง ${formatThaiDMY(row.endDate)}
👤 ผู้จอง: ${row.name}`;
        await sendTelegram(message);
        lastBookingId = row.booking_id;
      }
    }

  } catch (err) {
    console.error('❌ watchNewBookings error:', err);
  }
}

// เรียกครั้งแรกเพื่อโหลด booking_id ล่าสุดจากฐานข้อมูล
async function initLastBookingId() {
  try {
    const [rows] = await db.query('SELECT MAX(booking_id) as maxId FROM prefix_r_bookings');
    lastBookingId = rows[0].maxId || 0;
    console.log('🔁 เริ่มตรวจสอบจาก booking_id ล่าสุด:', lastBookingId);
  } catch (err) {
    console.error('❌ ไม่สามารถโหลด booking_id ล่าสุด:', err);
  }
}

// ตั้งเวลาแจ้งเตือนประจำวัน
cron.schedule('0 8 * * *', () => {
  console.log('🔔 เริ่มตรวจสอบตอน 08:00');
  checkBookingAndNotify();
});
cron.schedule('30 12 * * *', () => {
  console.log('🔔 เริ่มตรวจสอบตอน 12:30');
  checkBookingAndNotify();
});

// เส้นทางตรวจสอบแบบ manual
app.get('/check', async (req, res) => {
  await checkBookingAndNotify();
  res.json({ message: 'Checked and notified (manual)' });
});

// เริ่มต้นเซิร์ฟเวอร์
app.listen(PORT, async () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  await initLastBookingId();             // โหลดค่า booking_id เริ่มต้น
  setInterval(watchNewBookings, 5000);   // ตรวจสอบรายการจองใหม่ทุก 5 วินาที
});
