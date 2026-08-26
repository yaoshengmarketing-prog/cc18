param(
  [string]$TaskName = 'CC18-Production-Cycle',
  [int]$IntervalMinutes = 60,
  [int]$MaximumJobs = 3,
  [switch]$WithEditorial
)

$ErrorActionPreference = 'Stop'
if ($IntervalMinutes -lt 15) { throw 'IntervalMinutes must be at least 15.' }
if ($MaximumJobs -lt 1 -or $MaximumJobs -gt 20) { throw 'MaximumJobs must be between 1 and 20.' }

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$nodePath = (Get-Command node -ErrorAction Stop).Source
$cycleScript = Join-Path $projectRoot 'scripts\worker\run-cycle.mjs'
$arguments = '"{0}" --max={1}' -f $cycleScript, $MaximumJobs

if ($WithEditorial) {
  if ($env:CC18_ALLOW_EDITORIAL_TRANSMISSION -ne 'YES') {
    throw 'WithEditorial requires CC18_ALLOW_EDITORIAL_TRANSMISSION=YES in the scheduled-task environment.'
  }
  $arguments += ' --with-editorial'
}

$action = New-ScheduledTaskAction `
  -Execute $nodePath `
  -Argument $arguments `
  -WorkingDirectory $projectRoot

$trigger = New-ScheduledTaskTrigger `
  -Once `
  -At (Get-Date).AddMinutes(5) `
  -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)

$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit (New-TimeSpan -Hours 4) `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description 'Processes a bounded CC18 D1 batch. Draft-only; publishing remains separately gated.' `
  -Force | Out-Null

Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName, State
