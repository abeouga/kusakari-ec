using System.ComponentModel;
using System.Diagnostics;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using MediaColor = System.Windows.Media.Color;

namespace KusakariEcSysOverRay;

public partial class MainWindow : Window
{
    private static readonly System.Windows.Media.Brush HealthyBrush = new SolidColorBrush(MediaColor.FromRgb(64, 210, 145));
    private static readonly System.Windows.Media.Brush StoppedBrush = new SolidColorBrush(MediaColor.FromRgb(112, 119, 134));
    private static readonly System.Windows.Media.Brush BusyBrush = new SolidColorBrush(MediaColor.FromRgb(245, 184, 73));
    private static readonly System.Windows.Media.Brush ErrorBrush = new SolidColorBrush(MediaColor.FromRgb(244, 91, 105));

    private readonly OverlaySettings _settings;
    private readonly KusakariEcController _controller;
    private readonly DispatcherTimer _statusTimer;
    private readonly System.Windows.Forms.NotifyIcon _trayIcon;
    private bool _operationRunning;
    private bool _compact;
    private bool _allowClose;

    public MainWindow()
    {
        InitializeComponent();
        _settings = OverlaySettings.Load();
        _controller = new KusakariEcController(_settings);
        _statusTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2) };
        _statusTimer.Tick += async (_, _) => await RefreshStatusAsync();
        _trayIcon = CreateTrayIcon();
        RestoreWindowPosition();
        AppLog.Write("Kusakari overlay started.");
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        _trayIcon.Visible = true;
        _statusTimer.Start();
        await RefreshStatusAsync();
    }

    private System.Windows.Forms.NotifyIcon CreateTrayIcon()
    {
        var menu = new System.Windows.Forms.ContextMenuStrip();
        menu.Items.Add("表示", null, (_, _) => Dispatcher.Invoke(ShowOverlay));
        menu.Items.Add("Kusakariを再起動", null, (_, _) => Dispatcher.Invoke(async () => await RunOperationAsync(Operation.Restart)));
        menu.Items.Add(new System.Windows.Forms.ToolStripSeparator());
        menu.Items.Add("終了", null, (_, _) => Dispatcher.Invoke(ExitApplication));
        var icon = new System.Windows.Forms.NotifyIcon
        {
            Text = "Kusakari Control",
            Icon = System.Drawing.SystemIcons.Application,
            ContextMenuStrip = menu
        };
        icon.DoubleClick += (_, _) => Dispatcher.Invoke(ShowOverlay);
        return icon;
    }

    private async Task RefreshStatusAsync()
    {
        if (_operationRunning) return;
        try
        {
            var status = await _controller.GetStatusAsync();
            if (!_operationRunning) ApplyStatus(status);
        }
        catch (Exception ex)
        {
            AppLog.Write($"Status refresh failed: {ex}");
            ApplyErrorState("状態を取得できません。設定とログを確認してください。");
        }
    }

    private void ApplyStatus(ServiceStatus status)
    {
        SetServiceStatus(BackendDot, CompactBackendDot, BackendStatusText, status.BackendHealthy);
        SetServiceStatus(FrontendDot, CompactFrontendDot, FrontendStatusText, status.FrontendHealthy);
        BackendLabel.Text = status.BackendUrl is null ? "API" : $"API  ·  {new Uri(status.BackendUrl).Port}";
        FrontendLabel.Text = status.FrontendUrl is null ? "Web" : $"Web  ·  {new Uri(status.FrontendUrl).Port}";

        if (status.BothHealthy)
        {
            SummaryText.Text = "Kusakari 稼働中";
            CompactStatusText.Text = "稼働中";
        }
        else if (!status.BackendHealthy && !status.FrontendHealthy)
        {
            SummaryText.Text = "停止中";
            CompactStatusText.Text = "停止中";
        }
        else
        {
            SummaryText.Text = status.BackendHealthy ? "API 稼働中 · Web 停止中" : "Web 稼働中 · API 停止中";
            CompactStatusText.Text = "一部稼働";
        }

        StartButton.IsEnabled = _controller.CanStart;
        StopButton.IsEnabled = _controller.CanStop;
        RestartButton.IsEnabled = true;
        CompactRestartButton.IsEnabled = true;
    }

    private static void SetServiceStatus(System.Windows.Shapes.Ellipse primaryDot,
        System.Windows.Shapes.Ellipse compactDot, System.Windows.Controls.TextBlock text, bool healthy)
    {
        var brush = healthy ? HealthyBrush : StoppedBrush;
        primaryDot.Fill = brush;
        compactDot.Fill = brush;
        text.Text = healthy ? "稼働中" : "停止中";
        text.Foreground = brush;
    }

    private void ApplyBusyState(string message)
    {
        _operationRunning = true;
        _statusTimer.Stop();
        BackendDot.Fill = BusyBrush;
        FrontendDot.Fill = BusyBrush;
        CompactBackendDot.Fill = BusyBrush;
        CompactFrontendDot.Fill = BusyBrush;
        BackendStatusText.Text = message;
        FrontendStatusText.Text = message;
        BackendStatusText.Foreground = BusyBrush;
        FrontendStatusText.Foreground = BusyBrush;
        SummaryText.Text = message;
        CompactStatusText.Text = message;
        StartButton.IsEnabled = false;
        StopButton.IsEnabled = false;
        RestartButton.IsEnabled = false;
        CompactRestartButton.IsEnabled = false;
    }

    private void ApplyErrorState(string message)
    {
        BackendDot.Fill = ErrorBrush;
        FrontendDot.Fill = ErrorBrush;
        CompactBackendDot.Fill = ErrorBrush;
        CompactFrontendDot.Fill = ErrorBrush;
        SummaryText.Text = "操作に失敗しました";
        CompactStatusText.Text = "失敗";
        LastActionText.Text = message;
    }

    private async Task RunOperationAsync(Operation operation)
    {
        if (_operationRunning) return;
        var label = operation switch { Operation.Start => "起動中", Operation.Stop => "停止中", _ => "再起動中" };
        ApplyBusyState(label);
        LastActionText.Text = $"{DateTime.Now:HH:mm:ss}  {label}";
        try
        {
            switch (operation)
            {
                case Operation.Start: await _controller.StartAsync(); break;
                case Operation.Stop: await _controller.StopAsync(); break;
                case Operation.Restart: await _controller.RestartAsync(); break;
            }
            LastActionText.Text = $"{DateTime.Now:HH:mm:ss}  {label.TrimEnd('中')}完了";
        }
        catch (Exception ex)
        {
            AppLog.Write($"{operation} failed: {ex}");
            ApplyErrorState(ex.Message);
            _trayIcon.ShowBalloonTip(5000, "Kusakari Control", ex.Message, System.Windows.Forms.ToolTipIcon.Error);
            await Task.Delay(1000);
        }
        finally
        {
            _operationRunning = false;
            _statusTimer.Start();
            await RefreshStatusAsync();
        }
    }

    private async void StartButton_Click(object sender, RoutedEventArgs e) => await RunOperationAsync(Operation.Start);
    private async void RestartButton_Click(object sender, RoutedEventArgs e) => await RunOperationAsync(Operation.Restart);
    private async void StopButton_Click(object sender, RoutedEventArgs e) => await RunOperationAsync(Operation.Stop);

    private void OpenBrowserButton_Click(object sender, RoutedEventArgs e)
    {
        if (_controller.FrontendUrl is null)
        {
            System.Windows.MessageBox.Show(this, "Kusakari Webが起動していません。", "Kusakari", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }
        Process.Start(new ProcessStartInfo(_controller.FrontendUrl) { UseShellExecute = true });
    }

    private void OpenLogsButton_Click(object sender, RoutedEventArgs e)
    {
        var directory = Path.GetDirectoryName(AppLog.FilePath)!;
        Directory.CreateDirectory(directory);
        Process.Start(new ProcessStartInfo("explorer.exe", $"\"{directory}\"") { UseShellExecute = true });
    }

    private void PinButton_Click(object sender, RoutedEventArgs e)
    {
        Topmost = !Topmost;
        PinButton.Foreground = Topmost ? new SolidColorBrush(MediaColor.FromRgb(124, 92, 252)) : StoppedBrush;
        PinButton.ToolTip = Topmost ? "常に手前に表示中" : "常に手前に表示";
    }

    private void CompactButton_Click(object sender, RoutedEventArgs e)
    {
        _compact = !_compact;
        ExpandedPanel.Visibility = _compact ? Visibility.Collapsed : Visibility.Visible;
        CompactPanel.Visibility = _compact ? Visibility.Visible : Visibility.Collapsed;
        Height = _compact ? 126 : 300;
        CompactButton.Content = _compact ? "⌄" : "⌃";
        CompactButton.ToolTip = _compact ? "展開する" : "折りたたむ";
    }

    private void HideButton_Click(object sender, RoutedEventArgs e) => Hide();
    private void HeaderArea_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ButtonState == MouseButtonState.Pressed && e.OriginalSource is not System.Windows.Controls.Button) DragMove();
    }

    private void ShowOverlay()
    {
        Show();
        WindowState = WindowState.Normal;
        Activate();
    }

    private void ExitApplication()
    {
        _allowClose = true;
        _statusTimer.Stop();
        SaveWindowPosition();
        _trayIcon.Visible = false;
        _trayIcon.Dispose();
        Close();
        System.Windows.Application.Current.Shutdown();
    }

    private void Window_Closing(object? sender, CancelEventArgs e)
    {
        if (!_allowClose) { e.Cancel = true; Hide(); return; }
        SaveWindowPosition();
    }

    private void RestoreWindowPosition()
    {
        var position = WindowPositionStore.Load();
        WindowStartupLocation = WindowStartupLocation.Manual;
        if (position is null)
        {
            Left = SystemParameters.WorkArea.Right - Width - 24;
            Top = SystemParameters.WorkArea.Bottom - Height - 24;
            return;
        }
        Left = Math.Clamp(position.Value.Left, SystemParameters.VirtualScreenLeft, SystemParameters.VirtualScreenLeft + SystemParameters.VirtualScreenWidth - Width);
        Top = Math.Clamp(position.Value.Top, SystemParameters.VirtualScreenTop, SystemParameters.VirtualScreenTop + SystemParameters.VirtualScreenHeight - Height);
        _compact = position.Value.Compact;
        if (_compact)
        {
            ExpandedPanel.Visibility = Visibility.Collapsed;
            CompactPanel.Visibility = Visibility.Visible;
            Height = 126;
            CompactButton.Content = "⌄";
        }
    }

    private void SaveWindowPosition()
    {
        if (!double.IsNaN(Left) && !double.IsNaN(Top)) WindowPositionStore.Save(new WindowPosition(Left, Top, _compact));
    }

    private enum Operation { Start, Stop, Restart }
}
