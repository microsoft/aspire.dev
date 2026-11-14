---
title: Install script
seoTitle: Aspire CLI install script for Windows, macOS, and Linux
description: Learn about the aspire-install scripts to install the Aspire CLI. Use the Aspire CLI to create, run, and manage Aspire solutions.
---

This article describes the syntax for the Aspire installation scripts, available in both Bash and PowerShell versions. To download and use these scripts, see [Install the Aspire CLI](/get-started/install-cli/).

## Name

`aspire-install.ps1` | `aspire-install.sh` - Scripts used to install the Aspire CLI.

## Synopsis

{% os_tabs sync: "terminal" %}
{% tab "Bash", icon: "seti:shell" %}
```bash title="Bash"
aspire-install.sh
  [--install-path <DIRECTORY>]
  [--version <VERSION>]
  [--quality <QUALITY>]
  [--os <OPERATING_SYSTEM>]
  [--arch <ARCHITECTURE>]
  [--skip-path]
  [--keep-archive]
  [--verbose]
  [--help]
```
{% endtab %}
{% tab "PowerShell", icon: "seti:powershell" %}
```powershell title="PowerShell"
aspire-install.ps1
  [-InstallPath <DIRECTORY>]
  [-Version <VERSION>]
  [-Quality <QUALITY>]
  [-OS <OPERATING_SYSTEM>]
  [-Architecture <ARCHITECTURE>]
  [-SkipPath]
  [-KeepArchive]
  [-Help]"
```
{% endtab %}
{% endos_tabs %}

## Description

The `aspire-install` scripts perform a nonadmin installation of the Aspire CLI.

### Script behavior

Both scripts behave the same way. They download the Aspire CLI for the target platform, install it to the specified location, and add it to your PATH environment variable.

By default, the installation scripts download and install the latest stable release of the Aspire CLI. Specify a different version with the `-Version|--version` argument or a different quality level with the `-Quality|--quality` argument.

Unless changed with the `-InstallPath|--install-path` argument, the script installs to a user-specific location: `%USERPROFILE%\.aspire\bin` on Windows or `$HOME/.aspire/bin` on Linux/macOS.

## Options

- **`-InstallPath|--install-path <DIRECTORY>`**

  Specifies the installation path. The directory is created if it doesn't exist. The default value is *%USERPROFILE%\.aspire\bin* on Windows and *$HOME/.aspire/bin* on Linux/macOS. The Aspire CLI executable is placed directly in this directory.

- **`-Version|--version <VERSION>`**

  Represents a specific version to install. For example: `%ASPIRE_VERSION_MAJOR_MINOR%`. If not specified, the latest stable version is installed.

- **`-Quality|--quality <QUALITY>`**

  Downloads the specified quality build. The possible values are:

  - `release`: The latest stable release (default).
  - `staging`: Builds from the current release branch (prerelease builds).
  - `dev`: Latest builds from the `main` branch (development builds).

  The different quality values signal different stages of the release process:

  - `release`: The final stable releases of the Aspire CLI. Intended for production use.
  - `staging`: Prerelease builds intended for testing upcoming releases. Not recommended for production use.
  - `dev`: The latest builds from the main development branch. They're built frequently and aren't fully tested. Not recommended for production use but can be used to test specific features or fixes immediately after they're merged.

- **`-OS|--os <OPERATING_SYSTEM>`**

  Specifies the operating system for which the CLI is being installed. Possible values are: `win`, `linux`, `linux-musl`, `osx`.

  The parameter is optional and should only be used when it's required to override the operating system that is detected by the script.

- **`-Architecture|--arch <ARCHITECTURE>`**

  Architecture of the Aspire CLI binaries to install. Possible values are `x64`, `x86`, `arm64`. The default behavior is to autodetect the current system architecture.

- **`-SkipPath|--skip-path`**

  If you set this option, the script installs the CLI without modifying your `PATH` environment variable. Use this when you want to manually manage your PATH or when installing in environments where automatic `PATH` modification isn't desired.

- **`-KeepArchive|--keep-archive`**

  If you set this option, the script keeps the downloaded archive files and temporary directory after installation. By default, the script deletes the archive after extraction and cleans up the temporary directory.

- **`--verbose`**

  Displays diagnostics information. (Linux/macOS only)

- **`-Help|--help`**

  Prints help information for the script.

## Examples

- Install the latest stable version to the default location:

  {% os_tabs sync: "terminal" %}
{% tab "Bash", icon: "seti:shell" %}
```bash
./aspire-install.sh
```
{% endtab %}
{% tab "PowerShell", icon: "seti:powershell" %}
```powershell
.\aspire-install.ps1
```
{% endtab %}
{% endos_tabs %}

- Install to a custom directory:

  {% os_tabs sync: "terminal" %}
{% tab "Bash", icon: "seti:shell" %}
```bash
./aspire-install.sh --install-path "/usr/local/bin"
```
{% endtab %}
{% tab "PowerShell", icon: "seti:powershell" %}
```powershell
.\aspire-install.ps1 -InstallPath 'C:\Tools\Aspire'
```
{% endtab %}
{% endos_tabs %}

- Install a specific version:

  {% os_tabs sync: "terminal" %}
{% tab "Bash", icon: "seti:shell" %}
```bash
./aspire-install.sh --version "%ASPIRE_VERSION_MAJOR_MINOR%"
```
{% endtab %}
{% tab "PowerShell", icon: "seti:powershell" %}
```powershell
.\aspire-install.ps1 -Version '%ASPIRE_VERSION_MAJOR_MINOR%'
```
{% endtab %}
{% endos_tabs %}

- Install development builds:

  {% os_tabs sync: "terminal" %}
{% tab "Bash", icon: "seti:shell" %}
```bash
./aspire-install.sh --quality "dev"
```
{% endtab %}
{% tab "PowerShell", icon: "seti:powershell" %}
```powershell
.\aspire-install.ps1 -Quality 'dev'
```
{% endtab %}
{% endos_tabs %}

- Download and install development builds in one command:

  {% os_tabs sync: "terminal" %}
{% tab "Bash", icon: "seti:shell" %}
```bash
curl -sSL https://aspire.dev/install.sh | bash -s -- --quality "dev"
```
{% endtab %}
{% tab "PowerShell", icon: "seti:powershell" %}
```powershell
Invoke-Expression "& { $(Invoke-RestMethod 'https://aspire.dev/install.ps1') } -Quality 'dev'"
```
{% endtab %}
{% endos_tabs %}

- Install with verbose output (Linux/macOS only):

  {% os_tabs sync: "terminal" %}
{% tab "Bash", icon: "seti:shell" %}
```bash
./aspire-install.sh --verbose
```
{% endtab %}
{% tab "PowerShell", icon: "seti:powershell" %}
```powershell
# The --verbose option is not available in the PowerShell script.
```
{% endtab %}
{% endos_tabs %}

- Install without modifying `PATH`:

  {% os_tabs sync: "terminal" %}
{% tab "Bash", icon: "seti:shell" %}
```bash
./aspire-install.sh --skip-path
```
{% endtab %}
{% tab "PowerShell", icon: "seti:powershell" %}
```powershell
.\aspire-install.ps1 -SkipPath
```
{% endtab %}
{% endos_tabs %}

  Or download and install in one command:

  {% os_tabs sync: "terminal" %}
{% tab "Bash", icon: "seti:shell" %}
```bash
curl -fsSL https://aspire.dev/install.sh | bash -s -- --skip-path
```
{% endtab %}
{% tab "PowerShell", icon: "seti:powershell" %}
```powershell
irm https://aspire.dev/install.ps1 | iex -SkipPath
```
{% endtab %}
{% endos_tabs %}

## Uninstall

There's no uninstall script. Delete the installation directory, such as `%USERPROFILE%\.aspire\bin` on Windows or `$HOME/.aspire/bin` on Linux/macOS.

To delete the installation directory, run the following command from your terminal:

{% os_tabs sync: "terminal" %}
{% tab "Bash", icon: "seti:shell" %}
```bash
rm -rf $HOME/.aspire/bin
```
{% endtab %}
{% tab "PowerShell", icon: "seti:powershell" %}
```powershell
Remove-Item -Recurse -Force "$HOME\.aspire\bin"
```
{% endtab %}
{% endos_tabs %}

{% aside "tip", title: "Reminder", icon: "information" %}
After deleting the installation directory, don't forget to remove it from your `PATH` environment variable.
{% endaside %}

## See also

- [Install Aspire CLI](/get-started/install-cli/)
- [`aspire` command reference](/reference/cli/commands/aspire/)
