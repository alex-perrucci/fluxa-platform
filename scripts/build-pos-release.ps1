[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ApiBaseUrl,

    [Parameter(Mandatory = $false)]
    [ValidateSet('test', 'production')]
    [string]$Environment = 'production',

    [Parameter(Mandatory = $false)]
    [switch]$BuildApk,

    [Parameter(Mandatory = $false)]
    [switch]$Clean,

    [Parameter(Mandatory = $false)]
    [switch]$ValidateOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed with exit code $LASTEXITCODE."
    }
}

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$posRoot = Join-Path $root 'apps/pos'
$keyPropertiesPath = Join-Path $posRoot 'android/key.properties'
$uri = $null
if (-not [Uri]::TryCreate($ApiBaseUrl, [UriKind]::Absolute, [ref]$uri)) {
    throw 'ApiBaseUrl must be an absolute URL.'
}
if ($Environment -eq 'production') {
    if ($uri.Scheme -ne 'https') { throw 'Production ApiBaseUrl must use HTTPS.' }
    if ($uri.Host -in @('localhost', '127.0.0.1', '::1')) {
        throw 'Production ApiBaseUrl must not use a local host.'
    }
}

Assert-Command 'git'
Assert-Command 'flutter'
Assert-Command 'dart'
$commit = (& git -C $root rev-parse --short=12 HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Unable to resolve the Git commit.' }

if ($ValidateOnly) {
    if (Test-Path -LiteralPath $keyPropertiesPath) {
        Write-Host 'Release signing file is present.' -ForegroundColor Green
    } else {
        Write-Warning 'Release signing is not configured yet; an actual release build will be blocked.'
    }
    Write-Host "Release configuration is valid for $Environment at $ApiBaseUrl." -ForegroundColor Green
    return
}

if (-not (Test-Path -LiteralPath $keyPropertiesPath)) {
    throw 'Missing apps/pos/android/key.properties. Copy key.properties.example and configure the upload keystore.'
}
$properties = @{}
foreach ($line in Get-Content -LiteralPath $keyPropertiesPath) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    $separator = $trimmed.IndexOf('=')
    if ($separator -le 0) { continue }
    $properties[$trimmed.Substring(0, $separator).Trim()] = $trimmed.Substring($separator + 1).Trim()
}
foreach ($name in @('storePassword', 'keyPassword', 'keyAlias', 'storeFile')) {
    if (-not $properties.ContainsKey($name) -or [string]::IsNullOrWhiteSpace($properties[$name]) -or $properties[$name] -match '[<>]') {
        throw "Invalid or missing signing property: $name"
    }
}
$storeFile = Join-Path (Join-Path $posRoot 'android/app') $properties['storeFile']
if (-not (Test-Path -LiteralPath $storeFile)) {
    throw "Keystore not found: $storeFile"
}

$symbolsRoot = Join-Path $root "release-symbols/$commit"
New-Item -ItemType Directory -Force -Path $symbolsRoot | Out-Null
$defines = @(
    "--dart-define=FLUXA_ENV=$Environment",
    "--dart-define=API_BASE_URL=$($ApiBaseUrl.TrimEnd('/'))",
    "--dart-define=BUILD_COMMIT=$commit",
    "--dart-define=RELEASE_CHANNEL=$Environment"
)

Push-Location $posRoot
try {
    if ($Clean) { Invoke-Checked 'flutter' @('clean') }
    Invoke-Checked 'flutter' @('pub', 'get')
    Invoke-Checked 'dart' @('format', '--output=none', '--set-exit-if-changed', 'lib', 'test')
    Invoke-Checked 'flutter' @('analyze')
    Invoke-Checked 'flutter' @('test')
    Invoke-Checked 'flutter' (@('build', 'appbundle', '--release', '--obfuscate', "--split-debug-info=$symbolsRoot") + $defines)
    if ($BuildApk) {
        Invoke-Checked 'flutter' (@('build', 'apk', '--release', '--split-per-abi', '--obfuscate', "--split-debug-info=$symbolsRoot") + $defines)
    }
} finally {
    Pop-Location
}

Write-Host 'Fluxa Android release completed.' -ForegroundColor Green
Write-Host "AAB: $posRoot/build/app/outputs/bundle/release/app-release.aab"
if ($BuildApk) { Write-Host "APKs: $posRoot/build/app/outputs/flutter-apk" }
Write-Host "Symbols: $symbolsRoot"
