const { GoogleSpreadsheet } = require('google-spreadsheet');
const creds = require('./path-to-your-json-key.json'); // Thay đường dẫn key của bạn
const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID'; // Thay ID Sheet của bạn

async function syncDailySalary(dateStr, staffDataList) {
    // dateStr: "2026/01/05"
    // staffDataList: [{ name: "王", sessions: 3, oil: 0, salary: 750 }, ...]

    const doc = new GoogleSpreadsheet(SHEET_ID);
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['SalaryLog']; 
    await sheet.loadCells(); // Load toàn bộ data để xử lý nhanh

    const rowCount = sheet.rowCount;
    const colCount = sheet.columnCount;
    let targetRow = -1;

    // 1. Tìm dòng chứa Ngày (Dựa vào cột A làm chuẩn)
    for (let r = 2; r < rowCount; r++) {
        const cellDate = sheet.getCell(r, 0).formattedValue; // Cột A
        if (cellDate === dateStr) {
            targetRow = r;
            break;
        }
    }

    if (targetRow === -1) {
        console.log(`❌ Không tìm thấy ngày ${dateStr} trong cột A`);
        return;
    }

    // 2. Duyệt qua từng nhân viên để điền số
    staffDataList.forEach(staff => {
        let staffCol = -1;
        // Tìm cột chứa tên nhân viên ở Dòng 1 (Header)
        for (let c = 0; c < colCount; c++) {
            const cellVal = sheet.getCell(0, c).value; // Row 0 là dòng tên
            if (cellVal === staff.name) {
                staffCol = c; // Tìm thấy cột neo của nhân viên
                break;
            }
        }

        // Logic điền: Dựa vào ảnh, Tên nằm trên 'Tổng tiết', nên:
        // Cột Tên - 1 = Cột Ngày
        // Cột Tên = Cột Tổng Tiết (Sessions)
        // Cột Tên + 1 = Cột Tinh Dầu (Oil)
        // Cột Tên + 2 = Cột Tổng Lương (Salary)
        
        if (staffCol !== -1) {
            sheet.getCell(targetRow, staffCol).value = staff.sessions;     // 總節數
            sheet.getCell(targetRow, staffCol + 1).value = staff.oil;      // 精油
            sheet.getCell(targetRow, staffCol + 2).value = staff.salary;   // 總薪資
        }
    });

    await sheet.saveUpdatedCells();
    console.log(`✅ Đã cập nhật lương ngày ${dateStr} thành công!`);
}

// Xuất hàm để dùng ở file khác
module.exports = { syncDailySalary };