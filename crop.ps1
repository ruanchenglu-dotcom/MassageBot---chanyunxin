Add-Type -AssemblyName System.Drawing
$inPath = "C:\Users\User\.gemini\antigravity\brain\888d57fa-47e3-4c5d-a4ad-a712358265f9\.user_uploaded\media_1788147673309.png"
$outPath = "c:\MassageBot - qinshihuang\staff_richmenu_cropped.png"

$img = [System.Drawing.Image]::FromFile($inPath)

$targetW = 1200
$targetH = 810
$targetRatio = $targetW / $targetH
$imgRatio = $img.Width / $img.Height

# We need to crop top/bottom because original (1.05) is taller than target (1.48)
$cropW = $img.Width
$cropH = [math]::Round($cropW / $targetRatio) # 800 / 1.48 = 540
$cropY = [math]::Round(($img.Height - $cropH) / 2)
$cropX = 0

$bmpOut = New-Object System.Drawing.Bitmap($targetW, $targetH)
$g = [System.Drawing.Graphics]::FromImage($bmpOut)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# Draw the cropped portion scaled to target size
$srcRect = New-Object System.Drawing.Rectangle($cropX, $cropY, $cropW, $cropH)
$destRect = New-Object System.Drawing.Rectangle(0, 0, $targetW, $targetH)
$g.DrawImage($img, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

$bmpOut.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmpOut.Dispose()
$img.Dispose()
