import re

with open(r"c:\MassageBot - qinshihuang\qinshihuang\js\cyx_views.js", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Replace scrollContainerRef and add sync scroll logic
old_scroll_ref = """    const STATUS = getBookingStatus();
    const scrollContainerRef = useRef(null);"""

new_scroll_ref = """    const STATUS = getBookingStatus();
    const leftScrollRef = useRef(null);
    const rightScrollRef = useRef(null);
    const isSyncingLeft = useRef(false);
    const isSyncingRight = useRef(false);

    const handleLeftScroll = (e) => {
        if (isSyncingLeft.current) {
            isSyncingLeft.current = false;
            return;
        }
        if (rightScrollRef.current) {
            isSyncingRight.current = true;
            rightScrollRef.current.scrollLeft = e.target.scrollLeft;
            rightScrollRef.current.scrollTop = e.target.scrollTop;
        }
    };

    const handleRightScroll = (e) => {
        if (isSyncingRight.current) {
            isSyncingRight.current = false;
            return;
        }
        if (leftScrollRef.current) {
            isSyncingLeft.current = true;
            leftScrollRef.current.scrollLeft = e.target.scrollLeft;
            leftScrollRef.current.scrollTop = e.target.scrollTop;
        }
    };"""

content = content.replace(old_scroll_ref, new_scroll_ref)

# 2. Update scrollToNow
old_scroll_to_now = """    // --- NEW: SMOOTH SCROLL TO NOW ---
    const scrollToNow = (smooth = true) => {
        if (scrollContainerRef.current) {
            const scrollPos = nowLeftPos - 150;
            scrollContainerRef.current.scrollTo({
                left: scrollPos > 0 ? scrollPos : 0,
                behavior: smooth ? 'smooth' : 'auto'
            });
        }
    };"""

new_scroll_to_now = """    // --- NEW: SMOOTH SCROLL TO NOW ---
    const scrollToNow = (smooth = true) => {
        const scrollPos = nowLeftPos - 150;
        const finalLeft = scrollPos > 0 ? scrollPos : 0;
        if (leftScrollRef.current) {
            leftScrollRef.current.scrollTo({
                left: finalLeft,
                behavior: smooth ? 'smooth' : 'auto'
            });
        }
        if (rightScrollRef.current) {
            rightScrollRef.current.scrollTo({
                left: finalLeft,
                behavior: smooth ? 'smooth' : 'auto'
            });
        }
    };"""

content = content.replace(old_scroll_to_now, new_scroll_to_now)

# 3. Update rows definition
old_rows_def = """    let rows = [];
    const c_prefix = branch === 'main' 
        ? (window.SYSTEM_CONFIG?.UI_LABELS?.CHAIR_PREFIX1 || '腳1-')
        : (window.SYSTEM_CONFIG?.UI_LABELS?.CHAIR_PREFIX2 || '腳2-');
    const b_prefix = branch === 'main'
        ? (window.SYSTEM_CONFIG?.UI_LABELS?.BED_PREFIX1 || '床1-')
        : (window.SYSTEM_CONFIG?.UI_LABELS?.BED_PREFIX2 || '床2-');

    if (branch === 'main') {
        const numChairs = getMaxChairs();
        const numBeds = getMaxBeds();
        rows = [
            ...Array.from({ length: numChairs }, (_, i) => ({ id: `CHAIR-1-${i + 1}`, label: `${c_prefix}${i + 1}`, type: 'chair' })),
            ...Array.from({ length: numBeds }, (_, i) => ({ id: `BED-1-${i + 1}`, label: `${b_prefix}${i + 1}`, type: 'bed' }))
        ];
    } else {
        const oppChairs = getOppChairs();
        const oppBeds = getOppBeds();
        rows = [
            ...Array.from({ length: oppChairs }, (_, i) => ({ id: `CHAIR-2-${i + 1}`, label: `${c_prefix}${i + 1}`, type: 'chair' })),
            ...Array.from({ length: oppBeds }, (_, i) => ({ id: `BED-2-${i + 1}`, label: `${b_prefix}${i + 1}`, type: 'bed' }))
        ];
    }"""

new_rows_def = """    let chairRows = [];
    let bedRows = [];
    const c_prefix = branch === 'main' 
        ? (window.SYSTEM_CONFIG?.UI_LABELS?.CHAIR_PREFIX1 || '腳1-')
        : (window.SYSTEM_CONFIG?.UI_LABELS?.CHAIR_PREFIX2 || '腳2-');
    const b_prefix = branch === 'main'
        ? (window.SYSTEM_CONFIG?.UI_LABELS?.BED_PREFIX1 || '床1-')
        : (window.SYSTEM_CONFIG?.UI_LABELS?.BED_PREFIX2 || '床2-');

    if (branch === 'main') {
        const numChairs = getMaxChairs();
        const numBeds = getMaxBeds();
        chairRows = Array.from({ length: numChairs }, (_, i) => ({ id: `CHAIR-1-${i + 1}`, label: `${c_prefix}${i + 1}`, type: 'chair' }));
        bedRows = Array.from({ length: numBeds }, (_, i) => ({ id: `BED-1-${i + 1}`, label: `${b_prefix}${i + 1}`, type: 'bed' }));
    } else {
        const oppChairs = getOppChairs();
        const oppBeds = getOppBeds();
        chairRows = Array.from({ length: oppChairs }, (_, i) => ({ id: `CHAIR-2-${i + 1}`, label: `${c_prefix}${i + 1}`, type: 'chair' }));
        bedRows = Array.from({ length: oppBeds }, (_, i) => ({ id: `BED-2-${i + 1}`, label: `${b_prefix}${i + 1}`, type: 'bed' }));
    }"""

content = content.replace(old_rows_def, new_rows_def)

# 4. Extract render method and split timeline
# I need to match the return block
import re

return_regex = re.compile(
    r'(return \(\s*<div className="relative w-full h-\[calc\(100vh-170px\)\]">\s*)(?:\{/\* --- Kéo vùng Timeline.*?(<div ref=\{scrollContainerRef\}.*?</div>\s*</div>\s*</div>\s*)\{/\* \s*)(?=\{showStaffStats)',
    re.DOTALL
)

match = return_regex.search(content)
if not match:
    print("Could not find return block!")
    # Let's try simpler regex
    return_regex_2 = re.compile(
        r'(return \(\s*<div className="relative w-full h-\[calc\(100vh-170px\)\]">\s*)(?:\{/\* --- Kéo vùng.*?</style>\s*)?(<div style=\{\{ width:.*?</div>\s*</div>\s*</div>\s*</div>\s*)(?=\{showStaffStats)',
        re.DOTALL
    )
    # Wait, instead of regex, let's just find the indices manually.
    idx_start = content.find(r'{/* --- Kéo vùng Timeline')
    idx_end = content.find(r'{showStaffStats !== null')
    
    if idx_start != -1 and idx_end != -1:
        original_container = content[idx_start:idx_end]
        print("Found manually")
        inner_container = original_container
        
        inner_container = inner_container.replace('ref={scrollContainerRef}', 'ref={scrollRef} onScroll={onScrollHandler}')
        inner_container = inner_container.replace('rows.map((row, index)', 'currentRows.map((row, index)')
        inner_container = inner_container.replace('rows.reduce((acc', 'currentRows.reduce((acc')
        inner_container = inner_container.replace('>區域</div>', '>{title}</div>')
        
        render_func = f"""
    const renderTimelineContainer = (title, currentRows, scrollRef, onScrollHandler) => (
        {{/* --- Tách Khung --- */}}
        {inner_container.strip()}
    );
"""
        new_return = f"""{render_func}
    return (
        <div className="relative w-full h-[calc(100vh-170px)] flex flex-col">
            <div className="flex flex-row w-full h-full gap-2">
                {{renderTimelineContainer('腳', chairRows, leftScrollRef, handleLeftScroll)}}
                {{renderTimelineContainer('床', bedRows, rightScrollRef, handleRightScroll)}}
            </div>
            
            {{"""
        
        content = content[:idx_start] + new_return + content[idx_end+1:]
        
        with open(r"c:\MassageBot - qinshihuang\qinshihuang\js\cyx_views.js", "w", encoding="utf-8") as f:
            f.write(content)
        print("Successfully updated cyx_views.js")
    else:
        print("Could not find block manually")
else:
    print("Regex matched!")
