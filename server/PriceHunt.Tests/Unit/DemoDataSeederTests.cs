using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;
using PriceHunt.Api.Data;
using PriceHunt.Api.Data.Entities;
using PriceHunt.Api.Search;
using PriceHunt.Api.Suppliers;

namespace PriceHunt.Tests.Unit;

public sealed class DemoDataSeederTests : IAsyncLifetime
{
    private static readonly DateTimeOffset Now = new(2026, 11, 10, 9, 30, 0, TimeSpan.Zero);
    private readonly List<string> _paths = [];

    public Task InitializeAsync() => Task.CompletedTask;

    public Task DisposeAsync()
    {
        SqliteConnection.ClearAllPools();
        foreach (var p in _paths)
            foreach (var suffix in new[] { "", "-wal", "-shm" })
                try { File.Delete(p + suffix); } catch (IOException) { }
        return Task.CompletedTask;
    }

    private sealed class Factory(string cs) : IDbContextFactory<PriceHuntDbContext>
    {
        private readonly DbContextOptions<PriceHuntDbContext> _o =
            new DbContextOptionsBuilder<PriceHuntDbContext>().UseSqlite(cs).Options;
        public PriceHuntDbContext CreateDbContext() => new(_o);
    }

    private async Task<IDbContextFactory<PriceHuntDbContext>> NewDbAsync()
    {
        var path = Path.Combine(Path.GetTempPath(), $"pricehunt-seed-{Guid.NewGuid():N}.db");
        _paths.Add(path);
        IDbContextFactory<PriceHuntDbContext> f = new Factory($"Data Source={path};Pooling=False");
        await using var db = await f.CreateDbContextAsync();
        await db.Database.MigrateAsync();
        return f;
    }

    private static SupplierOptions Suppliers() => new()
    {
        Items =
        [
            new() { Code = "A", Name = "Supplier A" }, new() { Code = "B", Name = "Supplier B" },
            new() { Code = "C", Name = "Supplier C" }, new() { Code = "D", Name = "Supplier D" },
            new() { Code = "E", Name = "Supplier E" }, new() { Code = "F", Name = "Supplier F", FailureRate = 0.3 },
            new() { Code = "G", Name = "Supplier G", NeverResponds = true },
        ],
    };

    private static Task<int> Seed(IDbContextFactory<PriceHuntDbContext> f, bool enabled = true, DateTimeOffset? now = null) =>
        DemoDataSeeder.SeedAsync(f, enabled, Suppliers(), new SearchOptions(), new FakeTimeProvider(now ?? Now));

    [Fact]
    public async Task FreshDb_SeedsRealisticData()
    {
        var f = await NewDbAsync();
        Assert.Equal(40, await Seed(f));
        await using var db = await f.CreateDbContextAsync();
        var searches = await db.Searches.Include(s => s.Responses).ToListAsync();
        Assert.Equal(40, searches.Count);
        Assert.All(searches, s => Assert.True(s.IsDemo));
        var statuses = searches.Select(s => s.Status).Distinct().ToHashSet();
        Assert.Contains(SearchStatus.Completed, statuses);
        Assert.Contains(SearchStatus.TimedOut, statuses);
        Assert.Contains(SearchStatus.Cancelled, statuses);
        Assert.DoesNotContain(SearchStatus.Running, statuses);

        var rows = searches.SelectMany(s => s.Responses).ToList();
        Assert.InRange(rows.Count, 150, 260);
        var rowStatuses = rows.Select(r => r.Status).Distinct().ToHashSet();
        Assert.Equal(4, rowStatuses.Count);

        var today = DateOnly.FromDateTime(Now.UtcDateTime);
        foreach (var s in searches)
        {
            Assert.NotEqual(s.FromLocationCode, s.ToLocationCode);
            Assert.InRange(s.FromDate, today.AddDays(-10), today.AddDays(45));
            Assert.InRange(s.ToDate.DayNumber - s.FromDate.DayNumber, 1, 21);
            Assert.InRange(s.CreatedAt, Now.UtcDateTime.AddDays(-14), Now.UtcDateTime);
            Assert.Equal(DateTimeKind.Utc, s.CreatedAt.Kind);
            Assert.NotNull(s.EndedAt);
            Assert.Equal((long)(s.EndedAt!.Value - s.CreatedAt).TotalMilliseconds, s.DurationMs);
            Assert.Equal(s.SelectedSuppliers.Count, s.Responses.Count);
            Assert.Equal(s.SelectedSuppliers.Order(), s.Responses.Select(r => r.SupplierCode).Order());
            Assert.Equal(s.Status == SearchStatus.TimedOut, s.SelectedSuppliers.Contains("G") && s.Status != SearchStatus.Cancelled);
        }
        Assert.Contains(searches, s => s.SelectedSuppliers.Count == 7);

        Assert.All(rows.Where(r => r.Status == SupplierResponseStatus.Success), r =>
        {
            Assert.InRange(r.PriceCents!.Value, 80_000, 450_000);
            Assert.InRange(r.ResponseTimeMs, 500, 5000);
        });
        Assert.All(rows.Where(r => r.Status != SupplierResponseStatus.Success), r => Assert.Null(r.PriceCents));
        Assert.All(rows.Where(r => r.Status == SupplierResponseStatus.Failed), r =>
        {
            Assert.Equal("F", r.SupplierCode);
            Assert.Equal("Supplier F is temporarily unavailable", r.Error);
        });
        Assert.All(rows.Where(r => r.SupplierCode == "G"), r =>
            Assert.True(r.Status is SupplierResponseStatus.NoResponse or SupplierResponseStatus.Cancelled));
        Assert.All(rows.Where(r => r.Status == SupplierResponseStatus.NoResponse), r => Assert.Equal(6000, r.ResponseTimeMs));

        var fRows = rows.Where(r => r.SupplierCode == "F" && r.Status is SupplierResponseStatus.Success or SupplierResponseStatus.Failed).ToList();
        var ratio = (double)fRows.Count(r => r.Status == SupplierResponseStatus.Failed) / fRows.Count;
        Assert.InRange(ratio, 0.05, 0.6);
    }

    [Fact]
    public async Task SecondRun_AddsNothing()
    {
        var f = await NewDbAsync();
        await Seed(f);
        Assert.Equal(0, await Seed(f));
        await using var db = await f.CreateDbContextAsync();
        Assert.Equal(40, await db.Searches.CountAsync());
    }

    [Fact]
    public async Task NonEmptyDb_IsNotSeeded()
    {
        var f = await NewDbAsync();
        await using (var db = await f.CreateDbContextAsync())
        {
            db.Searches.Add(new SearchRecord { FromLocationCode = "CNSHA", ToLocationCode = "USLAX", CreatedAt = Now.UtcDateTime });
            await db.SaveChangesAsync();
        }
        Assert.Equal(0, await Seed(f));
        await using var db2 = await f.CreateDbContextAsync();
        Assert.Equal(1, await db2.Searches.CountAsync());
    }

    [Fact]
    public async Task Disabled_SeedsNothing()
    {
        var f = await NewDbAsync();
        Assert.Equal(0, await Seed(f, enabled: false));
        await using var db = await f.CreateDbContextAsync();
        Assert.Equal(0, await db.Searches.CountAsync());
    }

    private static async Task<List<string>> Dump(IDbContextFactory<PriceHuntDbContext> f)
    {
        await using var db = await f.CreateDbContextAsync();
        var searches = await db.Searches.Include(s => s.Responses).AsNoTracking().OrderBy(s => s.CreatedAt).ToListAsync();
        return searches.Select(s =>
            $"{s.FromLocationCode}>{s.ToLocationCode} {s.FromDate}-{s.ToDate} {string.Join(',', s.SelectedSuppliers)} " +
            $"{s.CreatedAt:O} {s.EndedAt:O} {s.DurationMs} {s.Status} | " +
            string.Join(';', s.Responses.OrderBy(r => r.SupplierCode).Select(r =>
                $"{r.SupplierCode}:{r.Status}:{r.PriceCents}:{r.ResponseTimeMs}:{r.ReceivedAt:O}:{r.Error}"))).ToList();
    }

    [Fact]
    public async Task SameToday_ProducesIdenticalData()
    {
        var a = await NewDbAsync();
        var b = await NewDbAsync();
        await Seed(a);
        await Seed(b);
        Assert.Equal(await Dump(a), await Dump(b));
    }
}
