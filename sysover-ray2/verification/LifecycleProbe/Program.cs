using System.Text.Json;
using KusakariEcSysOverRay;

// Exercise the same controller as the buttons, without claiming UI verification.
var settings = OverlaySettings.Load();
var controller = new KusakariEcController(settings);
var observations = new List<object>();
async Task Verify(string step, bool running)
{
    var status = await controller.GetStatusAsync();
    if (running ? !status.BothHealthy : status.AnyHealthy)
        throw new InvalidOperationException("Unexpected service state: " + step);
    observations.Add(new { step, status.BackendHealthy, status.FrontendHealthy });
    Console.WriteLine(step + ": verified");
}
try
{
    await controller.StopAsync();
    await Verify("initial-stop", false);
    await controller.StartAsync();
    await Verify("start", true);
    await controller.RestartAsync();
    await Verify("restart", true);
    await controller.StopAsync();
    await Verify("stop", false);
    await controller.StartAsync();
    await Verify("start-after-stop", true);
    var destination = Path.Combine(settings.ProjectRoot, "artifacts", "deployment");
    Directory.CreateDirectory(destination);
    await File.WriteAllTextAsync(Path.Combine(destination, "ec-controller-lifecycle.json"),
        JsonSerializer.Serialize(new { result = "passed", visibleUiVerified = false, observations },
            new JsonSerializerOptions { WriteIndented = true }));
}
catch
{
    await controller.StopAsync();
    throw;
}
