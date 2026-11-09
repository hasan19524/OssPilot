#Requires -Version 5.1
<#
.SYNOPSIS
  OSSPilot installer for Windows 11.
.DESCRIPTION
  Downloads the standalone OSSPilot executable for your architecture, verifies
  its SHA-256 checksum against SHA256SUMS.txt, installs it under
  %LOCALAPPDATA%\OSSPilot and adds it to your user PATH.

  Nothing is downloaded without an explicit -Url from you.
.PARAMETER Url
  Direct download URL for the Windows executable (GitHub Release asset).
.PARAMETER ChecksumUrl
  Optional URL for SHA256SUMS.txt.
.EXAMPLE
  .\install.ps1 -Url https://github.com/OWNER/REPO/releases/download/v0.1.0/osspilot-windows-x64.exe
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Url,
    [string]$ChecksumUrl
)

$ErrorActionPreference = "Stop"

$installDir = Join-Path $env:LOCALAPPDATA "OSSPilot"
$exeName = "osspilot.exe"
$exePath = Join-Path $installDir $exeName
$tmp = Join-Path $env:TEMP "osspilot-install"

New-Item -ItemType Directory -Path $installDir -Force | Out-Null
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

Write-Host "==> Downloading OSSPilot"
$downloaded = Join-Path $tmp $exeName
Invoke-WebRequest -Uri $Url -OutFile $downloaded

if ($ChecksumUrl) {
    Write-Host "==> Verifying checksum"
    $sums = (Invoke-WebRequest -Uri $ChecksumUrl).Content
    $expected = ($sums -split "`n" | Where-Object { $_ -match $exeName } | Select-Object -First 1) -split '\s+' | Select-Object -First 1
    $actual = (Get-FileHash -Path $downloaded -Algorithm SHA256).Hash.ToLower()
    if ($expected -and $expected.ToLower() -ne $actual) {
        throw "Checksum mismatch. Expected $expected, got $actual."
    }
    Write-Host "    checksum OK"
}

Copy-Item -Path $downloaded -Destination $exePath -Force

# Add to user PATH
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$installDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$installDir", "User")
    Write-Host "==> Added $installDir to your user PATH"
    Write-Host "    Restart your terminal for PATH changes to take effect."
}

Write-Host ""
Write-Host "Installed: $exePath"
Write-Host "Run 'osspilot setup' to configure, then 'osspilot discover'."
Write-Host ""
Write-Host "Requirements:"
Write-Host "  git       https://git-scm.com"
Write-Host "  OpenCode  https://opencode.ai   (required for code implementation)"
