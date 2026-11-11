using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using PriceHunt.Api.Data;
using PriceHunt.Api.Data.Entities;
using PriceHunt.Api.Search;
using PriceHunt.Api.Suppliers;

namespace PriceHunt.Tests.Unit;

public sealed class DatabaseInitializerTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"pricehunt-init-{Guid.NewGuid():N}.db");

    private sealed class Factory(string cs) : IDbContextFactory<PriceHuntDbContext>
    {
        private readonly DbContextOptions<PriceHuntDbContext> _o =
            new DbContextOptionsBuilder<PriceHuntDbContext>().UseSqlite(cs).Options;
        public PriceHuntDbContext CreateDbContext() => new(_o);
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        foreach (var suffix in new[] { "", "-wal", "-shm" })
            try { File.Delete(_path + suffix); } catch (IOException) { }
    }

    [Fact]
    public async Task Initialize_MarksStaleRunningSearchesCancelled()
    {
        var now = new DateTimeOffset(2026, 11, 10, 9, 0, 0, TimeSpan.Zero);
        IDbContextFactory<PriceHuntDbContext> factory = new Factory($"Data Source={_path};Pooling=False");
        var id = Guid.CreateVersion7();
        await using (var db = await factory.CreateDbContextAsync())
        {
            await db.Database.MigrateAsync();
            db.Searches.Add(new SearchRecord
            {
                Id = id,
                FromLocationCode = "CNSHA", FromLocationName = "Shanghai",
                ToLocationCode = "USLAX", ToLocationName = "Los Angeles",
                FromDate = new DateOnly(2026, 12, 1), ToDate = new DateOnly(2026, 12, 10),
                SelectedSuppliers = ["A"],
                CreatedAt = now.UtcDateTime.AddMinutes(-5),
                Status = SearchStatus.Running,
            });
            await db.SaveChangesAsync();
        }

        var services = new ServiceCollection()
            .AddSingleton(factory)
            .AddSingleton<IConfiguration>(new ConfigurationBuilder().Build())
            .AddSingleton(Options.Create(new SupplierOptions()))
            .AddSingleton(Options.Create(new SearchOptions()))
            .AddSingleton<TimeProvider>(new FakeTimeProvider(now))
            .BuildServiceProvider();

        await services.InitializeDatabaseAsync();

        await using var check = await factory.CreateDbContextAsync();
        var s = await check.Searches.SingleAsync(x => x.Id == id);
        Assert.Equal(SearchStatus.Cancelled, s.Status);
        Assert.Equal(now.UtcDateTime, s.EndedAt);
    }
}
