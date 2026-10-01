document.addEventListener('DOMContentLoaded', () => {
    
    // 1. หน้า Login
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = document.getElementById('adminPassword').value;
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const data = await res.json();
            if (data.success) {
                localStorage.setItem('tsu_auth', data.token);
                window.location.href = 'admin.html';
            } else {
                Swal.fire('ข้อผิดพลาด', 'รหัสผ่านไม่ถูกต้อง', 'error');
            }
        });
    }

    // 2. หน้า Index (หน้าแรก)
    const itemGrid = document.getElementById('itemGrid');
    if (itemGrid) {
        loadFrontendEquipment();
        loadSavedUserInfo(); 
        
        const returnDateInput = document.getElementById('returnDate');
        if(returnDateInput) returnDateInput.min = new Date().toISOString().split('T')[0];

        // ระบบอัปโหลดและบีบอัดรูปภาพอัตโนมัติ
        const photoInput = document.getElementById('itemPhoto');
        let selectedFileBase64 = "";

        photoInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if(file) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    const img = new Image();
                    img.onload = function() {
                        const canvas = document.createElement('canvas');
                        const MAX_WIDTH = 800;
                        const scaleSize = MAX_WIDTH / img.width;
                        canvas.width = MAX_WIDTH;
                        canvas.height = img.height * scaleSize;

                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                        selectedFileBase64 = canvas.toDataURL('image/jpeg', 0.7);
                        
                        document.getElementById('photoPreview').src = selectedFileBase64;
                        document.getElementById('photoPreviewContainer').style.display = 'block';
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
            }
        });

        // ส่งข้อมูล
        document.getElementById('borrowForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            if(!selectedFileBase64) {
                Swal.fire('เตือน', 'กรุณาแนบรูปถ่าย', 'warning');
                return;
            }

            saveUserInfo();
            Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            // ตรวจสอบว่าเลือก "อื่นๆ" หรืออุปกรณ์ปกติ
            const selectedItemValue = document.getElementById('selectedItemName').value;
            let finalItemName = selectedItemValue;

            if (selectedItemValue === 'other') {
                const oName = document.getElementById('otherItemName').value;
                const oQty = document.getElementById('otherItemQty').value;
                finalItemName = `${oName} (จำนวน: ${oQty} ชิ้น)`;
            }

            const formData = {
                fullName: document.getElementById('fullName').value,
                email: document.getElementById('email').value,
                faculty: document.getElementById('faculty').value,
                studentId: document.getElementById('studentId').value,
                phone: document.getElementById('phone').value,
                items: finalItemName,
                borrowDate: new Date().toISOString().split('T')[0],
                returnDate: document.getElementById('returnDate').value,
                photoData: selectedFileBase64
            };

            try {
                const res = await fetch('/api/borrow', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                
                if(res.ok) {
                    Swal.fire('สำเร็จ', 'ส่งข้อมูลเรียบร้อย', 'success').then(() => {
                        cancelBorrow();
                        loadFrontendEquipment();
                    });
                } else {
                    Swal.fire('ข้อผิดพลาด', 'ส่งข้อมูลไม่สำเร็จ', 'error');
                }
            } catch (err) {
                Swal.fire('Error', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์', 'error');
            }
        });
    }

    // 3. หน้า Admin
    if (document.getElementById('inventoryTableBody')) {
        loadAdminData();
    }
});

function saveUserInfo() {
    localStorage.setItem('tsu_name', document.getElementById('fullName').value);
    localStorage.setItem('tsu_email', document.getElementById('email').value);
    localStorage.setItem('tsu_faculty', document.getElementById('faculty').value);
    localStorage.setItem('tsu_studentId', document.getElementById('studentId').value);
    localStorage.setItem('tsu_phone', document.getElementById('phone').value);
}

function loadSavedUserInfo() {
    if(localStorage.getItem('tsu_name')) document.getElementById('fullName').value = localStorage.getItem('tsu_name');
    if(localStorage.getItem('tsu_email')) document.getElementById('email').value = localStorage.getItem('tsu_email');
    if(localStorage.getItem('tsu_faculty')) document.getElementById('faculty').value = localStorage.getItem('tsu_faculty');
    if(localStorage.getItem('tsu_studentId')) document.getElementById('studentId').value = localStorage.getItem('tsu_studentId');
    if(localStorage.getItem('tsu_phone')) document.getElementById('phone').value = localStorage.getItem('tsu_phone');
}

// หน้าแรก: โหลดรายการอุปกรณ์ + เพิ่มปุ่ม "อื่นๆ" อัตโนมัติ
async function loadFrontendEquipment() {
    const itemGrid = document.getElementById('itemGrid');
    const res = await fetch('/api/items');
    const items = await res.json();
    itemGrid.innerHTML = '';

    items.forEach(item => {
        const statusClass = item.isAvailable ? 'status-avail' : 'status-busy';
        const cardClass = item.isAvailable ? 'card-avail' : 'card-busy';
        
        // ถ้าฐานข้อมูลส่ง availableCount มาให้ จะแสดงจำนวนที่เหลือด้วย
        const qtyText = item.availableCount !== undefined ? `(เหลือ ${item.availableCount} ชิ้น)` : '';
        const statusText = item.isAvailable ? `ว่างพร้อมยืม ${qtyText}` : 'ถูกยืมไปแล้ว';
        const btnState = item.isAvailable ? '' : 'disabled';
        
        itemGrid.innerHTML += `
            <div class="item-card ${cardClass}" style="padding:20px; background:white; border-radius:12px; box-shadow:0 2px 10px rgba(0,0,0,0.05); display:flex; flex-direction:column; justify-content:space-between;">
                <div>
                    <h3 style="color:#0b3d6e; font-size:1.2rem;">${item.name}</h3>
                    <p style="color:#555; font-size:0.9rem; margin-top:5px; margin-bottom:15px;">${item.detail || '-'}</p>
                </div>
                <div>
                    <div class="badge-status ${statusClass}" style="margin-bottom:10px; display:inline-block;">${statusText}</div>
                    <button class="btn-borrow" ${btnState} onclick="selectItemToBorrow('${item.name}')">ขอยืม</button>
                </div>
            </div>
        `;
    });

    // เพิ่มการ์ด "อื่นๆ (ระบุเอง)" ต่อท้ายเสมอ
    itemGrid.innerHTML += `
        <div class="item-card card-avail" style="padding:20px; background:white; border-radius:12px; box-shadow:0 2px 10px rgba(0,0,0,0.05); display:flex; flex-direction:column; justify-content:space-between;">
            <div>
                <h3 style="color:#0b3d6e; font-size:1.2rem;">อื่นๆ (ระบุเอง)</h3>
                <p style="color:#555; font-size:0.9rem; margin-top:5px; margin-bottom:15px;">ต้องการยืมอุปกรณ์นอกเหนือจากรายการที่มี</p>
            </div>
            <div>
                <button class="btn-borrow" onclick="selectItemToBorrow('other')">ขอยืมรายการนี้</button>
            </div>
        </div>
    `;
}

// จัดการการเลือกอุปกรณ์ (แสดงช่องพิมพ์ข้อความและจำนวน ถ้ากดเลือก "อื่นๆ")
function selectItemToBorrow(name) {
    const otherContainer = document.getElementById('otherItemContainer');
    const otherName = document.getElementById('otherItemName');
    const otherQty = document.getElementById('otherItemQty');

    if (name === 'other') {
        document.getElementById('selectedItemName').value = 'other';
        document.getElementById('selectedItemTitle').innerText = 'กำลังเลือก: ระบุอุปกรณ์เอง';
        
        // แสดงฟิลด์และบังคับกรอก (required)
        if(otherContainer) otherContainer.style.display = 'block';
        if(otherName) otherName.required = true;
        if(otherQty) otherQty.required = true;
    } else {
        document.getElementById('selectedItemName').value = name;
        document.getElementById('selectedItemTitle').innerText = 'กำลังเลือก: ' + name;
        
        // ซ่อนฟิลด์และยกเลิกการบังคับกรอก
        if(otherContainer) otherContainer.style.display = 'none';
        if(otherName) { otherName.required = false; otherName.value = ''; }
        if(otherQty) { otherQty.required = false; otherQty.value = ''; }
    }
    
    document.getElementById('borrowSection').style.display = 'block';
    document.getElementById('borrowSection').scrollIntoView({ behavior: 'smooth' });
}

function cancelBorrow() {
    document.getElementById('borrowSection').style.display = 'none';
    document.getElementById('borrowForm').reset();
    document.getElementById('photoPreviewContainer').style.display = 'none';
    
    const otherContainer = document.getElementById('otherItemContainer');
    const otherName = document.getElementById('otherItemName');
    const otherQty = document.getElementById('otherItemQty');

    if(otherContainer) otherContainer.style.display = 'none';
    if(otherName) otherName.required = false;
    if(otherQty) otherQty.required = false;

    loadSavedUserInfo();
}

// โหลดตารางฝั่ง Admin
async function loadAdminData() {
    const invRes = await fetch('/api/items');
    const items = await invRes.json();
    const invBody = document.getElementById('inventoryTableBody');
    invBody.innerHTML = '';
    
    items.forEach(i => {
        // แสดงจำนวนในวงเล็บ (ถ้ามีข้อมูลจากหลังบ้าน)
        const qtyDisplay = i.quantity ? ` <small style="color:#666;">(ทั้งหมด ${i.quantity} ชิ้น)</small>` : '';
        invBody.innerHTML += `
            <tr>
                <td><b>${i.name}</b>${qtyDisplay}</td>
                <td>${i.detail || '-'}</td>
                <td style="text-align: center;"><button class="btn-del" onclick="deleteItem(${i.id})">ลบ</button></td>
            </tr>
        `;
    });

    const recRes = await fetch('/api/records');
    const records = await recRes.json();
    const recBody = document.getElementById('recordsTableBody');
    recBody.innerHTML = '';
    
    records.forEach(r => {
        let badge = 'pending', text = 'กำลังยืม';
        if (r.status === 'returned') { badge = 'returned'; text = 'คืนแล้ว'; }
        
        const btnReturn = r.status !== 'returned' 
            ? `<button class="btn-action" onclick="returnItem(${r.id})">รับคืน</button>` 
            : '-';

        recBody.innerHTML += `
            <tr>
                <td><b>${r.fullName}</b><br><small>${r.faculty}</small></td>
                <td>${r.items}</td>
                <td>ยืม: ${r.borrowDate}<br>คืน: ${r.returnDate}</td>
                <td><a href="${r.photoData}" target="_blank"><img src="${r.photoData}" width="60" style="border-radius:4px;"></a></td>
                <td><span class="badge ${badge}">${text}</span></td>
                <td>${btnReturn}</td>
            </tr>
        `;
    });
}

// แอดมินเพิ่มอุปกรณ์ (เพิ่มช่องรับค่าจำนวน)
async function openAddItemModal() {
    const { value: formValues } = await Swal.fire({
        title: 'เพิ่มอุปกรณ์ใหม่',
        html: `
            <input id="swal-name" class="swal2-input" placeholder="ชื่ออุปกรณ์">
            <input id="swal-detail" class="swal2-input" placeholder="รายละเอียด">
            <input id="swal-qty" type="number" class="swal2-input" placeholder="จำนวนทั้งหมด (เช่น 1, 5, 10)" min="1" value="1">
        `,
        showCancelButton: true,
        confirmButtonText: 'บันทึก',
        preConfirm: () => {
            const name = document.getElementById('swal-name').value;
            const detail = document.getElementById('swal-detail').value;
            const quantity = document.getElementById('swal-qty').value;
            if(!name) { Swal.showValidationMessage('ใส่ชื่ออุปกรณ์ด้วยครับ'); return false; }
            return { name, detail, quantity: parseInt(quantity) || 1 };
        }
    });

    if (formValues) {
        const res = await fetch('/api/inventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formValues)
        });
        if(res.ok) {
            Swal.fire('สำเร็จ', 'เพิ่มเข้าสู่ระบบแล้ว', 'success');
            loadAdminData(); // อัปเดตตารางแอดมินทันที
        }
    }
}

async function deleteItem(id) {
    if(confirm('ลบอุปกรณ์นี้หรือไม่?')) {
        await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
        loadAdminData();
    }
}

async function returnItem(id) {
    await fetch(`/api/return/${id}`, { method: 'PUT' });
    Swal.fire('สำเร็จ', 'รับคืนแล้ว', 'success');
    loadAdminData();
}

window.logout = function() {
    localStorage.removeItem('tsu_auth');
    window.location.href = 'login.html';
}
