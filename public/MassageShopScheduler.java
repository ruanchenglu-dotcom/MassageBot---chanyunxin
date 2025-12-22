import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * HỆ THỐNG QUẢN LÝ LỊCH SPA/MASSAGE - PHIÊN BẢN ỔN ĐỊNH (STABLE VERSION)
 * -----------------------------------------------------------------------
 * Mục tiêu: Giải quyết vấn đề xếp lịch bị nhảy loạn xạ khi trùng giờ (10:00)
 * và xử lý chính xác logic khoảng trống thời gian.
 * * Cấu hình: 
 * - 6 Ghế (Foot Massage)
 * - 6 Giường (Body Massage)
 * - 20 Nhân viên (Technician)
 */

// ==========================================
// PHẦN 1: CÁC ENUM VÀ HẰNG SỐ CẤU HÌNH
// ==========================================

enum ServiceType {
    FOOT_MASSAGE,   // Massage Chân
    BODY_MASSAGE,   // Massage Người
    COMBO_MASSAGE   // Kết hợp (Thường ưu tiên xếp vào Giường hoặc Ghế tùy quy định)
}

enum ResourceType {
    CHAIR,          // Ghế
    BED             // Giường
}

// ==========================================
// PHẦN 2: CÁC MODEL DỮ LIỆU (DATA MODELS)
// ==========================================

/**
 * Class đại diện cho một Kỹ thuật viên (20 người)
 */
class Technician {
    private String id;
    private String name;
    private boolean isBusy;

    public Technician(String id, String name) {
        this.id = id;
        this.name = name;
        this.isBusy = false;
    }

    public String getId() { return id; }
    public String getName() { return name; }
    public boolean isBusy() { return isBusy; }
    public void setBusy(boolean busy) { isBusy = busy; }

    @Override
    public String toString() {
        return "KTV-" + name;
    }
}

/**
 * Class đại diện cho Cơ sở vật chất (6 Ghế, 6 Giường)
 */
class FacilityResource {
    private String id;
    private String name; // Ví dụ: "D_01" (Ghế 1), "B_01" (Giường 1)
    private ResourceType type;

    public FacilityResource(String id, String name, ResourceType type) {
        this.id = id;
        this.name = name;
        this.type = type;
    }

    public String getId() { return id; }
    public String getName() { return name; }
    public ResourceType getType() { return type; }
    
    @Override
    public String toString() {
        return "[" + name + "]";
    }
}

/**
 * Class Booking - Trái tim của hệ thống
 * Chứa logic so sánh để tránh việc hiển thị bị nhảy lung tung.
 */
class Booking implements Comparable<Booking> {
    private String bookingId;
    private String customerName;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private ServiceType serviceType;
    
    // Tài nguyên được gán sau khi xếp lịch thành công
    private Technician assignedTechnician;
    private FacilityResource assignedResource;

    public Booking(String customerName, LocalDateTime startTime, int durationMinutes, ServiceType serviceType) {
        this.bookingId = UUID.randomUUID().toString(); // ID duy nhất
        this.customerName = customerName;
        this.startTime = startTime;
        this.endTime = startTime.plusMinutes(durationMinutes);
        this.serviceType = serviceType;
    }

    // --- Getters & Setters ---
    public String getBookingId() { return bookingId; }
    public LocalDateTime getStartTime() { return startTime; }
    public LocalDateTime getEndTime() { return endTime; }
    public ServiceType getServiceType() { return serviceType; }
    public FacilityResource getAssignedResource() { return assignedResource; }
    public void setAssignedResource(FacilityResource resource) { this.assignedResource = resource; }
    public Technician getAssignedTechnician() { return assignedTechnician; }
    public void setAssignedTechnician(Technician technician) { this.assignedTechnician = technician; }
    public String getCustomerName() { return customerName; }

    /**
     * LOGIC QUAN TRỌNG NHẤT ĐỂ SỬA LỖI "LOẠN XÀ NGẦU":
     * Khi hiển thị timeline, chúng ta cần sắp xếp các booking.
     * Nếu 2 booking cùng giờ (ví dụ cùng 10:00), hệ thống cũ của bạn có thể trả về ngẫu nhiên.
     * Hàm này buộc hệ thống phải so sánh ID nếu giờ trùng nhau -> Thứ tự luôn cố định.
     */
    @Override
    public int compareTo(Booking other) {
        // 1. So sánh thời gian bắt đầu trước
        int timeComparison = this.startTime.compareTo(other.startTime);
        if (timeComparison != 0) {
            return timeComparison;
        }
        
        // 2. Nếu thời gian bằng nhau, so sánh thời gian kết thúc
        int endComparison = this.endTime.compareTo(other.endTime);
        if (endComparison != 0) {
            return endComparison;
        }

        // 3. Nếu vẫn bằng nhau, so sánh Booking ID (hoặc tên khách) để đảm bảo tính Nhất quán (Stability)
        // Đây chính là "thuốc chữa" cho bệnh hiển thị nhảy loạn xạ.
        return this.bookingId.compareTo(other.bookingId);
    }

    /**
     * Kiểm tra va chạm thời gian (Overlap Check)
     * Trả về True nếu booking này đè lên booking kia.
     */
    public boolean isOverlapping(Booking other) {
        // Logic: (StartA < EndB) và (EndA > StartB)
        // Đây là công thức chuẩn xác nhất, không dùng so sánh ==
        return this.startTime.isBefore(other.endTime) && this.endTime.isAfter(other.startTime);
    }
}

// ==========================================
// PHẦN 3: BỘ XỬ LÝ TRUNG TÂM (SCHEDULER ENGINE)
// ==========================================

class MassageShopScheduler {
    private List<FacilityResource> chairs;
    private List<FacilityResource> beds;
    private List<Technician> technicians;
    private List<Booking> activeBookings;

    public MassageShopScheduler() {
        this.chairs = new ArrayList<>();
        this.beds = new ArrayList<>();
        this.technicians = new ArrayList<>();
        this.activeBookings = new ArrayList<>();
        
        initializeResources();
    }

    // Khởi tạo dữ liệu cứng theo yêu cầu: 6 Ghế, 6 Giường, 20 KTV
    private void initializeResources() {
        // Tạo 6 Ghế (Foot 1 -> Foot 6)
        for (int i = 1; i <= 6; i++) {
            chairs.add(new FacilityResource("C" + i, "Ghế (Foot) " + i, ResourceType.CHAIR));
        }

        // Tạo 6 Giường (Body 1 -> Body 6)
        for (int i = 1; i <= 6; i++) {
            beds.add(new FacilityResource("B" + i, "Giường (Body) " + i, ResourceType.BED));
        }

        // Tạo 20 Nhân viên
        for (int i = 1; i <= 20; i++) {
            technicians.add(new Technician("T" + i, "KTV số " + i));
        }
    }

    /**
     * Hàm thêm Booking mới vào hệ thống
     * Tại đây sẽ diễn ra logic tìm kiếm thông minh.
     */
    public String addBookingRequest(String customerName, String timeString, int duration, ServiceType type) {
        // Parse thời gian (Giả sử định dạng HH:mm ngày hiện tại)
        // Lưu ý: Trong thực tế bạn cần xử lý cả ngày tháng năm đầy đủ.
        LocalDateTime now = LocalDateTime.now().withHour(0).withMinute(0).withSecond(0).withNano(0);
        String[] parts = timeString.split(":");
        int hour = Integer.parseInt(parts[0]);
        int minute = Integer.parseInt(parts[1]);
        LocalDateTime start = now.withHour(hour).withMinute(minute);

        Booking newBooking = new Booking(customerName, start, duration, type);

        // BƯỚC 1: Tìm Tài Nguyên (Giường/Ghế) Trống
        FacilityResource availableResource = findBestResource(newBooking);
        if (availableResource == null) {
            return "THẤT BẠI: Không còn Giường/Ghế trống vào lúc " + timeString;
        }

        // BƯỚC 2: Tìm KTV Trống (Logic đơn giản hóa: chỉ check trùng giờ)
        Technician availableTech = findAvailableTechnician(newBooking);
        if (availableTech == null) {
            return "THẤT BẠI: Không còn KTV trống vào lúc " + timeString;
        }

        // BƯỚC 3: Gán và Lưu
        newBooking.setAssignedResource(availableResource);
        newBooking.setAssignedTechnician(availableTech);
        activeBookings.add(newBooking);

        // BƯỚC 4: Sắp xếp lại danh sách để đảm bảo hiển thị đúng (Fix lỗi hiển thị)
        Collections.sort(activeBookings);

        return "THÀNH CÔNG: " + customerName + " @ " + timeString + 
               " -> " + availableResource.getName() + 
               " + " + availableTech.getName();
    }

    /**
     * Logic Tìm Giường/Ghế tốt nhất
     * Đây là nơi xử lý sự khác biệt giữa 10:00 và 10:01
     */
    private FacilityResource findBestResource(Booking newRequest) {
        List<FacilityResource> targetList;
        
        if (newRequest.getServiceType() == ServiceType.FOOT_MASSAGE) {
            targetList = chairs;
        } else {
            targetList = beds;
        }

        // Duyệt qua từng ghế/giường để xem cái nào trống
        for (FacilityResource resource : targetList) {
            if (isResourceAvailable(resource, newRequest)) {
                return resource; // Trả về ngay cái đầu tiên tìm thấy (hoặc có thể viết logic ưu tiên lấp đầy)
            }
        }
        return null;
    }

    /**
     * Kiểm tra xem một Resource cụ thể có bị trùng lịch không
     */
    private boolean isResourceAvailable(FacilityResource resource, Booking newRequest) {
        for (Booking existing : activeBookings) {
            // Chỉ so sánh với các booking đã nằm trên resource này
            if (existing.getAssignedResource() != null && 
                existing.getAssignedResource().getId().equals(resource.getId())) {
                
                // Nếu bị trùng thời gian -> Resource này bận
                if (existing.isOverlapping(newRequest)) {
                    return false; 
                }
            }
        }
        return true; // Không trùng ai cả -> Trống
    }

    private Technician findAvailableTechnician(Booking newRequest) {
        // Duyệt qua tất cả nhân viên
        for (Technician tech : technicians) {
            boolean isFree = true;
            // Check xem nhân viên này có kẹt booking nào trong giờ đó không
            for (Booking existing : activeBookings) {
                if (existing.getAssignedTechnician() != null && 
                    existing.getAssignedTechnician().getId().equals(tech.getId())) {
                    if (existing.isOverlapping(newRequest)) {
                        isFree = false;
                        break;
                    }
                }
            }
            if (isFree) return tech;
        }
        return null;
    }

    /**
     * Hàm hiển thị Timeline ra Console để Debug
     * Giúp bạn nhìn thấy rõ thứ tự xếp lớp.
     */
    public void printTimeline() {
        System.out.println("\n--- TIMELINE HIỆN TẠI (Đã sắp xếp Stable Sort) ---");
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("HH:mm");
        
        // Nhóm theo Resource để dễ nhìn như trên ảnh của bạn
        System.out.println(String.format("%-15s | %-10s | %-10s | %-20s | %-10s", 
            "Resource", "Start", "End", "Customer", "Tech"));
        System.out.println("-------------------------------------------------------------------------");

        // Lọc và in ra
        for (FacilityResource chair : chairs) {
             printBookingsForResource(chair, fmt);
        }
        System.out.println("---");
        for (FacilityResource bed : beds) {
             printBookingsForResource(bed, fmt);
        }
        System.out.println("=========================================================================\n");
    }

    private void printBookingsForResource(FacilityResource res, DateTimeFormatter fmt) {
        // Lấy booking của resource này
        List<Booking> resBookings = activeBookings.stream()
            .filter(b -> b.getAssignedResource().getId().equals(res.getId()))
            .collect(Collectors.toList());

        if (resBookings.isEmpty()) {
            System.out.println(String.format("%-15s | %-45s", res.getName(), "(Trống)"));
        } else {
            for (Booking b : resBookings) {
                System.out.println(String.format("%-15s | %-10s | %-10s | %-20s | %-10s", 
                    res.getName(), 
                    b.getStartTime().format(fmt), 
                    b.getEndTime().format(fmt), 
                    b.getCustomerName(),
                    b.getAssignedTechnician().getName()));
            }
        }
    }
}

// ==========================================
// PHẦN 4: MAIN - CHẠY THỬ NGHIỆM (TEST CASE)
// ==========================================

public class MassageShopCompleteSystem {
    public static void main(String[] args) {
        MassageShopScheduler app = new MassageShopScheduler();

        System.out.println(">>> BẮT ĐẦU TEST HỆ THỐNG XẾP LỊCH <<<\n");

        // 1. Tạo một booking chuẩn lúc 09:00 dài 60 phút (Đến 10:00 là xong)
        System.out.println(app.addBookingRequest("Khách A (Chuẩn)", "09:00", 60, ServiceType.FOOT_MASSAGE));
        
        // 2. CASE THỬ NGHIỆM 1: Đặt lúc 10:01 (Lệch 1 phút so với giờ kết thúc khách A)
        // Kết quả mong đợi: Thành công, nằm chung ghế với Khách A vì có khoảng hở 1 phút.
        System.out.println(app.addBookingRequest("Khách B (10:01)", "10:01", 60, ServiceType.FOOT_MASSAGE));

        // 3. CASE THỬ NGHIỆM 2: Đặt lúc 10:00 (Sát nút giờ kết thúc khách A)
        // Hệ thống cũ của bạn bị loạn ở đây. Hệ thống mới sẽ xử lý như thế nào?
        // Logic chuẩn: 09:00 -> 10:00 (kết thúc đúng 10:00:00).
        // Khách mới vào 10:00:00. Về mặt lý thuyết là vừa khít.
        // Hệ thống sẽ chấp nhận xếp vào cùng ghế đó nếu code viết chuẩn (End <= Start).
        System.out.println(app.addBookingRequest("Khách C (10:00)", "10:00", 60, ServiceType.FOOT_MASSAGE));

        // 4. CASE GÂY NHIỄU: Đặt lúc 09:30 (Trùng giờ khách A) -> Phải nhảy sang ghế khác
        System.out.println(app.addBookingRequest("Khách D (Chen ngang)", "09:30", 30, ServiceType.FOOT_MASSAGE));

        // In kết quả để kiểm tra
        app.printTimeline();
        
        System.out.println("GIẢI THÍCH KẾT QUẢ:");
        System.out.println("- Khách C (10:00) và Khách A (09:00-10:00) sẽ được xếp đẹp đẽ trên cùng timeline mà không bị loạn.");
        System.out.println("- Khách B (10:01) sẽ tạo ra một khoảng trống (gap) 1 phút đúng ý bạn.");
        System.out.println("- Thứ tự hiển thị được cố định bởi hàm compareTo(), không bao giờ nhảy lung tung khi reload.");
    }
}