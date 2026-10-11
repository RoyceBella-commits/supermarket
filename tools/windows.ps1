param(
    [ValidateSet('dev', 'setup', 'build', 'typecheck', 'preview')]
    [string]$Action = 'dev'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

# A project-local runtime also works when Node/npm are absent from Windows PATH.
$nodeVersion = '24.21.0'
$archiveName = "node-v$nodeVersion-win-x64.zip"
$archiveHash = '158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541'
$runtimeRoot = Join-Path $projectRoot '.runtime'
$nodeRoot = Join-Path $runtimeRoot "node-v$nodeVersion-win-x64"
$nodeExe = Join-Path $nodeRoot 'node.exe'
$npmCli = Join-Path $nodeRoot 'node_modules\npm\bin\npm-cli.js'

if (-not (Test-Path -LiteralPath $npmCli)) {
    New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
    $archivePath = Join-Path $runtimeRoot $archiveName
    Write-Host "Downloading Node.js $nodeVersion from nodejs.org..."
    Invoke-WebRequest -Uri "https://nodejs.org/dist/v$nodeVersion/$archiveName" -OutFile $archivePath
    if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash -ne $archiveHash) {
        throw 'Node.js archive checksum mismatch. Setup stopped.'
    }
    Expand-Archive -LiteralPath $archivePath -DestinationPath $runtimeRoot -Force
    Remove-Item -LiteralPath $archivePath
}

$env:PATH = "$nodeRoot;$env:PATH"
$env:npm_config_cache = Join-Path $runtimeRoot 'npm-cache'
$lockHash = (Get-FileHash -LiteralPath 'package-lock.json' -Algorithm SHA256).Hash
$stampPath = Join-Path $runtimeRoot 'windows-dependencies.txt'
$stamp = "$nodeVersion win32-x64 $lockHash"
$installed = (Test-Path -LiteralPath $stampPath) -and
    ((Get-Content -LiteralPath $stampPath -Raw).Trim() -eq $stamp) -and
    (Test-Path -LiteralPath 'node_modules\vite\bin\vite.js') -and
    (Test-Path -LiteralPath 'node_modules\@rolldown\binding-win32-x64-msvc')

if ($Action -eq 'setup' -or -not $installed) {
    Write-Host 'Installing Windows dependencies from package-lock.json...'
    & $nodeExe $npmCli ci --include=optional --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed (exit $LASTEXITCODE)." }
    Set-Content -LiteralPath $stampPath -Value $stamp -Encoding ASCII
}

if ($Action -eq 'setup') {
    & $nodeExe --version
    & $nodeExe $npmCli --version
    Write-Host 'Setup complete. Double-click start.cmd to run the game.'
    exit 0
}

if ($Action -eq 'dev') {
    & $nodeExe $npmCli run dev -- --open
} else {
    & $nodeExe $npmCli run $Action
}
exit $LASTEXITCODE
