@echo off
echo Dang day code va deploy cho quan 1 (chanyunxin)...
git add .
git commit -m "%*"
git push origin main

echo.
echo XONG! Quan 1 da duoc cap nhat.
