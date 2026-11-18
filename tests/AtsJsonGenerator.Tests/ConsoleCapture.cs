namespace AtsJsonGenerator.Tests;

/// <summary>
/// Test classes that replace <see cref="Console.Out"/> or <see cref="Console.Error"/> share one collection
/// so they never run concurrently. Otherwise one class can restore a writer that another class already disposed.
/// </summary>
internal static class ConsoleCapture
{
    public const string CollectionName = "Console capture";
}
