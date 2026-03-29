Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

function New-RoundedRectPath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $diameter = [Math]::Min($Radius * 2, [Math]::Min($Width, $Height))
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath

  if ($diameter -le 0) {
    $path.AddRectangle((New-Object System.Drawing.RectangleF($X, $Y, $Width, $Height)))
    $path.CloseFigure()
    return $path
  }

  $arc = New-Object System.Drawing.RectangleF($X, $Y, $diameter, $diameter)
  $path.AddArc($arc, 180, 90)
  $arc.X = $X + $Width - $diameter
  $path.AddArc($arc, 270, 90)
  $arc.Y = $Y + $Height - $diameter
  $path.AddArc($arc, 0, 90)
  $arc.X = $X
  $path.AddArc($arc, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-BrushFromHex {
  param([string]$Hex)
  return New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($Hex))
}

$root = Split-Path -Parent $PSScriptRoot
$iconDir = Join-Path $root "apps\\extension\\icons"
New-Item -ItemType Directory -Force -Path $iconDir | Out-Null

$sizes = 16, 32, 48, 128

$backgroundBrush = New-BrushFromHex "#1D473D"
$folderBrush = New-BrushFromHex "#FFF3D1"
$accentBrush = New-BrushFromHex "#C87A39"
$detailBrush = New-BrushFromHex "#2A5A4F"
$detailPen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml("#2A5A4F"), 1)
$bubbleDotBrush = New-BrushFromHex "#FFF3D1"

foreach ($size in $sizes) {
  $bitmap = New-Object System.Drawing.Bitmap $size, $size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $bgPath = New-RoundedRectPath 0 0 ($size - 1) ($size - 1) ($size * 0.24)
  $graphics.FillPath($backgroundBrush, $bgPath)

  $tabX = $size * 0.18
  $tabY = $size * 0.22
  $tabW = $size * 0.26
  $tabH = $size * 0.14
  $tabPath = New-RoundedRectPath $tabX $tabY $tabW $tabH ($size * 0.06)
  $graphics.FillPath($folderBrush, $tabPath)

  $bodyX = $size * 0.15
  $bodyY = $size * 0.31
  $bodyW = $size * 0.60
  $bodyH = $size * 0.44
  $bodyPath = New-RoundedRectPath $bodyX $bodyY $bodyW $bodyH ($size * 0.08)
  $graphics.FillPath($folderBrush, $bodyPath)

  $lineMargin = $size * 0.09
  $lineHeight = [Math]::Max(1.6, $size * 0.045)
  $lineWidth = $size * 0.32
  $line1 = New-Object System.Drawing.RectangleF(($bodyX + $lineMargin), ($bodyY + $size * 0.11), $lineWidth, $lineHeight)
  $line2 = New-Object System.Drawing.RectangleF(($bodyX + $lineMargin), ($bodyY + $size * 0.20), ($lineWidth * 0.82), $lineHeight)
  $line1Path = New-RoundedRectPath $line1.X $line1.Y $line1.Width $line1.Height ($lineHeight / 2)
  $line2Path = New-RoundedRectPath $line2.X $line2.Y $line2.Width $line2.Height ($lineHeight / 2)
  $graphics.FillPath($detailBrush, $line1Path)
  $graphics.FillPath($detailBrush, $line2Path)

  $bubbleX = $size * 0.57
  $bubbleY = $size * 0.47
  $bubbleW = $size * 0.24
  $bubbleH = $size * 0.22
  $bubblePath = New-RoundedRectPath $bubbleX $bubbleY $bubbleW $bubbleH ($size * 0.09)
  $graphics.FillPath($accentBrush, $bubblePath)

  $tail = New-Object System.Drawing.Drawing2D.GraphicsPath
  $tailP1X = [float]($bubbleX + ($bubbleW * 0.32))
  $tailP1Y = [float]($bubbleY + $bubbleH)
  $tailP2X = [float]($bubbleX + ($bubbleW * 0.48))
  $tailP2Y = [float]($bubbleY + $bubbleH + ($size * 0.07))
  $tailP3X = [float]($bubbleX + ($bubbleW * 0.58))
  $tailP3Y = [float]($bubbleY + ($bubbleH * 0.86))
  $tailPoints = [System.Drawing.PointF[]]@(
    ([System.Drawing.PointF]::new($tailP1X, $tailP1Y)),
    ([System.Drawing.PointF]::new($tailP2X, $tailP2Y)),
    ([System.Drawing.PointF]::new($tailP3X, $tailP3Y))
  )
  $tail.AddPolygon($tailPoints)
  $graphics.FillPath($accentBrush, $tail)

  $dotSize = [Math]::Max(1.3, $size * 0.035)
  $dotY = $bubbleY + $bubbleH * 0.40
  $dot1X = $bubbleX + $bubbleW * 0.22
  $dot2X = $bubbleX + $bubbleW * 0.45
  $graphics.FillEllipse($bubbleDotBrush, $dot1X, $dotY, $dotSize, $dotSize)
  $graphics.FillEllipse($bubbleDotBrush, $dot2X, $dotY, $dotSize, $dotSize)

  $target = Join-Path $iconDir ("icon{0}.png" -f $size)
  $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)

  $tail.Dispose()
  $line1Path.Dispose()
  $line2Path.Dispose()
  $bubblePath.Dispose()
  $bodyPath.Dispose()
  $tabPath.Dispose()
  $bgPath.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

$detailPen.Dispose()
$backgroundBrush.Dispose()
$folderBrush.Dispose()
$accentBrush.Dispose()
$detailBrush.Dispose()
$bubbleDotBrush.Dispose()
