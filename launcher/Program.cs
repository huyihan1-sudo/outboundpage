using System.Diagnostics;
using System.Net;

var appDir = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
var port = Environment.GetEnvironmentVariable("PORT");
if (string.IsNullOrWhiteSpace(port))
{
    port = "3000";
}

var logsDir = Path.Combine(appDir, "logs");
Directory.CreateDirectory(logsDir);

var serverLog = Path.Combine(logsDir, "server.log");
var serverErr = Path.Combine(logsDir, "server.err.log");
var tunnelLog = Path.Combine(logsDir, "cloudflared.log");
var tunnelErr = Path.Combine(logsDir, "cloudflared.err.log");

var nodePath = ResolveNode(appDir);
var serverPath = Path.Combine(appDir, "server.js");
var gosomPath = Path.Combine(appDir, "tools", "gosom", "google-maps-scraper.exe");
var cloudflaredPath = Path.Combine(appDir, "tools", "cloudflared", "cloudflared.exe");
var startTunnel = !string.Equals(Environment.GetEnvironmentVariable("START_TUNNEL"), "0", StringComparison.OrdinalIgnoreCase)
    && !string.Equals(Environment.GetEnvironmentVariable("START_TUNNEL"), "false", StringComparison.OrdinalIgnoreCase);
var tunnelConfig = Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
    ".cloudflared",
    "eeconnect-mapleads.yml"
);

if (!File.Exists(serverPath))
{
    Fail($"Cannot find server.js in {appDir}");
    return 1;
}

if (nodePath is null)
{
    Fail("Cannot find Node.js. The package should include runtime\\node\\node.exe.");
    return 1;
}

Console.Title = "Map Leads Launcher";
Console.WriteLine("Map Leads Launcher");
Console.WriteLine("------------------");
Console.WriteLine($"App:   {appDir}");
Console.WriteLine($"Node:  {nodePath}");
Console.WriteLine($"URL:   http://localhost:{port}");
Console.WriteLine();

var children = new List<Process>();
Console.CancelKeyPress += (_, eventArgs) =>
{
    eventArgs.Cancel = true;
    StopChildren(children);
    Environment.Exit(0);
};

var server = StartProcess(
    nodePath,
    "server.js",
    appDir,
    serverLog,
    serverErr,
    new Dictionary<string, string?>
    {
        ["PORT"] = port,
        ["GOSOM_BINARY"] = File.Exists(gosomPath) ? gosomPath : null,
    }
);
children.Add(server);
Console.WriteLine($"Server process started: PID {server.Id}");
Console.WriteLine($"Server logs: {serverLog}");

if (startTunnel && File.Exists(cloudflaredPath) && File.Exists(tunnelConfig))
{
    var tunnel = StartProcess(
        cloudflaredPath,
        $"tunnel --config \"{tunnelConfig}\" run eeconnect-mapleads",
        appDir,
        tunnelLog,
        tunnelErr,
        new Dictionary<string, string?>()
    );
    children.Add(tunnel);
    Console.WriteLine($"Cloudflare Tunnel started: PID {tunnel.Id}");
    Console.WriteLine($"Tunnel logs: {tunnelLog}");
}
else
{
    Console.WriteLine("Cloudflare Tunnel was not started.");
    Console.WriteLine("Reason: disabled, or cloudflared.exe / ~/.cloudflared/eeconnect-mapleads.yml was not found.");
}

var localUrl = $"http://localhost:{port}";
var healthUrl = $"{localUrl}/api/health";
Console.WriteLine();
Console.Write("Waiting for local server");
var ready = await WaitForHealth(healthUrl, TimeSpan.FromSeconds(25));
Console.WriteLine();

if (ready)
{
    Console.WriteLine("Local server is ready.");
    OpenBrowser(localUrl);
}
else
{
    Console.WriteLine("Server did not become ready in time. Check logs before closing this window.");
}

Console.WriteLine();
Console.WriteLine("Keep this window open while using the app.");
Console.WriteLine("Press Ctrl+C to stop the server and tunnel.");

while (!server.HasExited)
{
    await Task.Delay(1000);
}

Console.WriteLine($"Server exited with code {server.ExitCode}.");
StopChildren(children);
return server.ExitCode;

static string? ResolveNode(string appDir)
{
    var bundled = Path.Combine(appDir, "runtime", "node", "node.exe");
    if (File.Exists(bundled)) return bundled;

    var path = Environment.GetEnvironmentVariable("PATH") ?? "";
    foreach (var dir in path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
    {
        var candidate = Path.Combine(dir.Trim(), "node.exe");
        if (File.Exists(candidate)) return candidate;
    }

    return null;
}

static Process StartProcess(
    string fileName,
    string arguments,
    string workingDirectory,
    string stdoutPath,
    string stderrPath,
    IDictionary<string, string?> environment
)
{
    var startInfo = new ProcessStartInfo
    {
        FileName = fileName,
        Arguments = arguments,
        WorkingDirectory = workingDirectory,
        UseShellExecute = false,
        CreateNoWindow = true,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
    };

    foreach (var item in environment)
    {
        if (!string.IsNullOrWhiteSpace(item.Value))
        {
            startInfo.Environment[item.Key] = item.Value;
        }
    }

    var process = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
    var stdout = new StreamWriter(new FileStream(stdoutPath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite)) { AutoFlush = true };
    var stderr = new StreamWriter(new FileStream(stderrPath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite)) { AutoFlush = true };
    process.OutputDataReceived += (_, e) => { if (e.Data is not null) stdout.WriteLine(e.Data); };
    process.ErrorDataReceived += (_, e) => { if (e.Data is not null) stderr.WriteLine(e.Data); };
    process.Exited += (_, _) =>
    {
        stdout.Dispose();
        stderr.Dispose();
    };

    process.Start();
    process.BeginOutputReadLine();
    process.BeginErrorReadLine();
    return process;
}

static async Task<bool> WaitForHealth(string healthUrl, TimeSpan timeout)
{
    using var client = new HttpClient();
    var deadline = DateTimeOffset.UtcNow + timeout;
    while (DateTimeOffset.UtcNow < deadline)
    {
        try
        {
            using var response = await client.GetAsync(healthUrl);
            if (response.StatusCode == HttpStatusCode.OK)
            {
                return true;
            }
        }
        catch
        {
            // Retry until timeout.
        }

        Console.Write(".");
        await Task.Delay(1000);
    }

    return false;
}

static void OpenBrowser(string url)
{
    try
    {
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
    }
    catch (Exception error)
    {
        Console.WriteLine($"Could not open browser automatically: {error.Message}");
        Console.WriteLine(url);
    }
}

static void StopChildren(IEnumerable<Process> children)
{
    foreach (var child in children)
    {
        try
        {
            if (!child.HasExited)
            {
                child.Kill(entireProcessTree: true);
            }
        }
        catch
        {
            // Best effort shutdown.
        }
    }
}

static void Fail(string message)
{
    Console.Error.WriteLine(message);
    Console.Error.WriteLine("Press Enter to close.");
    Console.ReadLine();
}
