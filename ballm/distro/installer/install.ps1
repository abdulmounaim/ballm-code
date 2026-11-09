# Ballm Code installer (Windows placeholder)
# Replace the download and signature check with the internal artifact store before distribution.

param(
  [string]$Version = "latest",
  [string]$Base = "https://artifacts.ballm.internal/ballm-code"
)

$ErrorActionPreference = "Stop"
Write-Host "Installing Ballm Code $Version from $Base"
Write-Host "TODO: download, verify signature, and install."

$managed = Join-Path $env:ProgramData "opencode"
New-Item -ItemType Directory -Force -Path $managed | Out-Null
Copy-Item (Join-Path $PSScriptRoot "..\..\managed\windows\opencode.jsonc") (Join-Path $managed "opencode.jsonc") -Force
Write-Host "Installed managed policy to $managed\opencode.jsonc"

Write-Host "Run ballm and connect the Ballm integration."
