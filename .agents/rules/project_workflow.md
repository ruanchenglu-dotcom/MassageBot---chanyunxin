---
name: Project Workflow and Deployment
description: Universal rules for communication, UI language constraints, E2E testing, and code deployment in this workspace.
---

# Quy trình làm việc và Triển khai (Project Workflow & Deployment)

## 1. Kế hoạch và Giao tiếp
- **Ngôn ngữ giao tiếp & Kế hoạch:** Luôn sử dụng Tiếng Việt để giải thích, phân tích lỗi và lập Kế hoạch Triển khai (Implementation Plan).
- **Phê duyệt:** Không bao giờ tự ý sửa code nếu chưa lập Kế hoạch và được người dùng duyệt (Approve).
- **Giao diện người dùng (UX/UI):** Mọi văn bản hiển thị trên ứng dụng web bắt buộc phải dùng **Tiếng Trung Phồn Thể** (Traditional Chinese), tuyệt đối không dùng ngôn ngữ khác (trừ log backend).

## 2. Kiểm thử E2E (End-to-End Testing)
- Khi được yêu cầu viết và chạy test tự động, hãy tạo script Node.js (như Puppeteer) và đảm bảo script quét port thực tế của server (5000 hoặc 5001) thay vì hardcode một port duy nhất.

## 3. Triển khai (Deployment)
- Khi người dùng yêu cầu "update code lên render" hoặc chạy lệnh push code, hãy thực thi file script cục bộ `.\len.bat "<commit_message>"` qua terminal thay vì dùng các lệnh `git add / commit / push` thông thường.
