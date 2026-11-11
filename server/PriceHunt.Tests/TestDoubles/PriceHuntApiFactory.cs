using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;

namespace PriceHunt.Tests.TestDoubles;

/// <summary>
/// WebApplicationFactory with a unique temp SQLite file (deleted on dispose) and SeedDemoData=false.
/// Set <see cref="Overrides"/> before the first CreateClient/Services access to override configuration.
/// </summary>
public sealed class PriceHuntApiFactory : WebApplicationFactory<Program>
{
    public string DbPath { get; } = Path.Combine(Path.GetTempPath(), $"pricehunt-test-{Guid.NewGuid():N}.db");

    public Dictionary<string, string?> Overrides { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:Default", $"Data Source={DbPath}");
        builder.UseSetting("SeedDemoData", "false");
        foreach (var (key, value) in Overrides)
        {
            builder.UseSetting(key, value);
        }
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (!disposing) return;
        SqliteConnection.ClearAllPools();
        foreach (var suffix in new[] { "", "-wal", "-shm" })
        {
            try { File.Delete(DbPath + suffix); } catch (IOException) { }
        }
    }
}
