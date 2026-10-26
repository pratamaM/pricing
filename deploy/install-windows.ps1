<#
.SYNOPSIS
  Install aplikasi Pricing di Windows Server supaya jalan otomatis dan bisa diakses online.

.DESCRIPTION
  - Memasang Node.js LTS bila belum ada
  - npm install, membuat SESSION_SECRET acak dan password superadmin awal
  - Menjalankan server sebagai Scheduled Task (SYSTEM, otomatis hidup saat boot, restart bila crash)
  - Membuka Windows Firewall
  - Opsional: HTTPS + domain lewat Caddy (sertifikat Let's Encrypt otomatis)

.EXAMPLE
  # Akses lewat IP publik: http://IP-SERVER:3000
  powershell -ExecutionPolicy Bypass -File .\deploy\install-windows.ps1

.EXAMPLE
  # Akses lewat domain dengan HTTPS (DNS A record domain harus sudah mengarah ke IP server)
  powershell -ExecutionPolicy Bypass -File .\deploy\install-windows.ps1 -Domain pricing.perusahaan.com

.EXAMPLE
  # Hapus service (data di database\pricing.db tidak dihapus)
  powershell -ExecutionPolicy Bypass -File .\deploy\install-windows.ps1 -Uninstall
#>
[CmdletBinding()]
param(
    [int]$Port = 3000,
    [string]$Domain = '',
    [string]$AdminPassword = '',
    [string]$AppDir = '',
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$AppTask   = 'PricingApp'
$CaddyTask = 'PricingCaddy'
$CaddyDir  = 'C:\caddy'

function Step($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

# ---- Harus Administrator ----
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Fail 'Jalankan PowerShell sebagai Administrator (klik kanan > Run as administrator).'
}

# ---- Lokasi aplikasi: folder induk dari folder deploy ----
if (-not $AppDir) { $AppDir = Split-Path -Parent $PSScriptRoot }
$AppDir = (Resolve-Path $AppDir).Path

function Stop-AppProcesses {
    Stop-ScheduledTask -TaskName $AppTask -ErrorAction SilentlyContinue
    # sisa proses node yang menjalankan server.js (mis. dari percobaan manual sebelumnya)
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*server.js*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

# ---- Uninstall ----
if ($Uninstall) {
    Step 'Menghapus service Pricing'
    Stop-AppProcesses
    foreach ($t in @($AppTask, $CaddyTask)) {
        if ($t -eq $CaddyTask) { Stop-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue; Get-Process caddy -ErrorAction SilentlyContinue | Stop-Process -Force }
        Unregister-ScheduledTask -TaskName $t -Confirm:$false -ErrorAction SilentlyContinue
    }
    Get-NetFirewallRule -DisplayName 'Pricing App*' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    Write-Host 'Selesai. Folder aplikasi dan database\pricing.db tidak dihapus.' -ForegroundColor Green
    exit 0
}

if (-not (Test-Path (Join-Path $AppDir 'server.js'))) { Fail "server.js tidak ditemukan di $AppDir. Jalankan script dari dalam folder aplikasi (deploy\install-windows.ps1)." }
if ($Port -lt 1 -or $Port -gt 65535) { Fail 'Port tidak valid.' }

# ---- 0. Cek port: jangan menabrak aplikasi lain ----
Step "Memeriksa port yang dipakai"
Stop-AppProcesses   # sisa instalasi Pricing sebelumnya dihentikan dulu supaya tidak dianggap bentrok
$cekPorts = @($Port)
if ($Domain) { $cekPorts += 80, 443 }
$bentrok = $false
foreach ($pt in ($cekPorts | Select-Object -Unique)) {
    $dipakai = Get-NetTCPConnection -State Listen -LocalPort $pt -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($dipakai) {
        $proc = Get-Process -Id $dipakai.OwningProcess -ErrorAction SilentlyContinue
        $nama = if ($proc) { "$($proc.ProcessName) (PID $($dipakai.OwningProcess))" } else { "PID $($dipakai.OwningProcess)" }
        Write-Host "Port $pt SUDAH DIPAKAI oleh $nama." -ForegroundColor Red
        $bentrok = $true
    } else {
        Write-Host "Port $pt bebas." -ForegroundColor Green
    }
}
if ($bentrok) { Fail 'Ada port yang sudah dipakai aplikasi lain. Jalankan ulang dengan port lain, mis. -Port 8081. Tidak ada yang diubah.' }

# ---- 1. Node.js ----
Step 'Memeriksa Node.js'
function Get-NodeMajor {
    try { return [int]((& node -v) -replace '^v(\d+)\..*', '$1') } catch { return 0 }
}
if ((Get-NodeMajor) -lt 18) {
    Write-Host 'Node.js 18+ belum ada, mengunduh versi LTS terbaru...'
    $index = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
    $lts = $index | Where-Object { $_.lts } | Select-Object -First 1
    $ver = $lts.version
    $msi = Join-Path $env:TEMP "node-$ver-x64.msi"
    Invoke-WebRequest "https://nodejs.org/dist/$ver/node-$ver-x64.msi" -OutFile $msi -UseBasicParsing
    $p = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait -PassThru
    if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { Fail "Instalasi Node.js gagal (kode $($p.ExitCode))." }
    Remove-Item $msi -Force -ErrorAction SilentlyContinue
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
if ((Get-NodeMajor) -lt 18) { Fail 'Node.js tidak terdeteksi setelah instalasi. Buka PowerShell baru lalu jalankan ulang script.' }
$NodeExe = (Get-Command node).Source
Write-Host "Node.js $(& node -v) di $NodeExe"

# ---- 2. Dependensi ----
Step 'Menjalankan npm install'
Stop-AppProcesses
Push-Location $AppDir
try {
    & npm install --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Fail 'npm install gagal. Periksa koneksi internet server.' }
} finally { Pop-Location }

# ---- 3. Rahasia & start.cmd ----
Step 'Menyiapkan konfigurasi'
function New-RandomString([int]$bytes) {
    $b = New-Object byte[] $bytes
    $rng = New-Object Security.Cryptography.RNGCryptoServiceProvider
    $rng.GetBytes($b); $rng.Dispose()
    return ([BitConverter]::ToString($b) -replace '-', '').ToLower()
}
$dbExists = Test-Path (Join-Path $AppDir 'database\pricing.db')
$logDir = Join-Path $AppDir 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$startCmd = Join-Path $AppDir 'start-server.cmd'

# SESSION_SECRET dipertahankan antar-install supaya user tidak ter-logout
$secret = $null
if (Test-Path $startCmd) {
    $m = Select-String -Path $startCmd -Pattern '^set SESSION_SECRET=(.+)$' | Select-Object -First 1
    if ($m) { $secret = $m.Matches[0].Groups[1].Value.Trim() }
}
if (-not $secret) { $secret = New-RandomString 32 }

$passwordGenerated = $false
if (-not $AdminPassword) { $AdminPassword = New-RandomString 8; $passwordGenerated = $true }

function Write-StartCmd([bool]$withPassword) {
    $lines = @('@echo off', "cd /d `"$AppDir`"", "set PORT=$Port", "set SESSION_SECRET=$secret")
    if ($withPassword) { $lines += "set SUPERADMIN_PASSWORD=$AdminPassword" }
    $lines += "`"$NodeExe`" server.js >> `"$logDir\server.log`" 2>&1"
    Set-Content -Path $startCmd -Value $lines -Encoding ASCII
    # hanya SYSTEM dan Administrators yang boleh membaca (isinya rahasia)
    & icacls $startCmd /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null
}
Write-StartCmd $true

# ---- 4. Scheduled Task (jalan saat boot, restart otomatis) ----
Step 'Mendaftarkan service (Scheduled Task)'
function Register-AutoTask([string]$name, [string]$exe, [string]$arguments, [string]$workDir) {
    $action   = New-ScheduledTaskAction -Execute $exe -Argument $arguments -WorkingDirectory $workDir
    $trigger  = New-ScheduledTaskTrigger -AtStartup
    $princ    = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
                  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $princ -Settings $settings -Force | Out-Null
}
Register-AutoTask $AppTask 'cmd.exe' "/c `"$startCmd`"" $AppDir

# ---- 5. Firewall ----
Step 'Mengatur Windows Firewall'
Get-NetFirewallRule -DisplayName 'Pricing App*' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
if ($Domain) {
    New-NetFirewallRule -DisplayName 'Pricing App HTTP (80)'  -Direction Inbound -Protocol TCP -LocalPort 80  -Action Allow | Out-Null
    New-NetFirewallRule -DisplayName 'Pricing App HTTPS (443)' -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow | Out-Null
    Write-Host 'Port 80 dan 443 dibuka. Port aplikasi tidak dibuka langsung (diakses lewat Caddy).'
} else {
    New-NetFirewallRule -DisplayName "Pricing App ($Port)" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
    Write-Host "Port $Port dibuka."
}

# ---- 6. Start & cek ----
Step 'Menjalankan server'
Start-ScheduledTask -TaskName $AppTask
$ok = $false
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 1
    try { $r = Invoke-WebRequest "http://localhost:$Port/" -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -eq 200) { $ok = $true; break } } catch { }
}
if (-not $ok) { Fail "Server belum merespons. Lihat log: $logDir\server.log" }
Write-Host 'Server berjalan.' -ForegroundColor Green

# Password awal hanya dipakai saat pembuatan akun superadmin; setelah itu hapus dari start-server.cmd
Write-StartCmd $false

# ---- 7. Caddy (HTTPS + domain), opsional ----
if ($Domain) {
    Step "Memasang Caddy untuk https://$Domain"
    New-Item -ItemType Directory -Force -Path $CaddyDir | Out-Null
    Stop-ScheduledTask -TaskName $CaddyTask -ErrorAction SilentlyContinue
    Get-Process caddy -ErrorAction SilentlyContinue | Stop-Process -Force
    $rel = Invoke-RestMethod 'https://api.github.com/repos/caddyserver/caddy/releases/latest' -Headers @{ 'User-Agent' = 'pricing-installer' }
    $asset = $rel.assets | Where-Object { $_.name -like '*windows_amd64.zip' } | Select-Object -First 1
    if (-not $asset) { Fail 'File Caddy untuk Windows tidak ditemukan di GitHub releases.' }
    $zip = Join-Path $env:TEMP $asset.name
    Invoke-WebRequest $asset.browser_download_url -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $CaddyDir -Force
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
    Set-Content -Path (Join-Path $CaddyDir 'Caddyfile') -Encoding ASCII -Value @("$Domain {", "    reverse_proxy localhost:$Port", "}")
    Register-AutoTask $CaddyTask (Join-Path $CaddyDir 'caddy.exe') 'run --config Caddyfile --adapter caddyfile' $CaddyDir
    Start-ScheduledTask -TaskName $CaddyTask
}

# ---- Ringkasan ----
$publicIp = $null
try { $publicIp = (Invoke-RestMethod 'https://api.ipify.org' -TimeoutSec 5).Trim() } catch { }

Write-Host ""
Write-Host "================ SELESAI ================" -ForegroundColor Green
if ($Domain) {
    Write-Host "Alamat   : https://$Domain"
    Write-Host "PASTIKAN DNS A record $Domain mengarah ke IP publik server ($publicIp)."
    Write-Host "Sertifikat HTTPS terbit otomatis beberapa saat setelah DNS benar (butuh port 80 dan 443 terbuka dari internet)."
} else {
    Write-Host "Lokal    : http://localhost:$Port"
    if ($publicIp) { Write-Host "Online   : http://${publicIp}:$Port   (tanpa HTTPS)" }
    Write-Host "Jika tidak bisa dibuka dari luar: buka juga port $Port di firewall/security group penyedia hosting (Azure, AWS, dsb)."
}
if (-not $dbExists) {
    Write-Host ""
    Write-Host "Login awal : username 'superadmin'"
    if ($passwordGenerated) { Write-Host "Password   : $AdminPassword    <-- CATAT SEKARANG, tidak ditampilkan lagi" } else { Write-Host 'Password   : sesuai -AdminPassword' }
} else {
    Write-Host ""
    Write-Host 'Database lama dipakai, akun yang ada tidak diubah.'
}
Write-Host ""
Write-Host "Log      : $logDir\server.log"
Write-Host "Restart  : Stop-ScheduledTask $AppTask; Start-ScheduledTask $AppTask"
Write-Host "Hapus    : .\deploy\install-windows.ps1 -Uninstall"
