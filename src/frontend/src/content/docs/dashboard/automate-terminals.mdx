---
title: Automate terminals from your AppHost
description: Use TerminalService to send input, wait for output, and inspect terminal screens from AppHost code, with bounded waits and explicit ownership.
---

Use `TerminalService` to automate an interactive process from AppHost code. You can create a terminal with no dashboard viewer or acquire a handle to an existing resource terminal. Both expose the same input and screen APIs.

This page covers programmatic automation. For scripts played by the CLI against a resource terminal, see [Automate resource terminals with tape files](/dashboard/terminal-tape-playback/).

:::caution[Experimental API]
The terminal automation APIs are experimental and [emit diagnostic `ASPIRETERMINAL001`](/diagnostics/aspireterminal001/). These APIs aren't currently exported to TypeScript, so the examples use C#.
:::

Resolve `TerminalService` from the AppHost's dependency injection container, such as a resource-command callback's `context.Services.GetRequiredService<TerminalService>()`. The terminal types are in `Aspire.Hosting.ApplicationModel`, which AppHost projects import automatically when implicit usings are enabled. For terminal creation and launch options, see [Create ephemeral terminals from your AppHost](/dashboard/ephemeral-terminals/).

## Automate without a viewer

The `AspireTerminal` handle exposes text and key input, bounded waits, and a snapshot of the current screen:

- `SendTextAsync(text, cancellationToken)` sends text as though typed.
- `SendKeyAsync(AspireTerminalKey.Enter, cancellationToken)` sends a keypress. Other keys include `Tab`, the arrows, and `Escape`. Compose modifiers with a key, for example `AspireTerminalKey.Ctrl(AspireTerminalKey.C)` for Ctrl+C.
- `WaitForTextAsync(text, timeout, cancellationToken)` waits for text on the current screen. The default timeout is 30 seconds; a timeout throws `TimeoutException`.
- `GetScreenText()` returns the current screen with newline-separated lines, not a process-exit result or a complete log archive.

The following code runs on Linux or macOS with `/bin/sh`. Use it inside an asynchronous AppHost callback, with `terminals` resolved from dependency injection and `cancellationToken` supplied by the callback.

```csharp title="AppHost.cs — headless automation"
#pragma warning disable ASPIRETERMINAL001

await using var terminal = terminals.CreateTerminal(new TerminalLaunchOptions
{
    Title = "Headless check",
    Executable = "/bin/sh",
    Arguments =
    [
        "-c",
        """
        printf 'Ready for input\n'
        read -r answer
        printf 'Received:%s\n' "$answer"
        read -r finish
        """
    ],
    Placement = TerminalPlacement.None
});

terminal.Start();
await terminal.WaitForTextAsync(
    "Ready for input", TimeSpan.FromSeconds(10), cancellationToken);
await terminal.SendTextAsync("hello", cancellationToken);
await terminal.SendKeyAsync(AspireTerminalKey.Enter, cancellationToken);
await terminal.WaitForTextAsync(
    "Received:hello", TimeSpan.FromSeconds(10), cancellationToken);

var screenText = terminal.GetScreenText();
```

The script stays alive at its final `read` until `await using` disposes the terminal at the end of the enclosing scope. This matters: after an **AppHost-owned workload stops**, input and screen-automation operations throw `InvalidOperationException`. The terminal remains registered and visible until disposal, but reopening it shows its ended state rather than replaying output.

Use distinctive, complete replies when automating. Waiting for text that also appears in the terminal's echoed input can report success before the command actually runs. Polling loops should have deadlines and observe cancellation; don't wait indefinitely for a prompt that might never appear.

## Acquire a resource terminal handle

`TryGetTerminal(string terminalId, out AspireTerminal? terminal)` resolves both AppHost-owned and resource-owned terminals. Resource terminal IDs use `resource:<resource-name>:<replica-index>`, with a zero-based replica index.

For a running shell resource named `shell` configured with [`WithTerminal()`](/app-host/with-terminal/), the following code acquires its first replica's handle and sends an Enter key. Use it inside an asynchronous resource-command callback, where `context` provides the services and cancellation token. Add `using Microsoft.Extensions.DependencyInjection;` at the top of your AppHost file.

```csharp title="AppHost.cs — resource terminal automation"
#pragma warning disable ASPIRETERMINAL001

var terminals = context.Services.GetRequiredService<TerminalService>();
if (!terminals.TryGetTerminal("resource:shell:0", out var terminal))
{
    throw new InvalidOperationException("The shell terminal isn't registered.");
}

await using (terminal)
{
    await terminal.SendKeyAsync(AspireTerminalKey.Enter, context.CancellationToken);
}
```

A successful lookup establishes registration, not that the workload is ready to accept input. Automation shares the resource's live terminal with its viewers, so coordinate input rather than typing over someone else's work.

`Start()` is a no-op on resource-owned terminals: the resource starts its workload. Disposing this handle releases the automation connection, **not the resource or its terminal producer**. A later lookup can acquire a fresh handle.

## Drive a real TUI

The [terminal automation sample](https://github.com/microsoft/aspire-samples/tree/main/samples/terminals/automation-csharp) applies these APIs to Slumber, a REST client running as a resource terminal. Its [command implementation](https://github.com/microsoft/aspire-samples/blob/main/samples/terminals/automation-csharp/apphost.cs) acquires `resource:slumber:0`, sends navigation keys, waits for HTTP status text, and independently checks the API after each operation.

Follow the sample's README to start it, keeping the sibling `basics-csharp` directory because it supplies the API and container image source. Select **Run terminal walkthrough** and confirm **Restart and run**. The command restarts the client to clear its terminal state, resets only the reserved `automation` note, then creates, reads, updates, and deletes that note through the TUI. The [request collection](https://github.com/microsoft/aspire-samples/blob/main/samples/terminals/automation-csharp/requests.yml) disables persisted responses so old results can't satisfy a later run's waits.

The sample also demonstrates a concurrency guard, cancellation, a bounded automation deadline, and logged command failures. Releasing the resource terminal handle leaves the client running with the final response visible. Don't type into or resize its terminal while the walkthrough runs.

## See also

- [Create ephemeral terminals from your AppHost](/dashboard/ephemeral-terminals/)
- [Configure resource terminals](/app-host/with-terminal/)
- [Automate resource terminals with tape files](/dashboard/terminal-tape-playback/)
