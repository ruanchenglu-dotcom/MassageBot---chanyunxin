with open(r"c:\MassageBot - qinshihuang\qinshihuang\js\cyx_views.js", "r", encoding="utf-8") as f:
    content = f.read()

bad_string = """    const renderTimelineContainer = (title, currentRows, scrollRef, onScrollHandler) => (
        {/* --- Tách Khung --- */}
        {/* --- Kéo vùng Timeline vào trong Scroll Container --- */}
            <div ref={scrollRef}"""

good_string = """    const renderTimelineContainer = (title, currentRows, scrollRef, onScrollHandler) => (
            <div ref={scrollRef}"""

content = content.replace(bad_string, good_string)

with open(r"c:\MassageBot - qinshihuang\qinshihuang\js\cyx_views.js", "w", encoding="utf-8") as f:
    f.write(content)
