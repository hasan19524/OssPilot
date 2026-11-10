# Acceptance suite: drives the REAL compiled OSSPilot TUI through the
# manual acceptance scenarios. Each scenario runs in a fresh process with a
# fresh console; screens are saved under the temp tui folder.
param(
  [string]$Group = "A"
)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$dir = Join-Path $env:LOCALAPPDATA "Temp\opencode\tui"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$groups = @{
  "A" = @(
    @{ Name = "s1_help";       Steps = "4000,/help{ENTER}";                                Seconds = 6 },
    @{ Name = "s3_discover";   Steps = "4000,/discover typescript{ENTER}";                 Seconds = 25 },
    @{ Name = "s4_placeholder";Steps = "4000,/research owner/repository#123{ENTER}";        Seconds = 6 },
    @{ Name = "s5_research";   Steps = "4000,/research octocat/Hello-World#1{ENTER}";       Seconds = 30 },
    @{ Name = "s6_explain";    Steps = "4000,explain this repository{ENTER}";               Seconds = 20 }
  )
  "B" = @(
    @{ Name = "s7_plan_nl";    Steps = "4000,help me plan a contribution{ENTER}";           Seconds = 8 },
    @{ Name = "s7b_plan_block";Steps = "4000,/plan octocat/Hello-World#1{ENTER}";           Seconds = 25 },
    @{ Name = "s8_invalid";    Steps = "4000,/nonsense{ENTER}";                            Seconds = 6 },
    @{ Name = "s9_status";     Steps = "4000,what is the status of my contributions?{ENTER}"; Seconds = 8 },
    @{ Name = "s10_agents";    Steps = "4000,/agents{ENTER}";                              Seconds = 12 },
    @{ Name = "s12_issues";    Steps = "4000,find beginner-friendly issues in this repository{ENTER}"; Seconds = 20 }
  )
  "C" = @(
    @{ Name = "s11_greet2";    Steps = "4000,thanks{ENTER}";                               Seconds = 6 },
    @{ Name = "s13_cancel";    Steps = "4000,/discover typescript{ENTER};7000,{CTRLC}";     Seconds = 10 },
    @{ Name = "s14_escquit";   Steps = "6000,{ESC}";                                       Seconds = 5 }
  )
}

foreach ($s in $groups[$Group]) {
  $log = Join-Path $dir "$($s.Name).result.txt"
  if (Test-Path $log) { Remove-Item $log -Force }
  & (Join-Path $here "_tui_console.ps1") -Name $s.Name -Steps $s.Steps -Seconds $s.Seconds |
    Out-File -FilePath $log -Encoding utf8
  Write-Output "######## $($s.Name) -> $log"
}
Write-Output "GROUP $Group complete"
