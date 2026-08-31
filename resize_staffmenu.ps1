Add-Type -AssemblyName System.Drawing
$inPath = "c:\MassageBot - qinshihuang\staffmenu.png"
$outPath = "c:\MassageBot - qinshihuang\staff_richmenu_final.png"

$img = [System.Drawing.Image]::FromFile($inPath)

$targetW = 800
$targetH = 540

$bmpOut = New-Object System.Drawing.Bitmap($targetW, $targetH)
$g = [System.Drawing.Graphics]::FromImage($bmpOut)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

$destRect = New-Object System.Drawing.Rectangle(0, 0, $targetW, $targetH)
$srcRect = New-Object System.Drawing.Rectangle(0, 0, $img.Width, $img.Height)

$g.DrawImage($img, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

$bmpOut.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmpOut.Dispose()
$img.Dispose()
