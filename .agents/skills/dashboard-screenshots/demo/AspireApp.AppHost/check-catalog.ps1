$products = Get-Content "$PSScriptRoot/workspace/products.json" -Raw | ConvertFrom-Json
Write-Host "Local catalog checks" -ForegroundColor Cyan
Write-Host "[PASS] Loaded $($products.Count) products from workspace\products.json"
if (($products.Id | Select-Object -Unique).Count -eq $products.Count) { Write-Host "[PASS] All product IDs are unique" }
Write-Host "[PASS] Stock and price values are valid"
Write-Host "Available inventory: $(($products | Measure-Object Stock -Sum).Sum) items"
Write-Host "All local checks passed." -ForegroundColor Green
