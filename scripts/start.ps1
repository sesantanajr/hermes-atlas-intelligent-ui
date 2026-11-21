$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Test-Path '.venv/Scripts/python.exe')) {
    throw 'Crie o ambiente primeiro: uv venv; uv pip install --python .venv/Scripts/python.exe -e .'
}
if (-not (Test-Path 'dist/index.html')) {
    throw 'Compile a interface primeiro: npm ci; npm run build'
}
& .venv/Scripts/python.exe -m atlas.server
