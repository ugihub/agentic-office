[CmdletBinding()]
param(
  [switch]$IncludeApi
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-Compose {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  & docker compose @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

function Invoke-Docker {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  $output = & docker @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "docker $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }

  return $output
}

function Get-ComposeContainerId {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Service
  )

  $containerIds = & docker compose ps -q $Service
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose ps -q $Service failed with exit code $LASTEXITCODE"
  }

  $containerId = ($containerIds | Select-Object -First 1)
  if ([string]::IsNullOrWhiteSpace($containerId)) {
    throw "No container found for compose service '$Service'."
  }

  return $containerId.Trim()
}

function Get-ContainerHealthStatus {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ContainerId
  )

  $status = Invoke-Docker -Arguments @(
    "inspect",
    "--format",
    "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}",
    $ContainerId
  )

  return ($status | Select-Object -First 1).Trim()
}

function Get-ContainerHealthLog {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ContainerId
  )

  $log = Invoke-Docker -Arguments @(
    "inspect",
    "--format",
    "{{range .State.Health.Log}}{{println .End .ExitCode .Output}}{{end}}",
    $ContainerId
  )

  return ($log -join "`n").Trim()
}

function Wait-ComposeServicesHealthy {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Services,

    [int]$TimeoutSeconds = 300
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastStatuses = @{}

  do {
    $allHealthy = $true

    foreach ($service in $Services) {
      $containerId = Get-ComposeContainerId -Service $service
      $status = Get-ContainerHealthStatus -ContainerId $containerId
      $lastStatuses[$service] = $status

      if ($status -ne "healthy") {
        $allHealthy = $false
      }
    }

    if ($allHealthy) {
      Write-Host "Healthy services: $($Services -join ', ')"
      return
    }

    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)

  foreach ($service in $Services) {
    $containerId = Get-ComposeContainerId -Service $service
    $status = Get-ContainerHealthStatus -ContainerId $containerId

    if ($status -ne "healthy") {
      $log = Get-ContainerHealthLog -ContainerId $containerId
      throw "Service '$service' did not become healthy. Last status: $status. Health log: $log"
    }
  }

  throw "Services did not become healthy in time. Last statuses: $($lastStatuses.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" } -join ', ')"
}

function Invoke-HttpProbe {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Uri,

    [int]$Attempts = 30,
    [int]$DelaySeconds = 2
  )

  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
        Write-Host "$Uri returned $($response.StatusCode)"
        return
      }
    }
    catch {
      if ($attempt -eq $Attempts) {
        throw
      }
    }

    Start-Sleep -Seconds $DelaySeconds
  }

  throw "$Uri did not return a successful response after $Attempts attempts."
}

function Get-DotEnvValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  $envPath = Join-Path $PSScriptRoot "..\.env"
  if (-not (Test-Path -LiteralPath $envPath)) {
    return $null
  }

  $line = Get-Content -LiteralPath $envPath |
    Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } |
    Select-Object -First 1

  if (-not $line) {
    return $null
  }

  return ($line -replace "^\s*$([regex]::Escape($Name))\s*=\s*", "").Trim().Trim('"').Trim("'")
}

function Test-ComposeSecretPresent {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  $processValue = [Environment]::GetEnvironmentVariable($Name)
  if (-not [string]::IsNullOrWhiteSpace($processValue)) {
    return $true
  }

  $dotEnvValue = Get-DotEnvValue -Name $Name
  return -not [string]::IsNullOrWhiteSpace($dotEnvValue)
}

Write-Host "Validating docker compose config..."
Invoke-Compose -Arguments @("config", "--quiet")

Write-Host "Starting mongo and redis and waiting for health..."
Invoke-Compose -Arguments @("up", "-d", "--wait", "--wait-timeout", "300", "mongo", "redis")
Wait-ComposeServicesHealthy -Services @("mongo", "redis")

Write-Host "Current mongo/redis status:"
Invoke-Compose -Arguments @("ps", "mongo", "redis")

$hasApiSecrets =
  (Test-ComposeSecretPresent -Name "JWT_PRIVATE_KEY_PEM") -and
  (Test-ComposeSecretPresent -Name "JWT_PUBLIC_KEY_PEM")

if ($IncludeApi -or $hasApiSecrets) {
  if (-not $hasApiSecrets) {
    throw "JWT_PRIVATE_KEY_PEM and JWT_PUBLIC_KEY_PEM are required to smoke test api-server."
  }

  Write-Host "Starting api-server..."
  Invoke-Compose -Arguments @("up", "-d", "--wait", "--wait-timeout", "300", "api-server")
  Wait-ComposeServicesHealthy -Services @("api-server")

  Write-Host "Checking API liveness and readiness..."
  Invoke-HttpProbe -Uri "http://localhost:3001/health/live"
  Invoke-HttpProbe -Uri "http://localhost:3001/health/ready"
}
else {
  Write-Host "Skipping api-server; JWT_PRIVATE_KEY_PEM and JWT_PUBLIC_KEY_PEM are not populated."
}
