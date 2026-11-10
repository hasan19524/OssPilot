#Requires -Version 5.1
<#
.SYNOPSIS
  OSSPilot installer for Windows 11.
.DESCRIPTION
  Downloads the standalone OSSPilot executable from the latest GitHub release,
  verifies its SHA-256 checksum, installs it under %LOCALAPPDATA%\OSSPilot and
  adds that directory to your user PATH.

  You can also run the whole thing in one line:

  irm https://raw.githubusercontent.com/hasan19524/OssPilot/main/scripts/install.ps1 | iex
.PARAMETER Version
  Release tag to install, e.g. v0.1.0. Defaults to the latest stable release.
.PARAMETER SkipPath
  Do not modify the user PATH.
.EXAMPLE
  .\install.ps1
.EXAMPLE
  .\install.ps1 -Version v0.1.0
#>
param(
    [string]$Version,
    [switch]$SkipPath
)

$ErrorActionPreference = "Stop"

$repo = "hasan19524/OssPilot"
$installDir = Join-Path $env:LOCALAPPDATA "OSSPilot"
$exeName = "osspilot.exe"
$tmp = Join-Path $env:TEMP "osspilot-install"

New-Item -ItemType Directory -Path $installDir -Force | Out-Null
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

function Get-LatestRelease {
    if ($Version) { return $Version }
    try {
        $latest = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers @{ "User-Agent" = "OSSPilot-Installer" }
        return $latest.tag_name
    } catch {
        throw "Could not determine the latest release. Specify a version with -Version."
    }
}

$tag = Get-LatestRelease
Write-Host "==> Installing OSSPilot $tag from $repo"

$assetName = "osspilot-windows-x64.exe"
$base = "https://github.com/$repo/releases/download/$tag"
$downloaded = Join-Path $tmp $assetName

Invoke-WebRequest -Uri "$base/$assetName" -OutFile $downloaded -Headers @{ "User-Agent" = "OSSPilot-Installer" }

# Verify the checksum when the release publishes one.
try {
    $sums = (Invoke-WebRequest -Uri "$base/SHA256SUMS.txt" -Headers @{ "User-Agent" = "OSSPilot-Installer" }).Content
    $expected = ($sums -split "`n" | Where-Object { $_ -match $assetName } | Select-Object -First 1) -split '\s+' | Select-Object -First 1
    if ($expected) {
        $actual = (Get-FileHash -Path $downloaded -Algorithm SHA256).Hash.ToLower()
        if ($expected.ToLower() -ne $actual) {
            throw "Checksum mismatch. Expected $expected, got $actual."
        }
        Write-Host "==> Checksum verified"
    }
} catch {
    if ($_.Exception.Message -match "Checksum mismatch") { throw }
    Write-Host "==> No SHA256SUMS.txt in this release - skipping checksum verification"
}

Copy-Item -Path $downloaded -Destination (Join-Path $installDir $exeName) -Force

if (-not $SkipPath) {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($userPath -notlike "*$installDir*") {
        [Environment]::SetEnvironmentVariable("Path", "$userPath;$installDir", "User")
        Write-Host "==> Added $installDir to your user PATH"
        Write-Host "    Restart your terminal for PATH changes to take effect."
    }
}

Remove-Item -Path $tmp -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Installed to: $(Join-Path $installDir $exeName)"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  osspilot setup      # first-run setup"
Write-Host "  osspilot doctor     # verify the environment"
Write-Host "  osspilot            # launch the TUI"
Write-Host ""
Write-Host "Requirements: git (https://git-scm.com), OpenCode (https://opencode.ai)"
