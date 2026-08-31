Add-Type -AssemblyName System.Drawing
$inPath = "c:\MassageBot - qinshihuang\staffmenu.png"
$img = [System.Drawing.Image]::FromFile($inPath)
Write-Output "$($img.Width)x$($img.Height)"
$img.Dispose()
