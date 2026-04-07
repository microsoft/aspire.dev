namespace PreviewHost.Previews;

internal readonly record struct PreviewBufferSettings(
    int DownloadCopyBufferSize,
    int DownloadFileBufferSize,
    int ManagedZipReadBufferSize,
    long AvailableMemoryBytes)
{
    private const int OneMiB = 1024 * 1024;
    private const long DefaultAvailableMemoryBytes = 2L * 1024 * OneMiB;

    public static PreviewBufferSettings Resolve()
    {
        var availableMemoryBytes = GetAvailableMemoryBytes();

        return availableMemoryBytes switch
        {
            <= 768L * OneMiB => new(
                DownloadCopyBufferSize: 4 * OneMiB,
                DownloadFileBufferSize: 1 * OneMiB,
                ManagedZipReadBufferSize: 4 * OneMiB,
                AvailableMemoryBytes: availableMemoryBytes),

            <= 1536L * OneMiB => new(
                DownloadCopyBufferSize: 8 * OneMiB,
                DownloadFileBufferSize: 2 * OneMiB,
                ManagedZipReadBufferSize: 8 * OneMiB,
                AvailableMemoryBytes: availableMemoryBytes),

            <= 3072L * OneMiB => new(
                DownloadCopyBufferSize: 16 * OneMiB,
                DownloadFileBufferSize: 4 * OneMiB,
                ManagedZipReadBufferSize: 16 * OneMiB,
                AvailableMemoryBytes: availableMemoryBytes),

            <= 6144L * OneMiB => new(
                DownloadCopyBufferSize: 32 * OneMiB,
                DownloadFileBufferSize: 8 * OneMiB,
                ManagedZipReadBufferSize: 24 * OneMiB,
                AvailableMemoryBytes: availableMemoryBytes),

            _ => new(
                DownloadCopyBufferSize: 64 * OneMiB,
                DownloadFileBufferSize: 16 * OneMiB,
                ManagedZipReadBufferSize: 32 * OneMiB,
                AvailableMemoryBytes: availableMemoryBytes)
        };
    }

    public long AvailableMemoryMiB => AvailableMemoryBytes / OneMiB;

    public int DownloadCopyBufferMiB => DownloadCopyBufferSize / OneMiB;

    public int DownloadFileBufferMiB => DownloadFileBufferSize / OneMiB;

    public int ManagedZipReadBufferMiB => ManagedZipReadBufferSize / OneMiB;

    private static long GetAvailableMemoryBytes()
    {
        var gcInfo = GC.GetGCMemoryInfo();
        var gcBudgetBytes = NormalizePositive(gcInfo.TotalAvailableMemoryBytes);
        var managedHeadroomBytes = gcBudgetBytes > 0
            ? Math.Max(gcBudgetBytes - GC.GetTotalMemory(forceFullCollection: false), 0)
            : 0;
        var loadHeadroomBytes = gcInfo.HighMemoryLoadThresholdBytes > 0 && gcInfo.MemoryLoadBytes > 0
            ? Math.Max(gcInfo.HighMemoryLoadThresholdBytes - gcInfo.MemoryLoadBytes, 0)
            : 0;

        long availableMemoryBytes = 0;

        foreach (var candidate in new[] { managedHeadroomBytes, loadHeadroomBytes, gcBudgetBytes })
        {
            if (candidate <= 0)
            {
                continue;
            }

            availableMemoryBytes = availableMemoryBytes == 0
                ? candidate
                : Math.Min(availableMemoryBytes, candidate);
        }

        return availableMemoryBytes > 0
            ? availableMemoryBytes
            : DefaultAvailableMemoryBytes;
    }

    private static long NormalizePositive(long value) =>
        value > 0 && value < long.MaxValue
            ? value
            : 0;
}
