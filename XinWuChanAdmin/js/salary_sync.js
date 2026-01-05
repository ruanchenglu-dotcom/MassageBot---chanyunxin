/**
 * --- PHIÊN BẢN MỚI: HỖ TRỢ BẢNG LƯƠNG DẠNG BLOCK (CỘT KÉP) ---
 */
async function syncDailySalary(dateStr, staffDataList) {
    try {
        console.log(`[SALARY] Bắt đầu xử lý cho ngày: ${dateStr}`);
        
        // 1. Lấy dòng tiêu đề TÊN NHÂN VIÊN (Dòng 1)
        const headerRes = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${SALARY_SHEET}!1:1` // Đọc toàn bộ dòng 1
        });
        const headers = headerRes.data.values ? headerRes.data.values[0] : [];
        if (headers.length === 0) { console.error('[SALARY] ❌ Lỗi: Không đọc được dòng 1 (Tên NV)'); return; }

        // 2. Tìm dòng chứa NGÀY cần ghi (Dựa vào cột A làm chuẩn)
        const dateRes = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${SALARY_SHEET}!A:A` // Đọc cột A
        });
        const dates = dateRes.data.values ? dateRes.data.values.map(r => r[0]) : [];
        
        // Tìm vị trí dòng của ngày này
        let rowIndex = dates.findIndex(d => d === dateStr);
        let actualRow = -1;

        if (rowIndex === -1) {
            console.log(`[SALARY] ⚠️ Không tìm thấy ngày ${dateStr} trong cột A. Sẽ bỏ qua.`);
            // Nếu bạn muốn tự tạo dòng mới ở cuối thì mở comment dòng dưới, nhưng với bảng form sẵn thì nên để báo lỗi.
            return; 
        } else {
            actualRow = rowIndex + 1; // Vì mảng bắt đầu từ 0, sheet bắt đầu từ 1
        }

        console.log(`[SALARY] Tìm thấy ngày ở dòng số: ${actualRow}`);

        // 3. Chuẩn bị dữ liệu ghi (Batch Update)
        const updates = [];

        staffDataList.forEach(staff => {
            // Tìm cột chứa tên nhân viên
            const colIndex = headers.indexOf(staff.name);
            
            if (colIndex > -1) {
                // Logic theo ảnh bạn gửi:
                // Tên NV ở cột A -> Sessions ở B (A+1), Oil ở C (A+2), Salary ở D (A+3)
                
                const colSessions = getColumnLetter(colIndex + 1); // Cột Tua
                const colOil = getColumnLetter(colIndex + 2);      // Cột Dầu
                const colSalary = getColumnLetter(colIndex + 3);   // Cột Lương

                // Ghi dữ liệu
                updates.push({ range: `${SALARY_SHEET}!${colSessions}${actualRow}`, values: [[staff.sessions]] });
                updates.push({ range: `${SALARY_SHEET}!${colOil}${actualRow}`, values: [[staff.oil]] });
                updates.push({ range: `${SALARY_SHEET}!${colSalary}${actualRow}`, values: [[staff.salary]] });
                
                console.log(`   -> Ghi cho ${staff.name}: Tua ${staff.sessions}, Dầu ${staff.oil}, Lương ${staff.salary}`);
            } else {
                console.log(`   ⚠️ Không tìm thấy tên "${staff.name}" trên dòng 1 của Sheet.`);
            }
        });

        if (updates.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: SHEET_ID,
                requestBody: {
                    valueInputOption: 'USER_ENTERED',
                    data: updates
                }
            });
            console.log(`[SALARY] ✅ Cập nhật thành công!`);
        } else {
            console.log('[SALARY] Không có dữ liệu nào được ghi.');
        }

    } catch (e) {
        console.error('[SALARY ERROR]', e);
    }
}