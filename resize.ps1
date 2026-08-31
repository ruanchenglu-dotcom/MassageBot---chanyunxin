Add-Type -AssemblyName System.Drawing
$inPath = "C:\Users\User\.gemini\antigravity\brain\888d57fa-47e3-4c5d-a4ad-a712358265f9\.user_uploaded\media_1788147673309.png"
$outPath = "c:\MassageBot - qinshihuang\staff_richmenu_ready.png"
$img = [System.Drawing.Image]::FromFile($inPath)
$bmp = New-Object System.Drawing.Bitmap(1200, 810)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($img, 0, 0, 1200, 810)
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
$img.Dispose()
