namespace KusakariEcSysOverRay;

public sealed class OverlaySettings
{
    public string ProjectRoot { get; private init; } = "";
    public string StartScriptPath => Path.Combine(ProjectRoot, "scripts", "start.ps1");
    public string StopScriptPath => Path.Combine(ProjectRoot, "scripts", "stop.ps1");

    public static OverlaySettings Load()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);
        for (var depth = 0; current is not null && depth < 8; depth++, current = current.Parent)
        {
            if (File.Exists(Path.Combine(current.FullName, "package.json"))
                && File.Exists(Path.Combine(current.FullName, "backend", "pom.xml"))
                && File.Exists(Path.Combine(current.FullName, "scripts", "start.ps1")))
            {
                return new OverlaySettings { ProjectRoot = current.FullName };
            }
        }
        throw new DirectoryNotFoundException("Kusakari のプロジェクトフォルダーが見つかりません。");
    }
}
