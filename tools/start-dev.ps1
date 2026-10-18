# Meto dev: database + backend + Metro ek saath (jo pehle se chal raha hai wo dobara nahi)
# Chalao:  powershell -ExecutionPolicy Bypass -File D:\meto\tools\start-dev.ps1
$ErrorActionPreference = 'SilentlyContinue'
$root = 'D:\meto'
$logs = Join-Path $root 'tools\logs'
New-Item -ItemType Directory -Force $logs | Out-Null

function Listening($port) { [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }
function WaitPort($port, $sec) { for ($i = 0; $i -lt $sec; $i++) { if (Listening $port) { return $true }; Start-Sleep 1 }; return $false }

# 0) Admin panel ka build (backend /admin pe dikhata hai) — na ho to banao
if (-not (Test-Path "$root\admin\dist\index.html")) {
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "cd /d $root\admin && npm run build > `"$logs\admin-build.log`" 2>&1" -WindowStyle Hidden -Wait
  if (Test-Path "$root\admin\dist\index.html") { 'Admin build: done' } else { 'Admin build: FAILED - see tools\logs\admin-build.log' }
}

# 1) Database (XAMPP MariaDB)
if (-not (Listening 3306)) {
  Start-Process -FilePath 'C:\xampp\mysql\bin\mysqld.exe' -ArgumentList '--defaults-file=C:\xampp\mysql\bin\my.ini', '--standalone' -WindowStyle Hidden
  if (WaitPort 3306 30) { 'Database   : started (3306)' } else { 'Database   : FAILED to start' }
} else { 'Database   : already running (3306)' }

# 2) Backend (API + socket)
if (-not (Listening 4000)) {
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "cd /d $root\backend && npm run dev > `"$logs\backend.log`" 2>&1" -WindowStyle Hidden
  if (WaitPort 4000 60) { 'Backend    : started (4000)' } else { 'Backend    : FAILED — see tools\logs\backend.log' }
} else { 'Backend    : already running (4000)' }

# 3) Metro (app ka JS)
if (-not (Listening 8081)) {
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "cd /d $root\mobile && npx react-native start > `"$logs\metro.log`" 2>&1" -WindowStyle Hidden
  if (WaitPort 8081 90) { 'Metro      : started (8081)' } else { 'Metro      : FAILED — see tools\logs\metro.log' }
} else { 'Metro      : already running (8081)' }

# App ka code pehle se bana ke rakho — phone pe app jaldi khule
try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 600 'http://localhost:8081/index.bundle?platform=android&dev=true&minify=false' | Out-Null; 'App bundle : ready' } catch { 'App bundle : will build when the app opens' }

$ip = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi' -ErrorAction SilentlyContinue).IPAddress
"PC WiFi IP : $ip  (phone me Metro address: ${ip}:8081)"
"Admin panel: http://${ip}:4000/admin/"
if ($ip -and $ip -ne '192.168.1.13') { 'WARNING: PC ka IP badal gaya — phone me naya address daalna padega (tools\set-metro-host.ps1)' }
