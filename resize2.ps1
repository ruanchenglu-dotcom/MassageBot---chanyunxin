Add-Type -AssemblyName System.Drawing
$inPath = "C:\Users\User\.gemini\antigravity\brain\888d57fa-47e3-4c5d-a4ad-a712358265f9\.user_uploaded\media_1788147673309.png"
$outPath = "c:\MassageBot - qinshihuang\staff_richmenu_ready2.png"

$img = [System.Drawing.Image]::FromFile($inPath)
$bmpIn = New-Object System.Drawing.Bitmap($img)

# Get background color from top-left pixel
$bgColor = $bmpIn.GetPixel(0, 0)

$targetW = 1200
$targetH = 810

# Calculate new size while keeping aspect ratio
$ratio = $img.Width / $img.Height
$newH = $targetH
$newW = [math]::Round($newH * $ratio)

$bmpOut = New-Object System.Drawing.Bitmap($targetW, $targetH)
$g = [System.Drawing.Graphics]::FromImage($bmpOut)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# Fill background
$brush = New-Object System.Drawing.SolidBrush($bgColor)
$g.FillRectangle($brush, 0, 0, $targetW, $targetH)

# Draw centered
$x = [math]::Round(($targetW - $newW) / 2)
$y = 0
$g.DrawImage($img, $x, $y, $newW, $newH)

$bmpOut.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

$brush.Dispose()
$g.Dispose()
$bmpOut.Dispose()
$bmpIn.Dispose()
$img.Dispose()
