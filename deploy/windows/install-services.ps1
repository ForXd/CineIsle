$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = 'D:\CineIsle'
$bun = "$root\runtime\bun\bin\bun.exe"
if (!(Test-Path $bun)) { throw 'Bun runtime is missing' }
$nginx = "$root\runtime\nginx-1.31.8"
if (!(Test-Path "$root\app\.next\BUILD_ID")) { throw 'Production build is missing' }
New-Item -ItemType Directory -Force -Path "$root\logs","$root\app\.next\cache","$root\runtime\tmp" | Out-Null
@'
worker_processes 1;
pid D:/CineIsle/logs/nginx.pid;
error_log D:/CineIsle/logs/nginx-error.log warn;
events { worker_connections 1024; }
http {
    include mime.types;
    default_type application/octet-stream;
    access_log D:/CineIsle/logs/nginx-access.log;
    sendfile on;
    keepalive_timeout 65;
    server_tokens off;
    server {
        listen 0.0.0.0:8080;
        server_name _;
        client_max_body_size 10m;
        location / {
            proxy_pass http://127.0.0.1:8081;
            proxy_http_version 1.1;
            proxy_set_header Host $http_host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $remote_addr;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Connection "";
            proxy_buffering off;
            proxy_read_timeout 300s;
            proxy_send_timeout 300s;
        }
    }
}
'@ | Set-Content "$nginx\conf\nginx.conf" -Encoding ascii
@'
@echo off
cd /d D:\CineIsle\app
set NODE_ENV=production
set NEXT_TELEMETRY_DISABLED=1
set TEMP=D:\CineIsle\runtime\tmp
set TMP=D:\CineIsle\runtime\tmp
D:\CineIsle\runtime\bun\bin\bun.exe node_modules\next\dist\bin\next start -p 8081 --hostname 127.0.0.1 >> D:\CineIsle\logs\app.log 2>&1
exit /b %errorlevel%
'@ | Set-Content "$root\start-app.cmd" -Encoding ascii
@'
@echo off
cd /d D:\CineIsle\runtime\nginx-1.31.8
nginx.exe -p D:/CineIsle/runtime/nginx-1.31.8/ -g "daemon off;" >> D:\CineIsle\logs\nginx-console.log 2>&1
exit /b %errorlevel%
'@ | Set-Content "$root\start-nginx.cmd" -Encoding ascii
# Restrict the new deployment tree; services run as Local Service, not administrator.
& icacls.exe $root /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' '*S-1-5-19:(OI)(CI)RX' | Out-Null
if($LASTEXITCODE -ne 0) { throw 'Root ACL failed' }
foreach($folder in @("$root\logs","$root\runtime\tmp","$root\app\.next\cache","$nginx\temp","$nginx\logs")) {
    New-Item -ItemType Directory -Force -Path $folder | Out-Null
    & icacls.exe $folder /grant:r '*S-1-5-19:(OI)(CI)M' | Out-Null
    if($LASTEXITCODE -ne 0) { throw "ACL failed: $folder" }
}
# nginx sends config-test output to stderr even on success; cmd preserves its exit code.
& cmd.exe /d /c "`"$nginx\nginx.exe`" -p D:/CineIsle/runtime/nginx-1.31.8/ -t 2>&1"
if($LASTEXITCODE -ne 0) { throw 'Nginx config invalid' }
$principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
foreach($entry in @(@{Name='CineIsle-App';File='start-app.cmd'},@{Name='CineIsle-Nginx';File='start-nginx.cmd'})) {
    if(Get-ScheduledTask -TaskName $entry.Name -ErrorAction SilentlyContinue) { throw "Task already exists: $($entry.Name)" }
    $action=New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\cmd.exe" -Argument "/d /c D:\CineIsle\$($entry.File)" -WorkingDirectory $root
    Register-ScheduledTask -TaskName $entry.Name -Action $action -Principal $principal -Trigger $trigger -Settings $settings -Description 'CineIsle LAN production service' | Out-Null
}
if(!(Get-NetFirewallRule -Name CineIsle-HTTP -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -Name CineIsle-HTTP -DisplayName 'CineIsle LAN HTTP' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080 -RemoteAddress LocalSubnet -Profile Any -Program "$nginx\nginx.exe" | Out-Null
}
Start-ScheduledTask -TaskName CineIsle-App
Start-ScheduledTask -TaskName CineIsle-Nginx
Get-ScheduledTask -TaskName CineIsle-App,CineIsle-Nginx | Select-Object TaskName,State
