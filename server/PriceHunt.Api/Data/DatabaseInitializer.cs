using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PriceHunt.Api.Data.Entities;
using PriceHunt.Api.Search;
using PriceHunt.Api.Suppliers;

namespace PriceHunt.Api.Data;

public static class DatabaseInitializer
{
    /// <summary>Applies migrations and enables WAL. Then seeds demo data (SPEC §9.3/§9.4).</summary>
    public static async Task InitializeDatabaseAsync(this IServiceProvider services, CancellationToken ct = default)
    {
        await using var scope = services.CreateAsyncScope();
        var factory = scope.ServiceProvider.GetRequiredService<IDbContextFactory<PriceHuntDbContext>>();
        await using var db = await factory.CreateDbContextAsync(ct);
        await db.Database.MigrateAsync(ct);
        await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;", ct);

        // A hard kill can leave searches stuck in Running; nothing will ever finish them.
        var now = scope.ServiceProvider.GetRequiredService<TimeProvider>().GetUtcNow().UtcDateTime;
        await db.Searches.Where(x => x.Status == SearchStatus.Running).ExecuteUpdateAsync(
            u => u.SetProperty(x => x.Status, SearchStatus.Cancelled)
                  .SetProperty(x => x.EndedAt, x => x.EndedAt ?? now), ct);

        var sp = scope.ServiceProvider;
        await DemoDataSeeder.SeedAsync(
            factory,
            sp.GetRequiredService<IConfiguration>().GetValue("SeedDemoData", false),
            sp.GetRequiredService<IOptions<SupplierOptions>>().Value,
            sp.GetRequiredService<IOptions<SearchOptions>>().Value,
            sp.GetRequiredService<TimeProvider>(),
            ct);
    }
}
