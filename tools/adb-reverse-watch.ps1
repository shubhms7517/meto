# Development helper: har jude phone pe Metro (8081) + backend (4000) port forwarding zinda rakhta hai.
# USB connection toot ke wapas jude to forwarding apne aap dobara lag jaati hai.
# Chalane ke liye: powershell -ExecutionPolicy Bypass -File tools\adb-reverse-watch.ps1
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$ports = 8081, 4000

while ($true) {
  $devices = & $adb devices 2>$null | Select-Object -Skip 1 | Where-Object { $_ -match "`tdevice$" } | ForEach-Object { ($_ -split "`t")[0] }
  foreach ($d in $devices) {
    $list = (& $adb -s $d reverse --list 2>$null) -join ' '
    foreach ($p in $ports) {
      if ($list -notmatch "tcp:$p tcp:$p") {
        & $adb -s $d reverse "tcp:$p" "tcp:$p" | Out-Null
        Write-Output "$(Get-Date -Format HH:mm:ss) fixed tcp:$p on $d"
      }
    }
  }
  Start-Sleep -Seconds 3
}
