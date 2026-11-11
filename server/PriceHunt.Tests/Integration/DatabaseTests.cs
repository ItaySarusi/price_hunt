using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PriceHunt.Api.Data;
using PriceHunt.Api.Data.Entities;
using PriceHunt.Tests.TestDoubles;

namespace PriceHunt.Tests.Integration;

public sealed class DatabaseTests(PriceHuntApiFactory factory) : IClassFixture<PriceHuntApiFactory>
{
    private IDbContextFactory<PriceHuntDbContext> Contexts =>
        factory.Services.GetRequiredService<IDbContextFactory<PriceHuntDbContext>>();

    private List<string> RawStrings(string sql)
    {
        using var conn = new SqliteConnection($"Data Source={factory.DbPath};Pooling=False");
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        using var r = cmd.ExecuteReader();
        var list = new List<string>();
        while (r.Read()) list.Add(r.GetValue(0).ToString()!);
        return list;
    }

    [Fact]
    public void FreshDbFile_IsMigratedOnStartup()
    {
        _ = factory.Services; // boots the host
        Assert.True(File.Exists(factory.DbPath));
        var tables = RawStrings("SELECT name FROM sqlite_master WHERE type='table'");
        Assert.Contains("Searches", tables);
        Assert.Contains("SupplierResponses", tables);
        var history = RawStrings("SELECT MigrationId FROM __EFMigrationsHistory");
        Assert.Single(history);
        Assert.EndsWith("_InitialCreate", history[0]);
        Assert.Equal(["wal"], RawStrings("PRAGMA journal_mode"));
    }

    [Fact]
    public async Task SearchWithResponses_RoundTrips()
    {
        var id = Guid.CreateVersion7();
        var created = new DateTime(2026, 5, 1, 10, 30, 0, DateTimeKind.Utc);
        await using (var db = await Contexts.CreateDbContextAsync())
        {
            db.Searches.Add(new SearchRecord
            {
                Id = id,
                FromLocationCode = "CNSHA", FromLocationName = "Shanghai",
                ToLocationCode = "USLAX", ToLocationName = "Los Angeles",
                FromDate = new DateOnly(2026, 6, 1), ToDate = new DateOnly(2026, 6, 10),
                SelectedSuppliers = ["A", "B", "G"],
                CreatedAt = created, EndedAt = created.AddSeconds(6), DurationMs = 6000,
                Status = SearchStatus.TimedOut, IsDemo = true,
                Responses =
                [
                    new SupplierResponse
                    {
                        SupplierCode = "A", SupplierName = "Supplier A", Status = SupplierResponseStatus.Success,
                        PriceCents = 123456, Currency = "USD", ResponseTimeMs = 800, ReceivedAt = created.AddMilliseconds(800),
                    },
                    new SupplierResponse
                    {
                        SupplierCode = "G", SupplierName = "Supplier G", Status = SupplierResponseStatus.NoResponse,
                        Currency = "USD", ResponseTimeMs = 6000, ReceivedAt = created.AddSeconds(6), Error = "No response",
                    },
                ],
            });
            await db.SaveChangesAsync();
        }

        await using (var db = await Contexts.CreateDbContextAsync())
        {
            var s = await db.Searches.Include(x => x.Responses).SingleAsync(x => x.Id == id);
            Assert.Equal(["A", "B", "G"], s.SelectedSuppliers);
            Assert.Equal(SearchStatus.TimedOut, s.Status);
            Assert.Equal(new DateOnly(2026, 6, 1), s.FromDate);
            Assert.Equal(DateTimeKind.Utc, s.CreatedAt.Kind);
            Assert.Equal(created, s.CreatedAt);
            Assert.Equal(DateTimeKind.Utc, s.EndedAt!.Value.Kind);
            Assert.True(s.IsDemo);
            Assert.Equal(2, s.Responses.Count);
            var a = s.Responses.Single(r => r.SupplierCode == "A");
            Assert.Equal(123456L, a.PriceCents);
            Assert.Equal(DateTimeKind.Utc, a.ReceivedAt.Kind);
            Assert.Null(s.Responses.Single(r => r.SupplierCode == "G").PriceCents);
        }

        Assert.Equal(["A,B,G"], RawStrings($"SELECT SelectedSuppliers FROM Searches WHERE Id = '{id.ToString().ToUpperInvariant()}'"));
        Assert.Equal(["TimedOut"], RawStrings($"SELECT Status FROM Searches WHERE Id = '{id.ToString().ToUpperInvariant()}'"));
        Assert.Equal(["NoResponse", "Success"],
            RawStrings($"SELECT Status FROM SupplierResponses WHERE SearchId = '{id.ToString().ToUpperInvariant()}' ORDER BY Status"));
    }

    [Fact]
    public async Task DeletingSearch_CascadesToResponses()
    {
        var id = Guid.CreateVersion7();
        await using var db = await Contexts.CreateDbContextAsync();
        db.Searches.Add(new SearchRecord
        {
            Id = id, FromLocationCode = "CNSHA", FromLocationName = "Shanghai",
            ToLocationCode = "USLAX", ToLocationName = "Los Angeles",
            SelectedSuppliers = ["A"], CreatedAt = DateTime.UtcNow, Status = SearchStatus.Completed,
            Responses = [new SupplierResponse { SupplierCode = "A", SupplierName = "Supplier A", Status = SupplierResponseStatus.Failed, ReceivedAt = DateTime.UtcNow }],
        });
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        await db.Searches.Where(s => s.Id == id).ExecuteDeleteAsync();
        Assert.Equal(0, await db.SupplierResponses.CountAsync(r => r.SearchId == id));
    }
}
