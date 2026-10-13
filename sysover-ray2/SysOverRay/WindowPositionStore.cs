using System.Text.Json;

namespace KusakariEcSysOverRay;

public readonly record struct WindowPosition(double Left, double Top, bool Compact);

public static class WindowPositionStore
{
    private static readonly string DirectoryPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KusakariOverlay");
    private static readonly string FilePath = Path.Combine(DirectoryPath, "window-position.json");

    public static WindowPosition? Load()
    {
        try
        {
            return File.Exists(FilePath) ? JsonSerializer.Deserialize<WindowPosition>(File.ReadAllText(FilePath)) : null;
        }
        catch
        {
            return null;
        }
    }

    public static void Save(WindowPosition position)
    {
        try
        {
            Directory.CreateDirectory(DirectoryPath);
            File.WriteAllText(FilePath, JsonSerializer.Serialize(position));
        }
        catch (Exception ex)
        {
            AppLog.Write($"Could not save window position: {ex.Message}");
        }
    }
}
