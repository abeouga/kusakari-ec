using System.Diagnostics;
using System.Net.Http;
using System.Text;
using System.Text.Json;

namespace KusakariEcSysOverRay;

public sealed class KusakariEcController
{
    private readonly OverlaySettings _settings;
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(2) };
    private ServiceStatus _lastStatus = new(false, false, null, null);

    public KusakariEcController(OverlaySettings settings) => _settings = settings;
    public bool CanStart => true;
    public bool CanStop => _lastStatus.AnyHealthy;
    public string? FrontendUrl => _lastStatus.FrontendUrl;

    public async Task<ServiceStatus> GetStatusAsync()
    {
        var api = await CheckApiAsync("http://127.0.0.1:8086/api/health");
        var web = false;
        try
        {
            using var response = await _http.GetAsync("http://127.0.0.1:5186/");
            web = response.IsSuccessStatusCode
                && (await response.Content.ReadAsStringAsync()).Contains("Kusakari", StringComparison.OrdinalIgnoreCase)
                && await CheckApiAsync("http://127.0.0.1:5186/api/health");
        }
        catch (HttpRequestException) { }
        catch (TaskCanceledException) { }

        _lastStatus = new ServiceStatus(api, web,
            web ? "http://127.0.0.1:5186" : null,
            api ? "http://127.0.0.1:8086" : null);
        return _lastStatus;
    }

    public async Task StartAsync()
    {
        await RunScriptAsync(_settings.StartScriptPath, "-NoBrowser", "-NoOverlay");
        if (!(await GetStatusAsync()).BothHealthy)
            throw new InvalidOperationException("Kusakari の Web と API の応答を確認できませんでした。");
    }

    public async Task StopAsync()
    {
        await RunScriptAsync(_settings.StopScriptPath);
        if ((await GetStatusAsync()).AnyHealthy)
            throw new InvalidOperationException("Kusakari の応答が停止後も残っています。");
    }

    public Task RestartAsync() => StartAsync();

    private async Task<bool> CheckApiAsync(string url)
    {
        try
        {
            using var response = await _http.GetAsync(url);
            if (!response.IsSuccessStatusCode) return false;
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return json.RootElement.GetProperty("application").GetString() == "kusakari-ec"
                && json.RootElement.GetProperty("backend").GetString() == "spring-boot";
        }
        catch (HttpRequestException) { return false; }
        catch (TaskCanceledException) { return false; }
        catch (JsonException) { return false; }
        catch (KeyNotFoundException) { return false; }
    }

    private async Task RunScriptAsync(string script, params string[] arguments)
    {
        if (!File.Exists(script)) throw new FileNotFoundException("起動スクリプトがありません。", script);
        var powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),
            "WindowsPowerShell", "v1.0", "powershell.exe");
        var start = new ProcessStartInfo(powershell)
        {
            WorkingDirectory = _settings.ProjectRoot,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };
        // PowerShell 5.1 otherwise uses the local console code page for redirected text.
        var invocation = "& " + QuotePowerShell(script);
        // These are the fixed switch names supplied by StartAsync, not user input.
        foreach (var argument in arguments) invocation += " " + argument;
        var command = "$ProgressPreference = 'SilentlyContinue'; $OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); "
            + invocation;
        foreach (var part in new[] { "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
                     "-OutputFormat", "Text", "-Command", command })
            start.ArgumentList.Add(part);
        AppLog.Write($"Starting {Path.GetFileName(script)}.");
        using var process = Process.Start(start) ?? throw new InvalidOperationException("操作を開始できませんでした。");
        using var outputCancellation = new CancellationTokenSource();
        var stdout = RecordOutputAsync(process.StandardOutput, Path.GetFileName(script), "stdout", outputCancellation.Token);
        var stderr = RecordOutputAsync(process.StandardError, Path.GetFileName(script), "stderr", outputCancellation.Token);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(90));
        try { await process.WaitForExitAsync(timeout.Token); }
        catch (OperationCanceledException)
        {
            if (!process.HasExited) process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync();
            AppLog.Write($"{Path.GetFileName(script)} timed out after 90 seconds.");
            throw new TimeoutException("Kusakari の操作が90秒以内に完了しませんでした。");
        }
        finally
        {
            // Started services may inherit pipe handles. Drain buffered output,
            // but do not wait for the lifetime of the API/Web processes.
            try { await Task.WhenAll(stdout, stderr).WaitAsync(TimeSpan.FromSeconds(2)); }
            catch (TimeoutException) { outputCancellation.Cancel(); }
        }
        AppLog.Write($"{Path.GetFileName(script)} exit={process.ExitCode}");
        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException($"{Path.GetFileName(script)} が失敗しました。「ログを開く」から overlay.log を確認してください。");
        }
    }
    private static string QuotePowerShell(string value) => "'" + value.Replace("'", "''") + "'";

    private static async Task RecordOutputAsync(StreamReader reader, string script, string stream, CancellationToken cancellation)
    {
        try
        {
            while (await reader.ReadLineAsync(cancellation) is { } line)
                AppLog.Write($"{script} {stream}: {line}");
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { }
        catch (ObjectDisposedException) when (cancellation.IsCancellationRequested) { }
        catch (IOException) when (cancellation.IsCancellationRequested) { }
    }
}

public readonly record struct ServiceStatus(bool BackendHealthy, bool FrontendHealthy,
    string? FrontendUrl, string? BackendUrl)
{
    public bool BothHealthy => BackendHealthy && FrontendHealthy;
    public bool AnyHealthy => BackendHealthy || FrontendHealthy;
}
