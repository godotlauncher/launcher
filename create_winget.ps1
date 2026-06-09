$packageId = "GodotLauncher.Launcher"

#array of asset names to look for in the release assets
$assetNames = @("Godot_Launcher.*?exe$")

# Fetching latest release from GitHub
$github = Invoke-RestMethod -uri "https://api.github.com/repos/godotlauncher/launcher/releases"
$targetRelease = $github | Where-Object -Property name -match 'v1.9.0' | Select-Object -First 1
$installerUrl = $targetRelease | Select-Object -ExpandProperty assets -First 1 | Where-Object -Property name -match 'Godot_Launcher.*?exe$' | Select-Object -ExpandProperty browser_download_url
$packageVersion = $targetRelease.tag_name.Trim("v")

# printing the values for debugging
Write-Host "Package ID: $packageId"
Write-Host "Package Version: $packageVersion"
Write-Host "Installer URL: $installerUrl"

# Update package using wingetcreate
Invoke-WebRequest https://aka.ms/wingetcreate/latest -OutFile wingetcreate.exe
.\wingetcreate.exe update $packageId --version $packageVersion --urls "$installerUrl" #--submit --token $gitToken
