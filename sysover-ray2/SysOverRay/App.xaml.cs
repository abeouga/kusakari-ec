using System.Windows;

namespace KusakariEcSysOverRay;

public partial class App : System.Windows.Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        AppDomain.CurrentDomain.UnhandledException += (_, args) =>
        {
            try
            {
                AppLog.Write($"Unhandled exception: {args.ExceptionObject}");
            }
            catch
            {
                // Logging must not mask the original failure.
            }
        };

        base.OnStartup(e);
    }
}
