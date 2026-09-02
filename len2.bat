@echo off
echo Dang day code va deploy cho quan 2 (zhongli - Render)...
git add .
git commit -m "%*"
git push render main --force

echo.
echo XONG! Quan 2 da duoc cap nhat va Render se tu chay.
