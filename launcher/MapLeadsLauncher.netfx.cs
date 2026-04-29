using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;

public static class MapLeadsLauncher
{
    private static readonly List<Process> Children = new List<Process>();
    private static readonly List<StreamWriter> LogWriters = new List<StreamWriter>();

    public static int Main(string[] args)
    {
        string appDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        string port = Environment.GetEnvironmentVariable("PORT");
        if (string.IsNullOrWhiteSpace(port))
        {
            port = "3000";
        }

        string logsDir = Path.Combine(appDir, "logs");
        Directory.CreateDirectory(logsDir);

        string nodePath = ResolveNode(appDir);
        string serverPath = Path.Combine(appDir, "server.js");
        string gosomPath = Path.Combine(appDir, "tools", "gosom", "google-maps-scraper.exe");
        string cloudflaredPath = Path.Combine(appDir, "tools", "cloudflared", "cloudflared.exe");
        string startTunnelEnv = Environment.GetEnvironmentVariable("START_TUNNEL");
        bool startTunnel = !string.Equals(startTunnelEnv, "0", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(startTunnelEnv, "false", StringComparison.OrdinalIgnoreCase);
        string tunnelConfig = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".cloudflared",
            "eeconnect-mapleads.yml"
        );

        if (!File.Exists(serverPath))
        {
            return Fail("Cannot find server.js in " + appDir);
        }

        if (string.IsNullOrEmpty(nodePath))
        {
            return Fail("Cannot find Node.js. The package should include runtime\\node\\node.exe.");
        }

        Console.Title = "Map Leads Launcher";
        Console.WriteLine("Map Leads Launcher");
        Console.WriteLine("------------------");
        Console.WriteLine("App:   " + appDir);
        Console.WriteLine("Node:  " + nodePath);
        Console.WriteLine("URL:   http://localhost:" + port);
        Console.WriteLine();

        Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs eventArgs)
        {
            eventArgs.Cancel = true;
            StopChildren();
            Environment.Exit(0);
        };

        var serverEnv = new Dictionary<string, string>();
        serverEnv["PORT"] = port;
        if (File.Exists(gosomPath))
        {
            serverEnv["GOSOM_BINARY"] = gosomPath;
        }

        Process server = StartProcess(
            nodePath,
            "server.js",
            appDir,
            Path.Combine(logsDir, "server.log"),
            Path.Combine(logsDir, "server.err.log"),
            serverEnv
        );
        Children.Add(server);

        Console.WriteLine("Server process started: PID " + server.Id);
        Console.WriteLine("Server logs: " + Path.Combine(logsDir, "server.log"));

        if (startTunnel && File.Exists(cloudflaredPath) && File.Exists(tunnelConfig))
        {
            Process tunnel = StartProcess(
                cloudflaredPath,
                "tunnel --config \"" + tunnelConfig + "\" run eeconnect-mapleads",
                appDir,
                Path.Combine(logsDir, "cloudflared.log"),
                Path.Combine(logsDir, "cloudflared.err.log"),
                new Dictionary<string, string>()
            );
            Children.Add(tunnel);
            Console.WriteLine("Cloudflare Tunnel started: PID " + tunnel.Id);
            Console.WriteLine("Tunnel logs: " + Path.Combine(logsDir, "cloudflared.log"));
        }
        else
        {
            Console.WriteLine("Cloudflare Tunnel was not started.");
            Console.WriteLine("Reason: disabled, or cloudflared.exe / ~/.cloudflared/eeconnect-mapleads.yml was not found.");
        }

        Console.WriteLine();
        Console.Write("Waiting for local server");
        bool ready = WaitForHealth("http://localhost:" + port + "/api/health", TimeSpan.FromSeconds(25));
        Console.WriteLine();

        if (ready)
        {
            Console.WriteLine("Local server is ready.");
            OpenBrowser("http://localhost:" + port);
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
            Thread.Sleep(1000);
        }

        Console.WriteLine("Server exited with code " + server.ExitCode + ".");
        StopChildren();
        return server.ExitCode;
    }

    private static string ResolveNode(string appDir)
    {
        string bundled = Path.Combine(appDir, "runtime", "node", "node.exe");
        if (File.Exists(bundled))
        {
            return bundled;
        }

        string path = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (string dir in path.Split(Path.PathSeparator))
        {
            if (string.IsNullOrWhiteSpace(dir)) continue;
            string candidate = Path.Combine(dir.Trim(), "node.exe");
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }

    private static Process StartProcess(
        string fileName,
        string arguments,
        string workingDirectory,
        string stdoutPath,
        string stderrPath,
        IDictionary<string, string> environment
    )
    {
        var startInfo = new ProcessStartInfo();
        startInfo.FileName = fileName;
        startInfo.Arguments = arguments;
        startInfo.WorkingDirectory = workingDirectory;
        startInfo.UseShellExecute = false;
        startInfo.CreateNoWindow = true;
        startInfo.RedirectStandardOutput = true;
        startInfo.RedirectStandardError = true;

        foreach (var item in environment)
        {
            startInfo.EnvironmentVariables[item.Key] = item.Value;
        }

        var process = new Process();
        process.StartInfo = startInfo;
        process.EnableRaisingEvents = true;

        var stdout = new StreamWriter(new FileStream(stdoutPath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite));
        var stderr = new StreamWriter(new FileStream(stderrPath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite));
        stdout.AutoFlush = true;
        stderr.AutoFlush = true;
        LogWriters.Add(stdout);
        LogWriters.Add(stderr);

        process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
        {
            if (e.Data != null) stdout.WriteLine(e.Data);
        };
        process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
        {
            if (e.Data != null) stderr.WriteLine(e.Data);
        };

        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        return process;
    }

    private static bool WaitForHealth(string healthUrl, TimeSpan timeout)
    {
        DateTime deadline = DateTime.UtcNow.Add(timeout);
        while (DateTime.UtcNow < deadline)
        {
            try
            {
                var request = (HttpWebRequest)WebRequest.Create(healthUrl);
                request.Method = "GET";
                request.Timeout = 3000;
                using (var response = (HttpWebResponse)request.GetResponse())
                {
                    if (response.StatusCode == HttpStatusCode.OK)
                    {
                        return true;
                    }
                }
            }
            catch
            {
                // Retry until timeout.
            }

            Console.Write(".");
            Thread.Sleep(1000);
        }

        return false;
    }

    private static void OpenBrowser(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch (Exception error)
        {
            Console.WriteLine("Could not open browser automatically: " + error.Message);
            Console.WriteLine(url);
        }
    }

    private static void StopChildren()
    {
        foreach (Process child in Children)
        {
            try
            {
                if (!child.HasExited)
                {
                    child.Kill();
                }
            }
            catch
            {
                // Best effort shutdown.
            }
        }

        foreach (StreamWriter writer in LogWriters)
        {
            try { writer.Dispose(); } catch { }
        }
    }

    private static int Fail(string message)
    {
        Console.Error.WriteLine(message);
        Console.Error.WriteLine("Press Enter to close.");
        Console.ReadLine();
        return 1;
    }
}
