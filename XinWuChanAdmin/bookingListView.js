// File: js/bookingListView.js
// Component chuyên quản lý giao diện danh sách đặt lịch (Tab Danh sách)

(function() {
    const BookingListView = ({ bookings, onCancelBooking }) => {
        // Đảm bảo bookings luôn là mảng
        const safeBookings = Array.isArray(bookings) ? bookings : [];

        return (
            <div className="bg-white rounded shadow overflow-hidden animate-fadeIn">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-100 text-slate-600 font-bold">
                        <tr>
                            <th className="p-3">預約日期</th>
                            <th className="p-3">時間</th>
                            <th className="p-3">姓名</th>
                            <th className="p-3">項目</th>
                            <th className="p-3">油推</th>
                            <th className="p-3">人數</th>
                            <th className="p-3">電話</th>
                            <th className="p-3">狀態</th>
                            <th className="p-3">指定師傅</th>
                            <th className="p-3 text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {safeBookings.map(b => {
                            // Logic xử lý hiển thị từng dòng (được tách từ app.js cũ)
                            const nameParts = (b.customerName || '').split('(');
                            const name = nameParts[0].trim();
                            const phone = nameParts.length > 1 ? nameParts[1].replace(')', '').trim() : (b.sdt || '');
                            
                            // Kiểm tra có phải làm dầu không
                            const isOil = (b.serviceName || '').includes('油') || (b.isOil === true) ? 'Yes' : '';
                            
                            // Kiểm tra trạng thái hoàn thành
                            const isDone = b.status.includes('完成') || b.status.includes('✅');
                            const isCancelled = b.status.includes('取消') || b.status.includes('Cancel');

                            // Class màu sắc cho trạng thái
                            let statusClass = 'bg-green-100 text-green-600';
                            if (isCancelled) statusClass = 'bg-red-100 text-red-600';
                            else if (isDone) statusClass = 'bg-gray-200 text-gray-600';

                            return (
                                <tr key={b.rowId} className={`hover:bg-slate-50 transition-colors ${isDone ? 'bg-gray-50 opacity-75' : ''}`}>
                                    <td className="p-3 font-mono">{(b.startTimeString || ' ').split(' ')[0]}</td>
                                    <td className="p-3 font-mono font-bold text-indigo-700">{(b.startTimeString || ' ').split(' ')[1]}</td>
                                    <td className="p-3 font-bold">{name}</td>
                                    <td className="p-3 text-gray-600">{b.serviceName}</td>
                                    <td className="p-3 text-center">
                                        {isOil && <span className="text-purple-600 font-bold">Yes</span>}
                                    </td>
                                    <td className="p-3 text-center">{b.pax}</td>
                                    <td className="p-3 font-mono text-gray-500">{phone}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${statusClass}`}>
                                            {b.status}
                                        </span>
                                    </td>
                                    <td className="p-3">
                                        <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-xs font-bold">
                                            {b.staffId}
                                        </span>
                                    </td>
                                    <td className="p-3 text-right">
                                        <button 
                                            onClick={() => onCancelBooking(b.rowId, '❌ Cancelled')} 
                                            className="text-red-500 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                                            title="Hủy đơn (Cancel)"
                                        >
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {safeBookings.length === 0 && (
                            <tr>
                                <td colSpan="10" className="p-8 text-center text-gray-400 font-bold">
                                    📭 Không có dữ liệu đặt lịch (No Bookings)
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        );
    };

    // Xuất ra window để app.js có thể gọi
    window.BookingListView = BookingListView;
})();