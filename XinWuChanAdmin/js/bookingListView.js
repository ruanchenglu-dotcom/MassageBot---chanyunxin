// File: js/bookingListView.js
// Component chuyên quản lý giao diện danh sách đặt lịch (Tab Danh sách)
// Cập nhật: Thêm thanh cuộn Dọc/Ngang, Ghim tiêu đề, Tăng cỡ chữ to rõ.

(function() {
    const BookingListView = ({ bookings, onCancelBooking }) => {
        // 1. Đảm bảo bookings luôn là mảng an toàn
        const safeBookings = Array.isArray(bookings) ? bookings : [];

        return (
            // Container chính: Có bóng đổ, nền trắng, bo góc
            <div className="bg-white rounded-lg shadow-lg flex flex-col h-full animate-fadeIn border border-gray-200">
                
                {/* WRAPPER TABLE:
                    - overflow-auto: Tự động hiện thanh cuộn dọc/ngang khi cần
                    - max-h-[80vh]: Giới hạn chiều cao bảng khoảng 80% màn hình để hiện scroll dọc
                */}
                <div className="overflow-auto relative w-full" style={{ maxHeight: '75vh' }}>
                    
                    <table className="w-full text-left border-collapse min-w-max">
                        {/* THEAD: 
                            - sticky top-0: Ghim cứng lên đầu khi cuộn
                            - z-10: Đảm bảo nằm đè lên nội dung khi cuộn
                            - text-base: Cỡ chữ tiêu đề to hơn
                        */}
                        <thead className="bg-slate-100 text-slate-700 font-bold text-base sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-4 border-b border-slate-200 whitespace-nowrap">預約日期 (Ngày)</th>
                                <th className="p-4 border-b border-slate-200 whitespace-nowrap">時間 (Giờ)</th>
                                <th className="p-4 border-b border-slate-200 whitespace-nowrap">姓名 (Tên)</th>
                                <th className="p-4 border-b border-slate-200 whitespace-nowrap">項目 (Dịch vụ)</th>
                                <th className="p-4 border-b border-slate-200 text-center whitespace-nowrap">油推 (Dầu)</th>
                                <th className="p-4 border-b border-slate-200 text-center whitespace-nowrap">人數 (Khách)</th>
                                <th className="p-4 border-b border-slate-200 whitespace-nowrap">電話 (SĐT)</th>
                                <th className="p-4 border-b border-slate-200 whitespace-nowrap">狀態 (Trạng thái)</th>
                                <th className="p-4 border-b border-slate-200 whitespace-nowrap">指定師傅 (KTV)</th>
                                <th className="p-4 border-b border-slate-200 text-right whitespace-nowrap sticky right-0 bg-slate-100 z-20">操作 (Hủy)</th>
                            </tr>
                        </thead>
                        
                        {/* TBODY: Tăng cỡ chữ lên text-base (16px) */}
                        <tbody className="divide-y divide-gray-200 text-base">
                            {safeBookings.map((b, index) => {
                                // --- Logic xử lý hiển thị (GIỮ NGUYÊN TÍNH NĂNG CŨ) ---
                                const nameParts = (b.customerName || '').split('(');
                                const name = nameParts[0].trim();
                                const phone = nameParts.length > 1 ? nameParts[1].replace(')', '').trim() : (b.sdt || '');
                                
                                // Kiểm tra có phải làm dầu không
                                const isOil = (b.serviceName || '').includes('油') || (b.isOil === true);
                                
                                // Kiểm tra trạng thái hoàn thành
                                const isDone = b.status.includes('完成') || b.status.includes('✅');
                                const isCancelled = b.status.includes('取消') || b.status.includes('Cancel');

                                // Class màu sắc cho trạng thái
                                let statusClass = 'bg-green-100 text-green-700 border border-green-200';
                                if (isCancelled) statusClass = 'bg-red-100 text-red-700 border border-red-200';
                                else if (isDone) statusClass = 'bg-gray-200 text-gray-600 border border-gray-300';

                                // Tạo hiệu ứng màu nền xen kẽ (Zebra striping) cho dễ nhìn dòng
                                const rowBg = index % 2 === 0 ? 'bg-white' : 'bg-slate-50';
                                const opacityClass = isDone ? 'opacity-60' : '';

                                return (
                                    <tr 
                                        key={b.rowId} 
                                        className={`${rowBg} hover:bg-blue-50 transition-colors ${opacityClass}`}
                                    >
                                        {/* Ngày */}
                                        <td className="p-4 whitespace-nowrap font-mono text-gray-600">
                                            {(b.startTimeString || ' ').split(' ')[0]}
                                        </td>
                                        
                                        {/* Giờ - Tăng đậm và to hơn */}
                                        <td className="p-4 whitespace-nowrap font-mono text-lg font-bold text-indigo-700">
                                            {(b.startTimeString || ' ').split(' ')[1]}
                                        </td>
                                        
                                        {/* Tên khách - Tăng đậm */}
                                        <td className="p-4 whitespace-nowrap font-bold text-gray-800 text-lg">
                                            {name}
                                        </td>
                                        
                                        {/* Dịch vụ */}
                                        <td className="p-4 whitespace-nowrap text-gray-700 font-medium">
                                            {b.serviceName}
                                        </td>
                                        
                                        {/* Dầu - Icon nổi bật */}
                                        <td className="p-4 whitespace-nowrap text-center">
                                            {isOil && <span className="text-purple-600 font-bold text-lg">💧 Yes</span>}
                                        </td>
                                        
                                        {/* Số lượng khách */}
                                        <td className="p-4 whitespace-nowrap text-center font-bold text-gray-700">
                                            {b.pax}
                                        </td>
                                        
                                        {/* Số điện thoại */}
                                        <td className="p-4 whitespace-nowrap font-mono text-gray-600">
                                            {phone}
                                        </td>
                                        
                                        {/* Trạng thái */}
                                        <td className="p-4 whitespace-nowrap">
                                            <span className={`px-3 py-1 rounded-full text-sm font-bold shadow-sm ${statusClass}`}>
                                                {b.status}
                                            </span>
                                        </td>
                                        
                                        {/* KTV chỉ định */}
                                        <td className="p-4 whitespace-nowrap">
                                            <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded text-sm font-bold border border-indigo-100">
                                                {b.staffId}
                                            </span>
                                        </td>
                                        
                                        {/* Nút thao tác - Ghim cột phải nếu cần hoặc để trôi theo bảng */}
                                        <td className="p-4 whitespace-nowrap text-right sticky right-0 bg-opacity-90 z-10" style={{ backgroundColor: 'inherit' }}>
                                            <button 
                                                onClick={() => onCancelBooking(b.rowId, '❌ Cancelled')} 
                                                className="text-red-500 hover:text-white hover:bg-red-500 border border-red-200 hover:border-red-500 px-3 py-2 rounded transition-all shadow-sm"
                                                title="Hủy đơn (Cancel)"
                                            >
                                                <i className="fas fa-trash mr-1"></i> Hủy
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            
                            {/* Hiển thị khi không có dữ liệu */}
                            {safeBookings.length === 0 && (
                                <tr>
                                    <td colSpan="10" className="p-12 text-center text-gray-400">
                                        <div className="flex flex-col items-center justify-center">
                                            <i className="fas fa-calendar-times text-5xl mb-4 text-gray-300"></i>
                                            <span className="text-xl font-bold">📭 Không có dữ liệu đặt lịch (No Bookings)</span>
                                            <span className="text-sm mt-2">Vui lòng kiểm tra lại bộ lọc hoặc ngày tháng.</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                
                {/* Footer nhỏ đếm số lượng */}
                <div className="bg-gray-50 border-t p-3 text-right text-sm text-gray-500 font-medium">
                    Tổng cộng: {safeBookings.length} đơn
                </div>
            </div>
        );
    };

    // Xuất ra window để app.js có thể gọi
    window.BookingListView = BookingListView;
})();