const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const moment = require('moment');
const path = require('path');

const app = express();
app.use(cors({ limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); 

const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error(err.message);
    console.log('✅ เชื่อมต่อฐานข้อมูลสำเร็จ');
});

// ตารางคลังอุปกรณ์ (เพิ่ม quantity เพื่อเก็บจำนวนชิ้น)
db.run(`CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    detail TEXT,
    quantity INTEGER DEFAULT 1
)`);

// อัปเดตตารางเก่าให้มีคอลัมน์ quantity (ถ้ายังไม่มี)
db.run(`ALTER TABLE inventory ADD COLUMN quantity INTEGER DEFAULT 1`, (err) => {});

// ตารางประวัติการยืม
db.run(`CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fullName TEXT,
    email TEXT,
    faculty TEXT,
    studentId TEXT,
    phone TEXT,
    items TEXT,
    borrowDate TEXT,
    returnDate TEXT,
    photoData TEXT,
    status TEXT,
    returnedAt TEXT
)`);

// อัปเดตตารางเก่าให้มีคอลัมน์ returnedAt (ถ้ายังไม่มี)
db.run(`ALTER TABLE records ADD COLUMN returnedAt TEXT`, (err) => {});

// ล็อกอิน Admin
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === 'tsu1234') {
        res.json({ success: true, token: 'TSU_ADMIN_TOKEN' });
    } else {
        res.status(401).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' });
    }
});

// ดึงรายการอุปกรณ์ (พร้อมคำนวณจำนวนคงเหลือ)
app.get('/api/items', (req, res) => {
    db.all(`SELECT * FROM inventory ORDER BY id DESC`, [], (err, items) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.all(`SELECT items FROM records WHERE status = 'pending'`, [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            const borrowed = rows.map(r => r.items);
            
            const result = items.map(item => {
                // นับว่าอุปกรณ์ชื่อนี้ถูกยืมไปแล้วกี่ครั้ง
                const borrowedCount = borrowed.filter(name => name === item.name).length;
                const qty = item.quantity || 1;
                const availableCount = qty - borrowedCount;
                
                return {
                    id: item.id,
                    name: item.name,
                    detail: item.detail,
                    quantity: qty,
                    isAvailable: availableCount > 0, // ถ้ายังเหลือมากกว่า 0 ชิ้น แปลว่าว่าง
                    availableCount: availableCount
                };
            });
            res.json(result);
        });
    });
});

// Admin: เพิ่มของ (รับค่า quantity ด้วย)
app.post('/api/inventory', (req, res) => {
    const { name, detail, quantity } = req.body;
    db.run(`INSERT INTO inventory (name, detail, quantity) VALUES (?, ?, ?)`, 
        [name, detail || '', quantity || 1], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

// Admin: ลบของ
app.delete('/api/inventory/:id', (req, res) => {
    db.run(`DELETE FROM inventory WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'tsumaterial69@gmail.com',
        pass: 'sxkatrtejqzgexvk'
    }
});
const adminEmail = 'ruttanapol.g@tsu.ac.th';

// ยืนยันการยืมของ
app.post('/api/borrow', (req, res) => {
    let { fullName, email, faculty, studentId, phone, items, borrowDate, returnDate, photoData } = req.body;
    const cleanEmail = email.trim(); 
    
    const sql = `INSERT INTO records (fullName, email, faculty, studentId, phone, items, borrowDate, returnDate, photoData, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`;
    
    db.run(sql, [fullName, cleanEmail, faculty, studentId || '-', phone, items, borrowDate, returnDate, photoData], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        res.json({ success: true });
        
        transporter.sendMail({
            from: 'tsumaterial69@gmail.com', 
            to: adminEmail,               
            cc: cleanEmail,                    
            subject: '🔔 [ระบบยืมของ] มีคำขอยืมอุปกรณ์ใหม่ - ฝ่ายกิจการนิสิต สำนักงานมหาวิทยาลัย',
            html: `<div style="padding: 20px; background: #f4f6f9; border-radius: 10px; font-family: sans-serif;">
                    <h2 style="color: #0b3d6e;">รายละเอียดคำขอยืมอุปกรณ์</h2>
                    <p><b>ผู้ยืม:</b> ${fullName} (${faculty})</p>
                    <p><b>รหัสนิสิต/บุคลากร:</b> ${studentId || '-'}</p>
                    <p><b>เบอร์โทรติดต่อ:</b> ${phone}</p>
                    <p><b>อีเมลผู้ยืม:</b> ${cleanEmail}</p>
                    <hr>
                    <p><b>รายการที่ยืม:</b> <span style="color: #d9534f; font-weight: bold;">${items}</span></p>
                    <p><b>วันที่ทำรายการ:</b> ${borrowDate}</p>
                    <p><b>กำหนดคืน:</b> <span style="color: #0b3d6e; font-weight: bold;">${returnDate}</span></p>
                </div>`
        }).then(() => {
            console.log("✅ ส่งอีเมลแจ้งเตือนเบื้องหลังสำเร็จ");
        }).catch(err => {
            console.error("❌ ส่งอีเมลเบื้องหลังไม่ผ่าน:", err.message);
        });
    });
});

app.get('/api/records', (req, res) => {
    db.all(`SELECT * FROM records ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Admin กดรับคืน 
app.put('/api/return/:id', (req, res) => {
    const returnedTime = new Date().toISOString();
    db.run(`UPDATE records SET status = 'returned', returnedAt = ? WHERE id = ?`, [returnedTime, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ==========================================
// ระบบทำงานอัตโนมัติ (Cron Jobs)
// ==========================================

// 1. ระบบลบประวัติ 24 ชม. 
cron.schedule('0 * * * *', () => {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    db.run(`DELETE FROM records WHERE status = 'returned' AND returnedAt < ?`, [twentyFourHoursAgo], function(err) {
        if (err) console.error("❌ Error auto-deleting:", err.message);
        else if (this.changes > 0) console.log(`🗑️ ลบประวัติการคืนที่เกิน 24 ชม. อัตโนมัติสำเร็จจำนวน ${this.changes} รายการ`);
    });
});

// 2. แจ้งเตือนอีเมลทวงของ 
cron.schedule('0 8 * * *', () => {
    const today = moment().format('YYYY-MM-DD');
    const tomorrow = moment().add(1, 'days').format('YYYY-MM-DD');

    db.all(`SELECT * FROM records WHERE status = 'pending'`, [], (err, rows) => {
        if (err) return;
        rows.forEach(record => {
            if (record.returnDate === tomorrow) {
                transporter.sendMail({
                    from: 'tsumaterial69@gmail.com', 
                    to: record.email,             
                    cc: adminEmail,               
                    subject: '⚠️ แจ้งเตือน: อุปกรณ์เตรียมครบกำหนดคืนพรุ่งนี้',
                    html: `<p>เรียน คุณ ${record.fullName},</p>
                           <p>ขอแจ้งเตือนว่าอุปกรณ์ (<b>${record.items}</b>) ที่ท่านได้ยืมไป จะครบกำหนดคืนในวันพรุ่งนี้ (${record.returnDate})</p>
                           <p>กรุณาเตรียมนำอุปกรณ์มาคืนที่ฝ่ายกิจการนิสิต สำนักงานมหาวิทยาลัย ขอบคุณครับ</p>`
                }).catch(console.error);
            }
            
            if (record.returnDate === today) {
                transporter.sendMail({
                    from: 'tsumaterial69@gmail.com', 
                    to: record.email,             
                    cc: adminEmail,               
                    subject: '🚨 ด่วนที่สุด: วันนี้ครบกำหนดคืนอุปกรณ์',
                    html: `<p style="color:red;">เรียน คุณ ${record.fullName},</p>
                           <p>วันนี้เป็นวันครบกำหนดคืนอุปกรณ์ (<b>${record.items}</b>)</p>
                           <p>กรุณานำอุปกรณ์มาคืนที่ฝ่ายกิจการนิสิต สำนักงานมหาวิทยาลัยภายในเวลาทำการของวันนี้ ขอบคุณครับ</p>`
                }).catch(console.error);
            }
        });
    });
});

app.listen(3000, () => console.log('🚀 TSU Server running at http://localhost:3000'));
