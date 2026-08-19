# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: combo_upgrade_foot_capacity_frontend.spec.js >> Kiểm tra lỗi đầy ghế không hiện hộp thoại auto-stretch sai
- Location: tests\combo_upgrade_foot_capacity_frontend.spec.js:5:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.selectOption: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('select').first()
    - locator resolved to <select class="w-full text-lg font-black text-indigo-800 bg-transparent focus:outline-none cursor-pointer appearance-none py-2 pl-3 pr-8">…</select>
  - attempting select option action
    2 × waiting for element to be visible and enabled
      - did not find some options
    - retrying select option action
    - waiting 20ms
    2 × waiting for element to be visible and enabled
      - did not find some options
    - retrying select option action
      - waiting 100ms
    44 × waiting for element to be visible and enabled
       - did not find some options
     - retrying select option action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: V109.8
      - generic [ref=e7]: 心悟禪養身館 (中和店)
      - generic [ref=e8]:
        - button "❯" [ref=e9] [cursor=pointer]
        - textbox [ref=e10] [cursor=pointer]: 2026-08-19
        - button "❯" [ref=e11] [cursor=pointer]
    - generic [ref=e12]:
      - button " 本館" [ref=e13] [cursor=pointer]:
        - generic [ref=e14]: 
        - generic [ref=e15]: 本館
      - button " 對面館" [ref=e16] [cursor=pointer]:
        - generic [ref=e17]: 
        - generic [ref=e18]: 對面館
      - button " 列表" [ref=e19] [cursor=pointer]:
        - generic [ref=e20]: 
        - generic [ref=e21]: 列表
    - generic [ref=e22]:
      - button " 立即刷新" [ref=e23] [cursor=pointer]:
        - generic [ref=e24]: 
        - generic [ref=e25]: 立即刷新
      - button " 預約" [ref=e26] [cursor=pointer]:
        - generic [ref=e27]: 
        - generic [ref=e28]: 預約
      - button " 技師報到" [ref=e29] [cursor=pointer]:
        - generic [ref=e30]: 
        - generic [ref=e31]: 技師報到
  - generic [ref=e34]:
    - generic [ref=e35]: 
    - generic [ref=e41]: 
    - generic [ref=e47]: 
    - generic [ref=e53]: 
    - generic [ref=e59]: 
    - generic [ref=e65]: 
    - generic [ref=e71]: 
    - generic [ref=e77]: 
  - main [ref=e83]:
    - generic [ref=e87]:
      - generic: 18:57 現在
      - generic "雙擊回到現在" [ref=e88] [cursor=pointer]:
        - generic [ref=e89]: 區域
        - generic [ref=e90]:
          - generic [ref=e91]:
            - generic [ref=e92]: 8:00
            - button "" [ref=e93]
          - generic [ref=e95]:
            - generic [ref=e96]: 9:00
            - button "" [ref=e97]
          - generic [ref=e99]:
            - generic [ref=e100]: 10:00
            - button "" [ref=e101]
          - generic [ref=e103]:
            - generic [ref=e104]: 11:00
            - button "" [ref=e105]
          - generic [ref=e107]:
            - generic [ref=e108]: 12:00
            - button "" [ref=e109]
          - generic [ref=e111]:
            - generic [ref=e112]: 13:00
            - button "" [ref=e113]
          - generic [ref=e115]:
            - generic [ref=e116]: 14:00
            - button "" [ref=e117]
          - generic [ref=e119]:
            - generic [ref=e120]: 15:00
            - button "" [ref=e121]
          - generic [ref=e123]:
            - generic [ref=e124]: 16:00
            - button "" [ref=e125]
          - generic [ref=e127]:
            - generic [ref=e128]: 17:00
            - button "" [ref=e129]
          - generic [ref=e131]:
            - generic [ref=e132]: 18:00
            - button "" [ref=e133]
          - generic [ref=e135]:
            - generic [ref=e136]: 19:00
            - button "" [ref=e137]
          - generic [ref=e139]:
            - generic [ref=e140]: 20:00
            - button "" [ref=e141]
          - generic [ref=e143]:
            - generic [ref=e144]: 21:00
            - button "" [ref=e145]
          - generic [ref=e147]:
            - generic [ref=e148]: 22:00
            - button "" [ref=e149]
          - generic [ref=e151]:
            - generic [ref=e152]: 23:00
            - button "" [ref=e153]
          - generic [ref=e155]:
            - generic [ref=e156]: 0:00
            - button "" [ref=e157]
          - generic [ref=e159]:
            - generic [ref=e160]: 1:00
            - button "" [ref=e161]
          - generic [ref=e163]:
            - generic [ref=e164]: 2:00
            - button "" [ref=e165]
          - generic [ref=e167]:
            - generic [ref=e168]: 3:00
            - button "" [ref=e169]
          - generic [ref=e171]:
            - generic [ref=e172]: 4:00
            - button "" [ref=e173]
      - generic [ref=e175]:
        - generic [ref=e176]:
          - generic "拖曳此處以互換整排客人" [ref=e177]: 腳1-1
          - generic "腳底按摩 (60分)" [ref=e179] [cursor=pointer]:
            - generic [ref=e180]: 方(1/4)
            - generic [ref=e182]:
              - generic [ref=e183]: Staff1
              - generic [ref=e184]: 19:01
            - button "" [ref=e185]
        - generic [ref=e187]:
          - generic "拖曳此處以互換整排客人" [ref=e188]: 腳1-2
          - generic "腳底按摩 (60分)" [ref=e190] [cursor=pointer]:
            - generic [ref=e191]: 方(2/4)
            - generic [ref=e193]:
              - generic [ref=e194]: Staff2
              - generic [ref=e195]: 19:01
            - button "" [ref=e196]
        - generic [ref=e198]:
          - generic "拖曳此處以互換整排客人" [ref=e199]: 腳1-3
          - generic "腳底按摩 (60分)" [ref=e201] [cursor=pointer]:
            - generic [ref=e202]: 方(3/4)
            - generic [ref=e204]:
              - generic [ref=e205]: Staff3
              - generic [ref=e206]: 19:01
            - button "" [ref=e207]
        - generic [ref=e209]:
          - generic "拖曳此處以互換整排客人" [ref=e210]: 腳1-4
          - generic "腳底按摩 (60分)" [ref=e212] [cursor=pointer]:
            - generic [ref=e213]: 方(4/4)
            - generic [ref=e215]:
              - generic [ref=e216]: Staff4
              - generic [ref=e217]: 19:01
            - button "" [ref=e218]
        - generic "拖曳此處以互換整排客人" [ref=e221]: 腳1-5
        - generic "拖曳此處以互換整排客人" [ref=e224]: 腳1-6
        - generic [ref=e226]:
          - generic "拖曳此處以互換整排客人" [ref=e227]: 床1-1
          - generic "身體按摩 (120分)" [ref=e229] [cursor=pointer]:
            - generic [ref=e230]: 高(1/4)
            - generic [ref=e232]:
              - generic [ref=e233]: 隨機
              - generic [ref=e234]: 20:01
            - button "" [active] [ref=e235]
        - generic [ref=e237]:
          - generic "拖曳此處以互換整排客人" [ref=e238]: 床1-2
          - generic "身體按摩 (120分)" [ref=e240] [cursor=pointer]:
            - generic [ref=e241]: 高(2/4)
            - generic [ref=e243]:
              - generic [ref=e244]: 隨機
              - generic [ref=e245]: 20:01
            - button "" [ref=e246]
        - generic [ref=e248]:
          - generic "拖曳此處以互換整排客人" [ref=e249]: 床1-3
          - generic "身體按摩 (120分)" [ref=e251] [cursor=pointer]:
            - generic [ref=e252]: 高(3/4)
            - generic [ref=e254]:
              - generic [ref=e255]: 隨機
              - generic [ref=e256]: 20:01
            - button "" [ref=e257]
        - generic [ref=e259]:
          - generic "拖曳此處以互換整排客人" [ref=e260]: 床1-4
          - generic "身體按摩 (120分)" [ref=e262] [cursor=pointer]:
            - generic [ref=e263]: 高(4/4)
            - generic [ref=e265]:
              - generic [ref=e266]: 隨機
              - generic [ref=e267]: 20:01
            - button "" [ref=e268]
        - generic "拖曳此處以互換整排客人" [ref=e271]: 床1-5
        - generic "拖曳此處以互換整排客人" [ref=e274]: 床1-6
  - generic [ref=e277]:
    - generic [ref=e279]:
      - generic [ref=e280]:
        - generic [ref=e281]:
          - generic [ref=e282]: "#target-body-group-1"
          - generic [ref=e283]:
            - generic [ref=e284]: 
            - text: 床1-1
          - generic [ref=e285]: 等待中
          - generic [ref=e286]:
            - button "💧 油推" [ref=e287] [cursor=pointer]
            - button "🩸 刮痧" [ref=e288] [cursor=pointer]
            - button "🏺 滑罐" [ref=e289] [cursor=pointer]
            - button "🎯 拔罐" [ref=e290] [cursor=pointer]
        - heading "高(1/4)" [level=2] [ref=e291]
        - generic [ref=e292]:
          - generic [ref=e293]:
            - generic [ref=e294]: 
            - text: "---"
          - generic [ref=e295]:
            - generic [ref=e296]: 
            - text: 1 人
      - generic [ref=e297]:
        - button "" [ref=e298] [cursor=pointer]
        - button "" [ref=e300] [cursor=pointer]
    - generic [ref=e302]:
      - generic [ref=e303]:
        - generic [ref=e304]:
          - generic [ref=e305]:
            - generic [ref=e306]: 安排服務師傅與節數 (Blocks)
            - generic [ref=e307]:
              - generic [ref=e308]:
                - combobox [ref=e309] [cursor=pointer]:
                  - option "尚未安排 (等待中)" [selected]
                  - option "Staff1"
                  - option "Staff2"
                  - option "Staff3"
                  - option "Staff4"
                  - option "Staff5"
                  - option "Staff6"
                  - option "Staff7"
                  - option "Staff8"
                - generic: 
              - combobox [disabled] [ref=e311]:
                - option "1 節"
                - option "2 節"
                - option "3 節"
                - option "4 節" [selected]
            - generic [ref=e312]:
              - button " 拆單" [ref=e314] [cursor=pointer]:
                - generic [ref=e315]: 
                - text: 拆單
              - generic [ref=e316]: 接手
          - generic [ref=e318]: 服務項目
          - generic [ref=e319]:
            - combobox [ref=e320]:
              - option "A3" [selected]
              - option "A4"
              - option "A6"
              - option "A2"
              - option "F4"
              - option "F3"
              - option "F2"
              - option "F1"
              - option "B4"
              - option "B3"
              - option "B2"
              - option "B1"
              - option "C1"
            - generic: 
        - generic [ref=e322]:
          - generic [ref=e323]: 剩餘時間
          - generic [ref=e324]: "--:--"
          - generic [ref=e325]:
            - text: "總共:"
            - generic [ref=e326]: "120"
            - text: 分鐘
      - generic [ref=e327]:
        - generic [ref=e328]:
          - heading " 單項服務調整" [level=3] [ref=e329]:
            - generic [ref=e330]: 
            - text: 單項服務調整
          - button " 保存同步" [ref=e331] [cursor=pointer]:
            - generic [ref=e332]: 
            - text: 保存同步
        - generic [ref=e333]:
          - generic [ref=e334]:
            - generic [ref=e335]: 開始時間
            - generic [ref=e336]:
              - generic [ref=e337]: 
              - generic [ref=e338]:
                - combobox [ref=e339] [cursor=pointer]:
                  - option "00時"
                  - option "01時"
                  - option "02時"
                  - option "03時"
                  - option "04時"
                  - option "05時"
                  - option "06時"
                  - option "07時"
                  - option "08時"
                  - option "09時"
                  - option "10時"
                  - option "11時"
                  - option "12時"
                  - option "13時"
                  - option "14時"
                  - option "15時"
                  - option "16時"
                  - option "17時"
                  - option "18時" [selected]
                  - option "19時"
                  - option "20時"
                  - option "21時"
                  - option "22時"
                  - option "23時"
                - generic [ref=e340]: ":"
                - combobox [ref=e341] [cursor=pointer]:
                  - option "00分" [selected]
                  - option "01分"
                  - option "02分"
                  - option "03分"
                  - option "04分"
                  - option "05分"
                  - option "06分"
                  - option "07分"
                  - option "08分"
                  - option "09分"
                  - option "10分"
                  - option "11分"
                  - option "12分"
                  - option "13分"
                  - option "14分"
                  - option "15分"
                  - option "16分"
                  - option "17分"
                  - option "18分"
                  - option "19分"
                  - option "20分"
                  - option "21分"
                  - option "22分"
                  - option "23分"
                  - option "24分"
                  - option "25分"
                  - option "26分"
                  - option "27分"
                  - option "28分"
                  - option "29分"
                  - option "30分"
                  - option "31分"
                  - option "32分"
                  - option "33分"
                  - option "34分"
                  - option "35分"
                  - option "36分"
                  - option "37分"
                  - option "38分"
                  - option "39分"
                  - option "40分"
                  - option "41分"
                  - option "42分"
                  - option "43分"
                  - option "44分"
                  - option "45分"
                  - option "46分"
                  - option "47分"
                  - option "48分"
                  - option "49分"
                  - option "50分"
                  - option "51分"
                  - option "52分"
                  - option "53分"
                  - option "54分"
                  - option "55分"
                  - option "56分"
                  - option "57分"
                  - option "58分"
                  - option "59分"
          - generic [ref=e342]:
            - generic [ref=e343]: 
            - generic [ref=e344]: 120分
          - generic [ref=e345]:
            - generic [ref=e346]: 結束時間
            - generic [ref=e347]:
              - generic [ref=e348]: 
              - text: 20:00
        - generic [ref=e349]:
          - generic [ref=e350]: 安排座位/床位
          - generic [ref=e351]:
            - combobox [ref=e352] [cursor=pointer]:
              - option "🤖 自動安排 (Auto)"
              - option "🛏️ 床1-1" [selected]
              - option "🛏️ 床1-2 (已佔用)" [disabled]
              - option "🛏️ 床1-3 (已佔用)" [disabled]
              - option "🛏️ 床1-4 (已佔用)" [disabled]
              - option "🛏️ 床1-5"
              - option "🛏️ 床1-6"
            - generic: 
    - generic [ref=e354]:
      - button " 開始" [ref=e355] [cursor=pointer]:
        - generic [ref=e356]: 
        - generic [ref=e357]: 開始
      - button " 結帳" [ref=e358] [cursor=pointer]:
        - generic [ref=e359]: 
        - generic [ref=e360]: 結帳
      - button " 完成" [ref=e361] [cursor=pointer]:
        - generic [ref=e362]: 
        - generic [ref=e363]: 完成
      - button " 取消" [ref=e364] [cursor=pointer]:
        - generic [ref=e365]: 
        - generic [ref=e366]: 取消
      - button " 爽約" [ref=e367] [cursor=pointer]:
        - generic [ref=e368]: 
        - generic [ref=e369]: 爽約
```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | 
  3  | test.use({ baseURL: 'http://localhost:5001' });
  4  | 
  5  | test('Kiểm tra lỗi đầy ghế không hiện hộp thoại auto-stretch sai', async ({ page }) => {
  6  |     const today = new Date();
  7  |     const yyyy = today.getFullYear();
  8  |     const mm = String(today.getMonth() + 1).padStart(2, '0');
  9  |     const dd = String(today.getDate()).padStart(2, '0');
  10 |     const dateStr = `${yyyy}/${mm}/${dd}`;
  11 | 
  12 |     const mockBookings = [];
  13 | 
  14 |     for (let i = 1; i <= 4; i++) {
  15 |         mockBookings.push({
  16 |             rowId: `target-body-group-${i}`,
  17 |             date: dateStr,
  18 |             startTimeString: `${dateStr} 18:00:00`,
  19 |             startTime: "18:00",
  20 |             originalName: `高(${i}/4)`,
  21 |             customerName: `高(${i}/4)`,
  22 |             serviceName: "身體按摩 (120分)",
  23 |             cleanServiceName: "身體按摩 (120分)",
  24 |             duration: 120,
  25 |             status: "等待中",
  26 |             resourceId: `BED-1-${i}`,
  27 |             current_resource_id: `BED-1-${i}`,
  28 |             location: `BED-1-${i}`,
  29 |             staffId: "隨機",
  30 |             flow: "BODYSINGLE",
  31 |             type: "SINGLE"
  32 |         });
  33 |     }
  34 | 
  35 |     for (let i = 1; i <= 4; i++) {
  36 |         mockBookings.push({
  37 |             rowId: `occupier-chair-${i}`,
  38 |             date: dateStr,
  39 |             startTimeString: `${dateStr} 18:00:00`,
  40 |             startTime: "18:00",
  41 |             originalName: `方(${i}/4)`,
  42 |             customerName: `方(${i}/4)`,
  43 |             serviceName: "腳底按摩 (60分)",
  44 |             cleanServiceName: "腳底按摩 (60分)",
  45 |             duration: 60,
  46 |             status: "等待中",
  47 |             resourceId: `CHAIR-1-${i}`,
  48 |             current_resource_id: `CHAIR-1-${i}`,
  49 |             location: `CHAIR-1-${i}`,
  50 |             staffId: `Staff${i}`,
  51 |             flow: "FOOTSINGLE",
  52 |             type: "SINGLE"
  53 |         });
  54 |     }
  55 | 
  56 |     await page.route('**/api/info*', async (route) => {
  57 |         const json = {
  58 |             bookings: mockBookings,
  59 |             timeline: [],
  60 |             staffList: [
  61 |                 { id: "Staff1" }, { id: "Staff2" }, { id: "Staff3" }, { id: "Staff4" },
  62 |                 { id: "Staff5" }, { id: "Staff6" }, { id: "Staff7" }, { id: "Staff8" }
  63 |             ],
  64 |             statusData: {},
  65 |             resourceState: {}
  66 |         };
  67 |         await route.fulfill({ json });
  68 |     });
  69 | 
  70 |     await page.route('/api/save*', async (route) => route.fulfill({ json: { success: true } }));
  71 |     await page.route('/api/bookings*', async (route) => route.fulfill({ json: { bookings: [] } }));
  72 |     await page.route('/api/resource-status*', async (route) => route.fulfill({ json: {} }));
  73 |     await page.route('/api/booking/get-staff*', async (route) => route.fulfill({ json: { staff: [] } }));
  74 | 
  75 |     page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  76 | 
  77 |     await page.goto('/admin2/index.html');
  78 |     
  79 |     const bookingEl = await page.getByText('高(1/4)').first();
  80 |     await bookingEl.waitFor({ state: 'visible', timeout: 10000 });
  81 |     
  82 |     await bookingEl.click({ force: true });
  83 |     
  84 |     await page.waitForSelector('text=服務項目', { timeout: 10000 });
  85 |     
  86 |     const serviceSelect = page.locator('select').nth(0);
> 87 |     await serviceSelect.selectOption('A4');
     |                         ^ Error: locator.selectOption: Test timeout of 30000ms exceeded.
  88 |     
  89 |     await page.waitForTimeout(1000);
  90 | 
  91 |     const errorMsg = page.getByText('❌ 足底區客滿').first();
  92 |     await expect(errorMsg).toBeVisible();
  93 | 
  94 |     const swalAlert = page.getByText('請問是否保持腳部');
  95 |     await expect(swalAlert).not.toBeVisible();
  96 | 
  97 |     console.log("✅ E2E TEST PASSED: Hệ thống chặn đúng lỗi thiếu ghế và KHÔNG báo chia thời gian sai!");
  98 | });
  99 | 
```