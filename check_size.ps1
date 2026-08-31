Add-Type -AssemblyName System.Drawing
$inPath = "C:\Users\User\.gemini\antigravity\brain\888d57fa-47e3-4c5d-a4ad-a712358265f9\.user_uploaded\media_1788147673309.png"
$img = [System.Drawing.Image]::FromFile($inPath)
Write-Output "$($img.Width)x$($img.Height)"
$img.Dispose()
