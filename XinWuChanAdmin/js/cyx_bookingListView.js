// File: js/bookingListView.js
// Component chuyên quản lý giao diện danh sách đặt lịch (Tab Danh sách)
// Cập nhật V125: Chế độ chỉnh sửa trực tiếp (Inline Editing) giống Excel & Sửa lỗi hiển thị SĐT.
// Cập nhật V126: Đồng bộ hóa trạng thái với hằng số toàn cục BOOKING_STATUS (Single Source of Truth).
// Giao diện Tiếng Trung Phồn Thể 100%.

(function () {
    const { useState, useEffect } = React;

    const BookingListView = ({ bookings, onCancelBooking, onInlineUpdate, staffList }) => {
        // Đảm bảo bookings luôn là mảng an toàn
        const safeBookings = Array.isArray(bookings) ? bookings : [];

        // State quản lý Inline Editing
        const [editingRowId, setEditingRowId] = useState(null);
        const [editFormData, setEditFormData] = useState({});
        const [scanStatus, setScanStatus] = useState(null);
        const [scanMessage, setScanMessage] = useState('');

        // Lấy dữ liệu cấu hình từ window (do data.js cung cấp)
        const servicesList = window.SERVICES_LIST || [
            "🔥 招牌套餐 (100分)", "🔥 招牌套餐 (130分)",
            "👣 足底按摩 (60分)", "👣 足底按摩 (90分)",
            "🛏️ 身體指壓 (60分)", "🛏️ 身體指壓 (90分)"
        ];

        // Đồng bộ hệ thống trạng thái từ data.js (Fallback nếu file data chưa load kịp)
        const STATUS = window.BOOKING_STATUS || {
            WAITING: '等待中',
            SERVING: '服務中',
            COMPLETED: '已完成',
            CANCELLED: '已取消',
            NOSHOW: '爽約'
        };

        // Danh sách trạng thái chuẩn cho Dropdown trong chế độ Edit
        const statusOptions = Object.values(STATUS);

        // Tính toán maxPax linh hoạt
        const config = window.SYSTEM_CONFIG || { SCALE: {} };
        const maxChairs = (config.SCALE && config.SCALE.MAX_CHAIRS) || config.MAX_CHAIRS || 6;
        const maxBeds = (config.SCALE && config.SCALE.MAX_BEDS) || config.MAX_BEDS || 6;
        const dynamicMaxPax = maxChairs + maxBeds;

        // Kích hoạt chế độ chỉnh sửa cho một dòng
        const startEditing = (booking) => {
            setEditingRowId(booking.rowId);
            setScanStatus(null);
            setScanMessage('');

            // Xử lý tách chuỗi để hiển thị trên form cho đúng (Ngày và Giờ)
            const dateTimeParts = (booking.startTimeString || ' ').split(' ');
            const datePart = dateTimeParts[0].replace(/\//g, '-'); // Format YYYY-MM-DD cho input date
            const timePart = dateTimeParts[1] ? dateTimeParts[1].substring(0, 5) : '12:00'; // Format HH:MM

            // Xử lý tách chuỗi tên (bỏ phần (1/2) nếu có)
            const rawName = booking.customerName || '';
            const cleanName = rawName.split('(')[0].trim();

            // SỬA LỖI SỐ ĐIỆN THOẠI: Lấy trực tiếp từ các trường phone/sdt
            const realPhone = booking.phone || booking.sdt || booking.custPhone || '';

            setEditFormData({
                date: datePart,
                time: timePart,
                name: cleanName,
                service: booking.serviceName || '',
                isOil: booking.isOil || (booking.serviceName || '').includes('油'),
                isGuaSha: booking.isGuaSha === true || booking.isGuaSha === 'Yes',
                phone: realPhone,
                status: booking.status || STATUS.WAITING,
                staff: booking.staffId || '隨機'
            });
        };

        // Hủy bỏ chế độ chỉnh sửa
        const cancelEditing = () => {
            setEditingRowId(null);
            setEditFormData({});
            setScanStatus(null);
            setScanMessage('');
        };

        // Xử lý thay đổi dữ liệu trong ô input
        const handleInputChange = (field, value) => {
            setEditFormData(prev => ({ ...prev, [field]: value }));
            setScanStatus(null);
            setScanMessage('');
        };

        // Hàm kiểm tra khả dụng (Strict Scan)
        const performStrictCheck = () => {
            const getMins = (timeStr) => {
                if (!timeStr) return 0;
                const [h, m] = timeStr.split(':').map(Number);
                let totalMins = (h * 60) + m;
                const openHour = window.SYSTEM_CONFIG?.OPERATION_TIME?.OPEN_HOUR || 5;
                if (h < openHour) totalMins += 1440;
                return totalMins;
            };
            const getDuration = (serviceName) => {
                if (!serviceName) return 60;
                const match = serviceName.match(/(190|180|130|120|100|90|70|60|50|45|40|30)/);
                if (match) return parseInt(match[0], 10);
                return 60;
            };

            const startMins = getMins(editFormData.time);
            const duration = getDuration(editFormData.service);
            const endMins = startMins + duration;

            // Lọc ra các booking của ngày đang sửa (Bỏ qua chính nó)
            const todays = safeBookings.filter(b => {
                if (b.rowId === editingRowId) return false;
                const bStatus = b.status || '';
                const isCancelled = bStatus === STATUS.CANCELLED || bStatus.includes('取消') || bStatus.includes('Cancel');
                const isNoShow = bStatus === STATUS.NOSHOW || bStatus.includes('爽約') || bStatus.toUpperCase().includes('NOSHOW');
                const isDone = bStatus === STATUS.COMPLETED || bStatus.includes('完成') || bStatus.includes('✅');
                
                return !isCancelled && !isNoShow && !isDone;
            });

            // 1. Staff Capacity Check
            const totalStaffCapacity = (staffList || []).length;
            let maxConcurrency = 0;
            
            for (let t = startMins; t < endMins; t += 5) {
                let currentLoad = 0;
                todays.forEach(b => {
                    const bTimeStr = (b.startTimeString || ' ').split(' ')[1] || '00:00';
                    const bStart = getMins(bTimeStr);
                    const bEnd = bStart + getDuration(b.serviceName);
                    if (t >= bStart && t < bEnd) {
                        currentLoad += (parseInt(b.pax, 10) || 1);
                    }
                });
                // Current editing row (assuming 1 pax per row in list view, or we should use editFormData.pax if we add it, for now assume 1 as it is single row edit)
                const currentBookingObj = safeBookings.find(b => b.rowId === editingRowId);
                const currentPax = currentBookingObj ? (parseInt(currentBookingObj.pax, 10) || 1) : 1;
                const totalLoadAtT = currentLoad + currentPax;
                if (totalLoadAtT > maxConcurrency) maxConcurrency = totalLoadAtT;
            }

            if (maxConcurrency > totalStaffCapacity) {
                setScanStatus('FAILED');
                setScanMessage(`❌ 技師不足`);
                return;
            }

            // 2. Resource Check
            let chairOccupied = 0;
            let bedOccupied = 0;
            todays.forEach(b => {
                const bTimeStr = (b.startTimeString || ' ').split(' ')[1] || '00:00';
                const bStart = getMins(bTimeStr);
                const bEnd = bStart + getDuration(b.serviceName);
                if (startMins < bEnd && endMins > bStart) {
                    const bPax = parseInt(b.pax, 10) || 1;
                    if ((b.serviceName || '').includes('足') || b.type === 'CHAIR') chairOccupied += bPax;
                    else bedOccupied += bPax;
                    if (b.category === 'COMBO') { bedOccupied += bPax; chairOccupied += bPax; }
                }
            });

            const isChair = editFormData.service.includes('足');
            const currentBookingObj = safeBookings.find(b => b.rowId === editingRowId);
            const currentPax = currentBookingObj ? (parseInt(currentBookingObj.pax, 10) || 1) : 1;

            if (isChair && chairOccupied + currentPax > maxChairs) {
                setScanStatus('FAILED');
                setScanMessage("❌ 足底區客滿");
                return;
            } else if (!isChair && bedOccupied + currentPax > maxBeds) {
                setScanStatus('FAILED');
                setScanMessage("❌ 指壓區客滿");
                return;
            }

            // 3. Specific Staff Check
            const reqStaff = editFormData.staff;
            if (reqStaff && reqStaff !== '隨機' && reqStaff !== '男' && reqStaff !== '女' && reqStaff !== '男師' && reqStaff !== '女師') {
                const isStaffBooked = todays.some(b => {
                    const bTimeStr = (b.startTimeString || ' ').split(' ')[1] || '00:00';
                    const bStart = getMins(bTimeStr);
                    const bEnd = bStart + getDuration(b.serviceName);
                    const isTimeConflict = (startMins < bEnd && endMins > bStart);
                    
                    const staffCols = [b.serviceStaff, b.staffId, b.staffId2, b.staffId3, b.technician];
                    // Clean staff IDs for comparison
                    const cleanReqStaff = (window.normalizeStaffId ? window.normalizeStaffId(reqStaff) : reqStaff.trim()).toUpperCase();
                    return isTimeConflict && staffCols.some(s => s && (window.normalizeStaffId ? window.normalizeStaffId(s) : s.trim()).toUpperCase() === cleanReqStaff);
                });

                if (isStaffBooked) {
                    setScanStatus('FAILED');
                    setScanMessage(`❌ 該技師時段忙碌`);
                    return;
                }
            }

            setScanStatus('OK');
            setScanMessage('✅ 檢查通過，可儲存');
        };

        // Gửi dữ liệu đã sửa lên Component Cha (app.js)
        const saveChanges = () => {
            if (!onInlineUpdate) {
                alert("設定錯誤：缺少父組件的 onInlineUpdate 函數。");
                cancelEditing();
                return;
            }

            // Đóng gói dữ liệu để gửi lên server
            const payload = {
                ngayDen: editFormData.date.replace(/-/g, '/'), // Chuyển lại về YYYY/MM/DD
                gioDen: editFormData.time,
                hoTen: editFormData.name,
                dichVu: editFormData.service,
                isOil: editFormData.isOil,
                isGuaSha: editFormData.isGuaSha,
                sdt: editFormData.phone,
                trangThai: editFormData.status,
                nhanVien: editFormData.staff
            };

            onInlineUpdate(editingRowId, payload);
            setEditingRowId(null); // Tắt chế độ chỉnh sửa ngay lập tức (Optimistic UI)
        };

        return (
            <div className="bg-white rounded-lg shadow-lg flex flex-col h-full animate-fadeIn border border-gray-200">
                <div className="overflow-auto relative w-full" style={{ maxHeight: '75vh' }}>
                    <table className="w-full text-left border-collapse min-w-max">
                        <thead className="bg-slate-100 text-slate-700 font-bold text-base sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-4 border-b border-slate-200 whitespace-nowrap">預約日期</th>
                                <th className="p-4 border-b border-slate-200 whitespace-nowrap">時間</th>
                                <th className="p-4 border-b border-slate-200 whitespace-nowrap">姓名</th>
                                <th className="p-4 border-b border-slate-200 whitespace-nowrap">項目</th>
                                <th className="p-4 border-b border-slate-200 text-center whitespace-nowrap">油推</th>
                                <th className="p-4 border-b border-slate-200 text-center whitespace-nowrap">刮痧</th>
                                <th className="p-4 border-b border-slate-200 whitespace-nowrap">電話</th>
                                <th className="p-4 border-b border-slate-200 whitespace-nowrap">狀態</th>
                                <th className="p-4 border-b border-slate-200 whitespace-nowrap">指定師傅</th>
                                <th className="p-4 border-b border-slate-200 text-center whitespace-nowrap sticky right-0 bg-slate-100 z-20">操作</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-200 text-base">
                            {safeBookings.map((b, index) => {
                                const isEditingThisRow = editingRowId === b.rowId;

                                // --- CHẾ ĐỘ HIỂN THỊ (VIEW MODE) ---
                                if (!isEditingThisRow) {
                                    const nameParts = (b.customerName || '').split('(');
                                    const name = nameParts[0].trim();

                                    // Hiển thị SĐT thật
                                    const realPhone = b.phone || b.sdt || b.custPhone || '';
                                    const isOil = (b.serviceName || '').includes('油') || (b.isOil === true);

                                    // LOGIC TRẠNG THÁI MỚI (Tương thích ngược với các record cũ)
                                    const bStatus = b.status || '';
                                    const isDone = bStatus === STATUS.COMPLETED || bStatus.includes('完成') || bStatus.includes('✅');
                                    const isCancelled = bStatus === STATUS.CANCELLED || bStatus.includes('取消') || bStatus.includes('Cancel');
                                    const isNoShow = bStatus === STATUS.NOSHOW || bStatus.includes('爽約') || bStatus.toUpperCase().includes('NOSHOW');
                                    const isServing = bStatus === STATUS.SERVING || bStatus.includes('服務') || bStatus.includes('Running');

                                    // Render màu sắc (Badge Color)
                                    let statusClass = 'bg-yellow-100 text-yellow-700 border border-yellow-200'; // Default: WAITING (等待中)
                                    if (isCancelled) statusClass = 'bg-red-100 text-red-700 border border-red-200';
                                    else if (isNoShow) statusClass = 'bg-orange-100 text-orange-700 border border-orange-200';
                                    else if (isDone) statusClass = 'bg-gray-200 text-gray-600 border border-gray-300';
                                    else if (isServing) statusClass = 'bg-green-100 text-green-700 border border-green-200';

                                    const rowBg = index % 2 === 0 ? 'bg-white' : 'bg-slate-50';
                                    const opacityClass = isDone ? 'opacity-60' : '';

                                    return (
                                        <tr
                                            key={`view-${b.rowId}`}
                                            className={`${rowBg} hover:bg-blue-50 transition-colors ${opacityClass}`}
                                            onDoubleClick={() => startEditing(b)}
                                            title="雙擊編輯 (Double click to edit)"
                                        >
                                            <td className="p-4 whitespace-nowrap font-mono text-gray-600">{(b.startTimeString || ' ').split(' ')[0]}</td>
                                            <td className="p-4 whitespace-nowrap font-mono text-lg font-bold text-indigo-700">{(b.startTimeString || ' ').split(' ')[1]}</td>
                                            <td className="p-4 whitespace-nowrap font-bold text-gray-800 text-lg">{name}</td>
                                            <td className="p-4 whitespace-nowrap text-gray-700 font-medium">{b.serviceName}</td>
                                            <td className="p-4 whitespace-nowrap text-center">{isOil ? <span className="text-purple-600 font-bold text-lg">💧</span> : ''}</td>
                                            <td className="p-4 whitespace-nowrap text-center">{b.isGuaSha ? <span className="text-red-500 font-bold text-lg">✅</span> : ''}</td>
                                            <td className="p-4 whitespace-nowrap font-mono text-gray-600">{realPhone}</td>
                                            <td className="p-4 whitespace-nowrap"><span className={`px-3 py-1 rounded-full text-sm font-bold shadow-sm ${statusClass}`}>{bStatus}</span></td>
                                            <td className="p-4 whitespace-nowrap"><span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded text-sm font-bold border border-indigo-100">{b.staffId}</span></td>

                                            <td className="p-4 whitespace-nowrap text-center sticky right-0 bg-opacity-90 z-10 space-x-2" style={{ backgroundColor: 'inherit' }}>
                                                <button onClick={() => startEditing(b)} className="text-blue-500 hover:text-white hover:bg-blue-500 border border-blue-200 hover:border-blue-500 px-3 py-1.5 rounded transition-all shadow-sm" title="編輯 (Edit)">
                                                    ✏️
                                                </button>
                                                <button onClick={() => onCancelBooking(b.rowId, STATUS.CANCELLED)} className="text-red-500 hover:text-white hover:bg-red-500 border border-red-200 hover:border-red-500 px-3 py-1.5 rounded transition-all shadow-sm" title="取消預約 (Cancel)">
                                                    ❌
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                }

                                // --- CHẾ ĐỘ CHỈNH SỬA (EDIT MODE) ---
                                // Lấy danh sách thợ khả dụng cho dropdown
                                let availableStaffOptions = [];
                                if (staffList && window.StaffSorter) {
                                    // Hàm chuyển đổi thời gian nội bộ
                                    const getMins = (timeStr) => {
                                        if (!timeStr) return 0;
                                        const [h, m] = timeStr.split(':').map(Number);
                                        let totalMins = (h * 60) + m;
                                        const openHour = window.SYSTEM_CONFIG?.OPERATION_TIME?.OPEN_HOUR || 5;
                                        if (h < openHour) totalMins += 1440;
                                        return totalMins;
                                    };
                                    // Hàm tính thời lượng
                                    const getDuration = (serviceName) => {
                                        if (!serviceName) return 60;
                                        const match = serviceName.match(/(190|180|130|120|100|90|70|60|50|45|40|30)/);
                                        if (match) return parseInt(match[0], 10);
                                        return 60;
                                    };

                                    const editBookingMins = getMins(editFormData.time);
                                    const editDur = getDuration(editFormData.service);
                                    
                                    const mockBooking = {
                                        ...b,
                                        serviceName: editFormData.service,
                                        isOil: editFormData.isOil,
                                        duration: editDur,
                                        startTimeMins: editBookingMins
                                    };

                                    availableStaffOptions = staffList.filter(staff => {
                                        // 1. Kiểm tra điều kiện giới tính/loại dịch vụ
                                        if (!window.StaffSorter.checkCompatibility(staff, mockBooking, '隨機')) return false;
                                        // 2. Kiểm tra trùng lịch tương lai
                                        if (window.StaffSorter.checkFutureAvailability) {
                                            const canServe = window.StaffSorter.checkFutureAvailability(
                                                staff.id, editDur, safeBookings, editBookingMins, b.rowId, editFormData.phone
                                            );
                                            if (!canServe) return false;
                                        }
                                        return true;
                                    });
                                }

                                return (
                                    <tr key={`edit-${b.rowId}`} className="bg-yellow-50 shadow-inner border-y-2 border-orange-300">
                                        <td className="p-2"><input type="date" className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-orange-400 outline-none" value={editFormData.date} onChange={e => handleInputChange('date', e.target.value)} /></td>
                                        <td className="p-2"><window.TimePicker24H className="w-full border border-gray-300 p-1 rounded font-mono outline-none" value={editFormData.time} onChange={val => handleInputChange('time', val)} /></td>
                                        <td className="p-2"><input type="text" className="w-full border border-gray-300 p-2 rounded font-bold focus:ring-2 focus:ring-orange-400 outline-none" value={editFormData.name} onChange={e => handleInputChange('name', e.target.value)} /></td>
                                        <td className="p-2"><select className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-orange-400 outline-none max-w-[200px]" value={editFormData.service} onChange={e => handleInputChange('service', e.target.value)}>{servicesList.map(s => <option key={s} value={s}>{s}</option>)}</select></td>
                                        <td className="p-2 text-center"><input type="checkbox" className="w-5 h-5 accent-orange-500 cursor-pointer" checked={editFormData.isOil} onChange={e => handleInputChange('isOil', e.target.checked)} /></td>
                                        <td className="p-2 text-center"><input type="checkbox" className="w-5 h-5 accent-red-500 cursor-pointer" checked={editFormData.isGuaSha} onChange={e => handleInputChange('isGuaSha', e.target.checked)} /></td>
                                        <td className="p-2"><input type="text" className="w-full border border-gray-300 p-2 rounded font-mono focus:ring-2 focus:ring-orange-400 outline-none min-w-[120px]" placeholder="09xx..." value={editFormData.phone} onChange={e => handleInputChange('phone', e.target.value)} /></td>
                                        <td className="p-2"><select className="w-full border border-gray-300 p-2 rounded font-bold focus:ring-2 focus:ring-orange-400 outline-none" value={editFormData.status} onChange={e => handleInputChange('status', e.target.value)}>{statusOptions.map(s => <option key={s} value={s}>{s}</option>)}</select></td>
                                        <td className="p-2">
                                            <select className="w-full min-w-[80px] border border-gray-300 p-2 rounded font-bold text-indigo-700 focus:ring-2 focus:ring-orange-400 outline-none" value={editFormData.staff} onChange={e => handleInputChange('staff', e.target.value)}>
                                                <option value="隨機">隨機</option>
                                                <option value="男師">男師</option>
                                                <option value="女師">女師</option>
                                                {availableStaffOptions.map(s => (
                                                    <option key={s.id} value={s.id}>{s.name || s.id}</option>
                                                ))}
                                                {editFormData.staff && !['隨機', '男師', '女師', '男', '女'].includes(editFormData.staff) && !availableStaffOptions.find(s => String(s.id) === String(editFormData.staff)) && (
                                                    <option value={editFormData.staff}>{editFormData.staff} (不符合)</option>
                                                )}
                                            </select>
                                        </td>

                                        <td className="p-2 text-center sticky right-0 bg-yellow-50 z-10 border-l border-orange-200">
                                            <div className="flex flex-col gap-1">
                                                {scanStatus !== 'OK' ? (
                                                    <button onClick={performStrictCheck} className="bg-blue-600 text-white hover:bg-blue-700 px-3 py-1.5 rounded font-bold text-sm shadow-sm transition-colors animate-pulse">
                                                        🔍 查詢空位
                                                    </button>
                                                ) : (
                                                    <button onClick={saveChanges} className="bg-green-500 text-white hover:bg-green-600 px-3 py-1.5 rounded font-bold text-sm shadow-sm transition-colors">
                                                        💾 儲存
                                                    </button>
                                                )}
                                                <button onClick={cancelEditing} className="bg-gray-400 text-white hover:bg-gray-500 px-3 py-1 rounded font-bold text-xs shadow-sm transition-colors">
                                                    取消
                                                </button>
                                                {scanMessage && (
                                                    <div className={`text-xs font-bold mt-1 ${scanStatus === 'OK' ? 'text-green-600' : 'text-red-600'}`}>
                                                        {scanMessage}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}

                            {safeBookings.length === 0 && (
                                <tr>
                                    <td colSpan="10" className="p-12 text-center text-gray-400">
                                        <div className="flex flex-col items-center justify-center">
                                            <i className="fas fa-calendar-times text-5xl mb-4 text-gray-300"></i>
                                            <span className="text-xl font-bold">📭 暫無預約資料</span>
                                            <span className="text-sm mt-2">請檢查篩選條件或切換日期。</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="bg-gray-50 border-t p-3 text-right text-sm text-gray-500 font-medium">
                    總計: {safeBookings.length} 筆
                </div>
            </div>
        );
    };

    window.BookingListView = BookingListView;
})();