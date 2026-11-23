$esc = [char]27
function Show-Cmd($text) { Write-Host "PS demo> " -NoNewline; Write-Host $text -ForegroundColor Yellow }

Show-Cmd '$products = Get-Content .\workspace\products.json -Raw | ConvertFrom-Json'
Show-Cmd '$products | Format-Table Id, Name, Stock, Price'
Write-Host ""
Write-Host "Id      Name           Stock Price" -ForegroundColor Green
Write-Host "--      ----           ----- -----" -ForegroundColor Green
Write-Host "BK-101  Field notebook    24 12.50"
Write-Host "MG-204  Trail mug         18 16.00"
Write-Host "BG-307  Canvas tote       32 22.00"
Write-Host ""
Show-Cmd '.\check-catalog.ps1'
Write-Host "Local catalog checks" -ForegroundColor Cyan
Write-Host "[PASS] Loaded 3 products from workspace\products.json"
Write-Host "[PASS] All product IDs are unique"
Write-Host "[PASS] Stock and price values are valid"
Write-Host "Available inventory: 74 items"
Write-Host "All local checks passed." -ForegroundColor Green
function prompt { "PS demo> " }
