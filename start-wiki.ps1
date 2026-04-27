# start-wiki.ps1
# Starts the Obsidian Watch pipeline and Wiki Preview server on login.
# Registered as a Windows Task Scheduler task — edit the .env file in this
# directory to update your API key without touching this script.

$projectRoot = "C:\DDrive\Programming\Project\ai-ml\llm-wiki"
$obsidianClippings = "C:\Users\Hercules\OneDrive\Documents\Obsidian Vault\Clippings"
$cliPath = Join-Path $projectRoot "llm-wiki-compiler\dist\cli.js"

# Load .env into current process so child processes inherit the vars
$envFile = Join-Path $projectRoot ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match "^\s*([^#][^=]+)=(.*)$") {
            $key = $matches[1].Trim(); $val = $matches[2].Trim()
            [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
            # Also set at machine-process level so Start-Process children inherit them
            [System.Environment]::SetEnvironmentVariable($key, $val, "User")
        }
    }
}

# Kill any stale instances before starting fresh
Get-Process node -ErrorAction SilentlyContinue | ForEach-Object {
    try {
        $cmd = (Get-WmiObject Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine
        if ($cmd -match 'cli\.js.*watch|serve.*wiki') { $_.Kill() }
    } catch {}
}

# Start Obsidian Watch (ingest + compile + build on every new clip)
$watchArgs = @(
    $cliPath,
    "watch",
    "--root", (Join-Path $projectRoot "obsidian-wiki"),
    "--ingest-dir", $obsidianClippings
)
$watchProc = Start-Process -FilePath "node" `
    -ArgumentList $watchArgs `
    -WorkingDirectory $projectRoot `
    -PassThru -WindowStyle Hidden
Write-Host "llmwiki watch started (PID $($watchProc.Id))"

# Start Wiki Preview static server on port 3000
$serveArgs = @("serve", (Join-Path $projectRoot "obsidian-wiki\wiki\web"), "--listen", "3000")
$serveProc = Start-Process -FilePath "npx" `
    -ArgumentList $serveArgs `
    -WorkingDirectory $projectRoot `
    -PassThru -WindowStyle Hidden
Write-Host "llmwiki serve started (PID $($serveProc.Id))"

Write-Host "llmwiki: ready at http://localhost:3000"
