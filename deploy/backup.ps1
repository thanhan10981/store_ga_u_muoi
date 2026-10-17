param([string]$EnvFile = '.env.deploy')
$ErrorActionPreference = 'Stop'
$composeArgs = @('compose', '--env-file', $EnvFile)
New-Item -ItemType Directory -Force -Path './backups' | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$destination = Join-Path (Resolve-Path './backups').Path "store-$stamp.dump"
& docker @composeArgs exec -T db pg_dump -U postgres -d store -Fc -f /tmp/store-backup.dump
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed' }
# docker cp preserves binary data; PowerShell redirection can corrupt a custom dump.
& docker @composeArgs cp 'db:/tmp/store-backup.dump' $destination
if ($LASTEXITCODE -ne 0) { throw 'Copy failed' }
Get-FileHash -Algorithm SHA256 -LiteralPath $destination
Write-Output "Backup saved: $destination"
