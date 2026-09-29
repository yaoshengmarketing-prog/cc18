param(
  [string]$TaskName = 'CC18-Production-Drain',
  [Parameter(Mandatory = $true)]
  [string]$RuntimeRoot,
  [Parameter(Mandatory = $true)]
  [string[]]$EnvironmentFiles,
  [int]$IntervalMinutes = 15,
  [int]$TimeBudgetMinutes = 50,
  [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
if ($IntervalMinutes -lt 15) { throw 'IntervalMinutes must be at least 15.' }
if ($TimeBudgetMinutes -lt 5 -or $TimeBudgetMinutes -gt 240) { throw 'TimeBudgetMinutes must be between 5 and 240.' }

$runtime = (Resolve-Path -LiteralPath $RuntimeRoot).Path
$nodePath = (Get-Command node -ErrorAction Stop).Source
$workerScript = Join-Path $runtime 'scripts\worker\run-production-drain.mjs'
if (-not (Test-Path -LiteralPath $workerScript -PathType Leaf)) { throw "Production worker script is missing: $workerScript" }

$origin = (& git -C $runtime remote get-url origin).Trim()
if ($LASTEXITCODE -ne 0 -or $origin -notmatch 'github\.com[/:]yaoshengmarketing-prog/cc18(?:\.git)?$') {
  throw "Unexpected git origin: $origin"
}
$trackedStatus = (& git -C $runtime status --porcelain --untracked-files=no) -join "`n"
if ($LASTEXITCODE -ne 0 -or $trackedStatus.Trim()) { throw 'RuntimeRoot must have no tracked or staged changes.' }

$resolvedEnvironmentFiles = foreach ($file in $EnvironmentFiles) {
  $resolved = (Resolve-Path -LiteralPath $file).Path
  if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) { throw "Environment file is missing: $resolved" }
  $resolved
}
$requiredKeys = @('AITOKENKING_API_KEY', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_D1_DATABASE_ID', 'CLOUDFLARE_API_TOKEN')
$availableKeys = @{}
foreach ($file in $resolvedEnvironmentFiles) {
  foreach ($line in Get-Content -LiteralPath $file) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') { $availableKeys[$matches[1]] = $true }
  }
}
$missingKeys = @($requiredKeys | Where-Object { -not $availableKeys.ContainsKey($_) })
if ($missingKeys.Count) { throw "Environment files are missing required keys: $($missingKeys -join ', ')" }

function Quote-Argument([string]$Value) {
  '"{0}"' -f ($Value -replace '"', '\"')
}

$arguments = @(
  $resolvedEnvironmentFiles | ForEach-Object { Quote-Argument "--env-file=$_" }
  Quote-Argument $workerScript
  "--time-budget-minutes=$TimeBudgetMinutes"
  '--allow-transmission=YES'
) -join ' '

$action = New-ScheduledTaskAction -Execute $nodePath -Argument $arguments -WorkingDirectory $runtime
$now = Get-Date
$nextQuarter = $now.AddMinutes(15 - ($now.Minute % 15)).AddSeconds(-$now.Second).AddMilliseconds(-$now.Millisecond)
$trigger = New-ScheduledTaskTrigger -Once -At $nextQuarter -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)
$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit (New-TimeSpan -Hours 5) `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -RunOnlyIfNetworkAvailable

if ($ValidateOnly) {
  [pscustomobject]@{
    TaskName = $TaskName
    RuntimeRoot = $runtime
    IntervalMinutes = $IntervalMinutes
    TimeBudgetMinutes = $TimeBudgetMinutes
    EnvironmentFileCount = $resolvedEnvironmentFiles.Count
    Validation = 'PASS'
  }
  return
}

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description 'Drains the CC18 D1 queue locally in clean single-work isolation; GitHub performs hourly discovery.' `
  -Force | Out-Null

Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName, State
