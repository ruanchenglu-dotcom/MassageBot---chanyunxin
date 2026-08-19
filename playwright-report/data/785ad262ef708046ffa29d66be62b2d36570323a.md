# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: combo_group_upgrade_capacity_frontend.spec.js >> Cho phép đổi nhóm 4 người sang Combo khi không đủ chỗ cục bộ nhưng có thể chẻ luồng
- Location: tests\combo_group_upgrade_capacity_frontend.spec.js:5:1

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
    40 × waiting for element to be visible and enabled
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
    - generic [ref=e83]: 
    - generic [ref=e89]: 
    - generic [ref=e95]: 
    - generic [ref=e101]: 
  - main [ref=e107]:
    - generic [ref=e111]:
      - generic: 19:13 現在
      - generic "雙擊回到現在" [ref=e112] [cursor=pointer]:
        - generic [ref=e113]: 區域
        - generic [ref=e114]:
          - generic [ref=e115]:
            - generic [ref=e116]: 8:00
            - button "" [ref=e117]
          - generic [ref=e119]:
            - generic [ref=e120]: 9:00
            - button "" [ref=e121]
          - generic [ref=e123]:
            - generic [ref=e124]: 10:00
            - button "" [ref=e125]
          - generic [ref=e127]:
            - generic [ref=e128]: 11:00
            - button "" [ref=e129]
          - generic [ref=e131]:
            - generic [ref=e132]: 12:00
            - button "" [ref=e133]
          - generic [ref=e135]:
            - generic [ref=e136]: 13:00
            - button "" [ref=e137]
          - generic [ref=e139]:
            - generic [ref=e140]: 14:00
            - button "" [ref=e141]
          - generic [ref=e143]:
            - generic [ref=e144]: 15:00
            - button "" [ref=e145]
          - generic [ref=e147]:
            - generic [ref=e148]: 16:00
            - button "" [ref=e149]
          - generic [ref=e151]:
            - generic [ref=e152]: 17:00
            - button "" [ref=e153]
          - generic [ref=e155]:
            - generic [ref=e156]: 18:00
            - button "" [ref=e157]
          - generic [ref=e159]:
            - generic [ref=e160]: 19:00
            - button "" [ref=e161]
          - generic [ref=e163]:
            - generic [ref=e164]: 20:00
            - button "" [ref=e165]
          - generic [ref=e167]:
            - generic [ref=e168]: 21:00
            - button "" [ref=e169]
          - generic [ref=e171]:
            - generic [ref=e172]: 22:00
            - button "" [ref=e173]
          - generic [ref=e175]:
            - generic [ref=e176]: 23:00
            - button "" [ref=e177]
          - generic [ref=e179]:
            - generic [ref=e180]: 0:00
            - button "" [ref=e181]
          - generic [ref=e183]:
            - generic [ref=e184]: 1:00
            - button "" [ref=e185]
          - generic [ref=e187]:
            - generic [ref=e188]: 2:00
            - button "" [ref=e189]
          - generic [ref=e191]:
            - generic [ref=e192]: 3:00
            - button "" [ref=e193]
          - generic [ref=e195]:
            - generic [ref=e196]: 4:00
            - button "" [ref=e197]
      - generic [ref=e199]:
        - generic [ref=e200]:
          - generic "拖曳此處以互換整排客人" [ref=e201]: 腳1-1
          - generic "腳底按摩 (60分)" [ref=e203] [cursor=pointer]:
            - generic [ref=e204]: 方(1/4)
            - generic [ref=e206]:
              - generic [ref=e207]: FootStaff1
              - generic [ref=e208]: 19:01
            - button "" [ref=e209]
        - generic [ref=e211]:
          - generic "拖曳此處以互換整排客人" [ref=e212]: 腳1-2
          - generic "腳底按摩 (60分)" [ref=e214] [cursor=pointer]:
            - generic [ref=e215]: 方(2/4)
            - generic [ref=e217]:
              - generic [ref=e218]: FootStaff2
              - generic [ref=e219]: 19:01
            - button "" [ref=e220]
        - generic [ref=e222]:
          - generic "拖曳此處以互換整排客人" [ref=e223]: 腳1-3
          - generic "腳底按摩 (60分)" [ref=e225] [cursor=pointer]:
            - generic [ref=e226]: 方(3/4)
            - generic [ref=e228]:
              - generic [ref=e229]: FootStaff3
              - generic [ref=e230]: 19:01
            - button "" [ref=e231]
        - generic [ref=e233]:
          - generic "拖曳此處以互換整排客人" [ref=e234]: 腳1-4
          - generic "腳底按摩 (60分)" [ref=e236] [cursor=pointer]:
            - generic [ref=e237]: 方(4/4)
            - generic [ref=e239]:
              - generic [ref=e240]: FootStaff4
              - generic [ref=e241]: 19:01
            - button "" [ref=e242]
        - generic "拖曳此處以互換整排客人" [ref=e245]: 腳1-5
        - generic "拖曳此處以互換整排客人" [ref=e248]: 腳1-6
        - generic [ref=e250]:
          - generic "拖曳此處以互換整排客人" [ref=e251]: 床1-1
          - generic "身體按摩 (120分)" [ref=e253] [cursor=pointer]:
            - generic [ref=e254]: 高(1/4)
            - generic [ref=e256]:
              - generic [ref=e257]: BodyStaff1
              - generic [ref=e258]: 20:01
            - button "" [active] [ref=e259]
        - generic [ref=e261]:
          - generic "拖曳此處以互換整排客人" [ref=e262]: 床1-2
          - generic "身體按摩 (120分)" [ref=e264] [cursor=pointer]:
            - generic [ref=e265]: 高(2/4)
            - generic [ref=e267]:
              - generic [ref=e268]: BodyStaff2
              - generic [ref=e269]: 20:01
            - button "" [ref=e270]
        - generic [ref=e272]:
          - generic "拖曳此處以互換整排客人" [ref=e273]: 床1-3
          - generic "身體按摩 (120分)" [ref=e275] [cursor=pointer]:
            - generic [ref=e276]: 高(3/4)
            - generic [ref=e278]:
              - generic [ref=e279]: BodyStaff3
              - generic [ref=e280]: 20:01
            - button "" [ref=e281]
        - generic [ref=e283]:
          - generic "拖曳此處以互換整排客人" [ref=e284]: 床1-4
          - generic "身體按摩 (120分)" [ref=e286] [cursor=pointer]:
            - generic [ref=e287]: 高(4/4)
            - generic [ref=e289]:
              - generic [ref=e290]: BodyStaff4
              - generic [ref=e291]: 20:01
            - button "" [ref=e292]
        - generic "拖曳此處以互換整排客人" [ref=e295]: 床1-5
        - generic "拖曳此處以互換整排客人" [ref=e298]: 床1-6
  - generic [ref=e301]:
    - generic [ref=e303]:
      - generic [ref=e304]:
        - generic [ref=e305]:
          - generic [ref=e306]: "#target-body-group-1"
          - generic [ref=e307]:
            - generic [ref=e308]: 
            - text: 床1-1
          - generic [ref=e309]: 等待中
          - generic [ref=e310]:
            - button "💧 油推" [ref=e311] [cursor=pointer]
            - button "🩸 刮痧" [ref=e312] [cursor=pointer]
            - button "🏺 滑罐" [ref=e313] [cursor=pointer]
            - button "🎯 拔罐" [ref=e314] [cursor=pointer]
        - heading "高(1/4)" [level=2] [ref=e315]
        - generic [ref=e316]:
          - generic [ref=e317]:
            - generic [ref=e318]: 
            - text: "---"
          - generic [ref=e319]:
            - generic [ref=e320]: 
            - text: 1 人
      - generic [ref=e321]:
        - generic [ref=e323]:
          - generic [ref=e324]: 
          - text: "指定: BodyStaff1"
        - button "" [ref=e325] [cursor=pointer]
        - button "" [ref=e327] [cursor=pointer]
    - generic [ref=e329]:
      - generic [ref=e330]:
        - generic [ref=e331]:
          - generic [ref=e332]:
            - generic [ref=e333]: 安排服務師傅與節數 (Blocks)
            - generic [ref=e334]:
              - generic [ref=e335]:
                - combobox [ref=e336] [cursor=pointer]:
                  - option "尚未安排 (等待中)"
                  - option "BodyStaff1" [selected]
                  - option "BodyStaff2"
                  - option "BodyStaff3"
                  - option "BodyStaff4"
                  - option "FootStaff1"
                  - option "FootStaff2"
                  - option "FootStaff3"
                  - option "FootStaff4"
                  - option "ExtraStaff1"
                  - option "ExtraStaff2"
                  - option "ExtraStaff3"
                  - option "ExtraStaff4"
                - generic: 
              - combobox [disabled] [ref=e338]:
                - option "1 節"
                - option "2 節"
                - option "3 節"
                - option "4 節" [selected]
            - generic [ref=e339]:
              - button " 拆單" [ref=e341] [cursor=pointer]:
                - generic [ref=e342]: 
                - text: 拆單
              - generic [ref=e343]: 接手
          - generic [ref=e345]: 服務項目
          - generic [ref=e346]:
            - combobox [ref=e347]:
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
        - generic [ref=e349]:
          - generic [ref=e350]: 剩餘時間
          - generic [ref=e351]: "--:--"
          - generic [ref=e352]:
            - text: "總共:"
            - generic [ref=e353]: "120"
            - text: 分鐘
      - generic [ref=e354]:
        - generic [ref=e355]:
          - heading " 單項服務調整" [level=3] [ref=e356]:
            - generic [ref=e357]: 
            - text: 單項服務調整
          - button " 保存同步" [ref=e358] [cursor=pointer]:
            - generic [ref=e359]: 
            - text: 保存同步
        - generic [ref=e360]:
          - generic [ref=e361]:
            - generic [ref=e362]: 開始時間
            - generic [ref=e363]:
              - generic [ref=e364]: 
              - generic [ref=e365]:
                - combobox [ref=e366] [cursor=pointer]:
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
                - generic [ref=e367]: ":"
                - combobox [ref=e368] [cursor=pointer]:
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
          - generic [ref=e369]:
            - generic [ref=e370]: 
            - generic [ref=e371]: 120分
          - generic [ref=e372]:
            - generic [ref=e373]: 結束時間
            - generic [ref=e374]:
              - generic [ref=e375]: 
              - text: 20:00
        - generic [ref=e376]:
          - generic [ref=e377]: 安排座位/床位
          - generic [ref=e378]:
            - combobox [ref=e379] [cursor=pointer]:
              - option "🤖 自動安排 (Auto)"
              - option "🛏️ 床1-1" [selected]
              - option "🛏️ 床1-2 (已佔用)" [disabled]
              - option "🛏️ 床1-3 (已佔用)" [disabled]
              - option "🛏️ 床1-4 (已佔用)" [disabled]
              - option "🛏️ 床1-5"
              - option "🛏️ 床1-6"
            - generic: 
    - generic [ref=e381]:
      - button " 開始" [ref=e382] [cursor=pointer]:
        - generic [ref=e383]: 
        - generic [ref=e384]: 開始
      - button " 結帳" [ref=e385] [cursor=pointer]:
        - generic [ref=e386]: 
        - generic [ref=e387]: 結帳
      - button " 完成" [ref=e388] [cursor=pointer]:
        - generic [ref=e389]: 
        - generic [ref=e390]: 完成
      - button " 取消" [ref=e391] [cursor=pointer]:
        - generic [ref=e392]: 
        - generic [ref=e393]: 取消
      - button " 爽約" [ref=e394] [cursor=pointer]:
        - generic [ref=e395]: 
        - generic [ref=e396]: 爽約
```

# Test source

```ts
  2   | 
  3   | test.use({ baseURL: 'http://localhost:5001' });
  4   | 
  5   | test('Cho phép đổi nhóm 4 người sang Combo khi không đủ chỗ cục bộ nhưng có thể chẻ luồng', async ({ page }) => {
  6   |     const today = new Date();
  7   |     const yyyy = today.getFullYear();
  8   |     const mm = String(today.getMonth() + 1).padStart(2, '0');
  9   |     const dd = String(today.getDate()).padStart(2, '0');
  10  |     const dateStr = `${yyyy}/${mm}/${dd}`;
  11  | 
  12  |     const mockBookings = [];
  13  | 
  14  |     // 4 khách Body ở giường (18:00 - 20:00, 120 mins)
  15  |     for (let i = 1; i <= 4; i++) {
  16  |         mockBookings.push({
  17  |             rowId: `target-body-group-${i}`,
  18  |             date: dateStr,
  19  |             startTimeString: `${dateStr} 18:00:00`,
  20  |             startTime: "18:00",
  21  |             originalName: `高(${i}/4)`,
  22  |             customerName: `高(${i}/4)`,
  23  |             serviceName: "身體按摩 (120分)",
  24  |             cleanServiceName: "身體按摩 (120分)",
  25  |             duration: 120,
  26  |             status: "等待中",
  27  |             resourceId: `BED-1-${i}`,
  28  |             current_resource_id: `BED-1-${i}`,
  29  |             location: `BED-1-${i}`,
  30  |             staffId: `BodyStaff${i}`,
  31  |             flow: "BODYSINGLE",
  32  |             type: "SINGLE",
  33  |             group_id: "test-group-4-body",
  34  |             pax: 1
  35  |         });
  36  |     }
  37  | 
  38  |     // 4 khách Foot ở ghế (18:00 - 19:00, 60 mins)
  39  |     for (let i = 1; i <= 4; i++) {
  40  |         mockBookings.push({
  41  |             rowId: `occupier-chair-${i}`,
  42  |             date: dateStr,
  43  |             startTimeString: `${dateStr} 18:00:00`,
  44  |             startTime: "18:00",
  45  |             originalName: `方(${i}/4)`,
  46  |             customerName: `方(${i}/4)`,
  47  |             serviceName: "腳底按摩 (60分)",
  48  |             cleanServiceName: "腳底按摩 (60分)",
  49  |             duration: 60,
  50  |             status: "等待中",
  51  |             resourceId: `CHAIR-1-${i}`,
  52  |             current_resource_id: `CHAIR-1-${i}`,
  53  |             location: `CHAIR-1-${i}`,
  54  |             staffId: `FootStaff${i}`,
  55  |             flow: "FOOTSINGLE",
  56  |             type: "SINGLE"
  57  |         });
  58  |     }
  59  | 
  60  |     await page.route('**/api/info*', async (route) => {
  61  |         const json = {
  62  |             bookings: mockBookings,
  63  |             timeline: [],
  64  |             staffList: [
  65  |                 { id: "BodyStaff1" }, { id: "BodyStaff2" }, { id: "BodyStaff3" }, { id: "BodyStaff4" },
  66  |                 { id: "FootStaff1" }, { id: "FootStaff2" }, { id: "FootStaff3" }, { id: "FootStaff4" },
  67  |                 { id: "ExtraStaff1" }, { id: "ExtraStaff2" }, { id: "ExtraStaff3" }, { id: "ExtraStaff4" }
  68  |             ],
  69  |             statusData: {},
  70  |             resourceState: {}
  71  |         };
  72  |         await route.fulfill({ json });
  73  |     });
  74  | 
  75  |     await page.route('/api/save*', async (route) => route.fulfill({ json: { success: true } }));
  76  |     await page.route('/api/bookings*', async (route) => route.fulfill({ json: { bookings: [] } }));
  77  |     await page.route('/api/resource-status*', async (route) => route.fulfill({ json: {} }));
  78  |     await page.route('/api/booking/get-staff*', async (route) => route.fulfill({ json: { staff: [] } }));
  79  | 
  80  |     page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  81  | 
  82  |     await page.goto('/admin2/index.html');
  83  |     
  84  |     const bookingEl = await page.getByText('高(1/4)').first();
  85  |     await bookingEl.waitFor({ state: 'visible', timeout: 10000 });
  86  |     
  87  |     // Mở modal
  88  |     await bookingEl.click({ force: true });
  89  |     await page.waitForSelector('text=服務項目', { timeout: 10000 });
  90  |     
  91  |     // Giả sử modal có nút Toggle cho isGroupMode, hoặc nó tự bật vì group_id giống nhau.
  92  |     // Nếu nó không tự bật, ta sẽ tìm nút "同步中" hoặc "單筆" để toggle.
  93  |     // UI thường có 1 nút ghi "單筆" (Single) hoặc "同步中" (Syncing).
  94  |     const syncButton = page.locator('button').filter({ hasText: '單筆' }).first();
  95  |     if (await syncButton.isVisible()) {
  96  |         await syncButton.click(); // Click để chuyển sang Đồng bộ nhóm (Syncing)
  97  |         await page.waitForTimeout(500);
  98  |     }
  99  |     
  100 |     // Đổi gói sang 套餐 (130分) -> Value A4
  101 |     const serviceSelect = page.locator('select').nth(0);
> 102 |     await serviceSelect.selectOption('A4');
      |                         ^ Error: locator.selectOption: Test timeout of 30000ms exceeded.
  103 |     
  104 |     await page.waitForTimeout(1000);
  105 | 
  106 |     // Kì vọng: Không báo "❌ 足底區客滿", mà báo "✅ 系統將自動為群組分配最佳流程組合"
  107 |     const successMsg = page.getByText('系統將自動為群組分配最佳流程組合').first();
  108 |     await expect(successMsg).toBeVisible();
  109 | 
  110 |     console.log("✅ E2E TEST PASSED: Hệ thống đã nhường quyền xếp flow cho nhóm 4 người đổi sang Combo cho Backend!");
  111 | });
  112 | 
```