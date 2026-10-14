# Deploy di Windows Server

1. Salin folder aplikasi ke server (clone, atau unduh ZIP lalu ekstrak), mis. `C:\pricing`.
2. Buka PowerShell **as Administrator**, lalu:

```powershell
cd C:\pricing

# Akses lewat IP publik:  http://IP-SERVER:3000
powershell -ExecutionPolicy Bypass -File .\deploy\install-windows.ps1

# ATAU akses lewat domain + HTTPS (DNS A record harus sudah mengarah ke IP server)
powershell -ExecutionPolicy Bypass -File .\deploy\install-windows.ps1 -Domain pricing.perusahaan.com
```

Opsi: `-Port 8080`, `-AdminPassword "..."` (default: dibuat acak dan ditampilkan sekali), `-Uninstall`.

Script memasang Node.js LTS bila belum ada, `npm install`, membuat `SESSION_SECRET` acak, mendaftarkan
Scheduled Task `PricingApp` (otomatis jalan saat boot dan restart bila crash), membuka firewall, dan
(bila `-Domain`) memasang Caddy untuk HTTPS.

Jika server ada di cloud (Azure/AWS/dll), buka juga port 80/443 (atau port aplikasi) di Network Security Group.

Update aplikasi: ganti file kode (jangan timpa `database\pricing.db`), lalu jalankan ulang script di atas.
Backup: salin `database\pricing.db`.
