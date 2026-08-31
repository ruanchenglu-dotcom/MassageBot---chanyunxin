Add-Type -AssemblyName System.Drawing
$inPath = "C:\Users\User\.gemini\antigravity\brain\888d57fa-47e3-4c5d-a4ad-a712358265f9\.user_uploaded\media_1788147673309.png"
$outPath = "c:\MassageBot - qinshihuang\staff_richmenu_perfect.png"

$img = [System.Drawing.Image]::FromFile($inPath)
$bmpIn = New-Object System.Drawing.Bitmap($img)

# Background color
$bgColor = $bmpIn.GetPixel(0, 0)

$targetW = 1200
$targetH = 810
$bmpOut = New-Object System.Drawing.Bitmap($targetW, $targetH)
$g = [System.Drawing.Graphics]::FromImage($bmpOut)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# Fill background
$brush = New-Object System.Drawing.SolidBrush($bgColor)
$g.FillRectangle($brush, 0, 0, $targetW, $targetH)

# Define source quadrants (Original is 800x762)
$halfSrcW = 400
$halfSrcH = 381

$srcTL = New-Object System.Drawing.Rectangle(0, 0, $halfSrcW, $halfSrcH)
$srcTR = New-Object System.Drawing.Rectangle($halfSrcW, 0, $halfSrcW, $halfSrcH)
$srcBL = New-Object System.Drawing.Rectangle(0, $halfSrcH, $halfSrcW, $halfSrcH)
$srcBR = New-Object System.Drawing.Rectangle($halfSrcW, $halfSrcH, $halfSrcW, $halfSrcH)

# Define destination quadrants in 1200x810
# X offset = (600 - 400)/2 = 100
# Y offset = (405 - 381)/2 = 12
$dstTL = New-Object System.Drawing.Rectangle(100, 12, $halfSrcW, $halfSrcH)
$dstTR = New-Object System.Drawing.Rectangle(700, 12, $halfSrcW, $halfSrcH)
$dstBL = New-Object System.Drawing.Rectangle(100, 417, $halfSrcW, $halfSrcH)
$dstBR = New-Object System.Drawing.Rectangle(700, 417, $halfSrcW, $halfSrcH)

# Draw pieces
$g.DrawImage($img, $dstTL, $srcTL, [System.Drawing.GraphicsUnit]::Pixel)
$g.DrawImage($img, $dstTR, $srcTR, [System.Drawing.GraphicsUnit]::Pixel)
$g.DrawImage($img, $dstBL, $srcBL, [System.Drawing.GraphicsUnit]::Pixel)
$g.DrawImage($img, $dstBR, $srcBR, [System.Drawing.GraphicsUnit]::Pixel)

# Draw lines to separate quadrants for the grid look (using a gold/yellow color from the image)
# Let's sample a pixel from the yellow line in the original image to get the exact color.
# The horizontal line is at Y=380, X=400 (approx center)
$lineColor = $bmpIn.GetPixel(400, 380)
$pen = New-Object System.Drawing.Pen($lineColor, 4)

# Draw horizontal line
$g.DrawLine($pen, 0, 405, 1200, 405)
# Draw vertical line
$g.DrawLine($pen, 600, 0, 600, 810)

$bmpOut.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

$pen.Dispose()
$brush.Dispose()
$g.Dispose()
$bmpOut.Dispose()
$bmpIn.Dispose()
$img.Dispose()
