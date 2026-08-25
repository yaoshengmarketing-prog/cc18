param(
  [string]$TaskName = 'CC18-MediaBridge-Cleanup'
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$nodePath = (Get-Command node -ErrorAction Stop).Source
$cleanupScript = Join-Path $projectRoot 'scripts\bridge\cleanup.mjs'

$action = New-ScheduledTaskAction `
  -Execute $nodePath `
  -Argument ('"{0}"' -f $cleanupScript) `
  -WorkingDirectory $projectRoot

$trigger = New-ScheduledTaskTrigger `
  -Once `
  -At (Get-Date).AddMinutes(5) `
  -RepetitionInterval (New-TimeSpan -Hours 1)

$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description 'Purges expired CC18 Media Bridge video, frame, and audio temporary files.' `
  -Force | Out-Null

Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName, State
