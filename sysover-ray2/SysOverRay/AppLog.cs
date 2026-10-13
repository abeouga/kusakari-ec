namespace KusakariEcSysOverRay;

public static class AppLog
{
    private static readonly object Sync = new();
    private static readonly string DirectoryPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KusakariOverlay");
    public static string FilePath { get; } = Path.Combine(DirectoryPath, "overlay.log");

    public static void Write(string message)
    {
        lock (Sync)
        {
            Directory.CreateDirectory(DirectoryPath);
            RotateIfNeeded();
            File.AppendAllText(FilePath, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} {message}{Environment.NewLine}");
        }
    }

    private static void RotateIfNeeded()
    {
        var file = new FileInfo(FilePath);
        if (!file.Exists || file.Length < 2 * 1024 * 1024)
        {
            return;
        }

        var previous = Path.Combine(DirectoryPath, "overlay.previous.log");
        File.Move(FilePath, previous, true);
    }
}
