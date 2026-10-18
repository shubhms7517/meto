param([string]$HostPort = '192.168.1.13:8081')
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$devices = & $adb devices | Select-Object -Skip 1 | Where-Object { $_ -match "`tdevice$" } | ForEach-Object { ($_ -split "`t")[0] }
foreach ($s in $devices) {
  & $adb -s $s shell am force-stop com.meto
  $cur = (& $adb -s $s shell "run-as com.meto cat shared_prefs/com.meto_preferences.xml" 2>$null) -join "`n"
  if ($cur -notmatch '<map') { $cur = "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>`n<map>`n</map>" }
  $lines = $cur -split "`n" | Where-Object { $_ -notmatch 'debug_http_host' }
  $out = ($lines -join "`n").Replace('</map>', "    <string name=`"debug_http_host`">$HostPort</string>`n</map>")
  $tmp = Join-Path $dir "prefs_$s.xml"
  [System.IO.File]::WriteAllText($tmp, $out.Replace("`r", ''), (New-Object System.Text.UTF8Encoding $false))
  & $adb -s $s push $tmp /data/local/tmp/meto_prefs.xml | Out-Null
  & $adb -s $s shell "run-as com.meto mkdir -p shared_prefs; run-as com.meto cp /data/local/tmp/meto_prefs.xml shared_prefs/com.meto_preferences.xml"
  $check = (& $adb -s $s shell "run-as com.meto cat shared_prefs/com.meto_preferences.xml") -join ' '
  "$s : " + ([regex]::Match($check, 'debug_http_host">([^<]*)').Groups[1].Value)
}
