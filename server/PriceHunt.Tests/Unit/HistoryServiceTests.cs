using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using PriceHunt.Api.Data;
using PriceHunt.Api.Data.Entities;
using PriceHunt.Api.History;
using PriceHunt.Api.Suppliers;
using PriceHunt.Tests.TestDoubles;

namespace PriceHunt.Tests.Unit;

public sealed class HistoryServiceTests : IAsyncLifetime
{
    private static readonly DateTime T0 = new(2026, 11, 9, 12, 0, 0, DateTimeKind.Utc);
    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"pricehunt-hist-{Guid.NewGuid():N}.db");
    private IDbContextFactory<PriceHuntDbContext> _db = null!;
    private HistoryService _service = null!;

    public async Task InitializeAsync()
    {
        _db = new TestDbContextFactory($"Data Source={_dbPath};Pooling=False");
        await using var ctx = await _db.CreateDbContextAsync();
        await ctx.Database.MigrateAsync();
        _service = new HistoryService(_db);
    }

    public Task DisposeAsync()
    {
        SqliteConnection.ClearAllPools();
        foreach (var suffix in new[] { "", "-wal", "-shm" })
        {
            try { File.Delete(_dbPath + suffix); } catch (IOException) { }
        }
        return Task.CompletedTask;
    }

    private sealed class TestDbContextFactory(string connectionString) : IDbContextFactory<PriceHuntDbContext>
    {
        private readonly DbContextOptions<PriceHuntDbContext> _options =
            new DbContextOptionsBuilder<PriceHuntDbContext>().UseSqlite(connectionString).Options;

        public PriceHuntDbContext CreateDbContext() => new(_options);
    }

    // ---- seeding helpers ----

    private static DateOnly Day(int day) => new(2026, 12, day);

    private async Task<SearchRecord> AddSearch(int fromDay, int toDay, string from = "CNSHA", string to = "USLAX",
        DateTime? createdAt = null, params SupplierResponse[] responses)
    {
        var f = PriceHunt.Api.Locations.LocationCatalog.Find(from)!;
        var t = PriceHunt.Api.Locations.LocationCatalog.Find(to)!;
        var s = new SearchRecord
        {
            FromLocationCode = f.Code, FromLocationName = f.Label,
            ToLocationCode = t.Code, ToLocationName = t.Label,
            FromDate = Day(fromDay), ToDate = Day(toDay),
            SelectedSuppliers = ["A"], CreatedAt = createdAt ?? T0, Status = SearchStatus.Completed,
            Responses = responses.ToList(),
        };
        await using var ctx = await _db.CreateDbContextAsync();
        ctx.Searches.Add(s);
        await ctx.SaveChangesAsync();
        return s;
    }

    private static SupplierResponse R(string code = "A", SupplierResponseStatus status = SupplierResponseStatus.Success,
        long? cents = 100_00, long ms = 500, DateTime? receivedAt = null, string? error = null) => new()
    {
        SupplierCode = code, SupplierName = $"Supplier {code}", Status = status, PriceCents = cents,
        ResponseTimeMs = ms, ReceivedAt = receivedAt ?? T0, Error = error,
    };

    private static HistoryCriteria Criteria(
        DateOnly? start = null, DateOnly? end = null, string[]? suppliers = null, string? from = null, string? to = null,
        bool includeFailures = true, HistorySortBy sortBy = HistorySortBy.Date, bool desc = false, int page = 1, int pageSize = 50)
        => new(start, end, suppliers ?? [], from, to, includeFailures, sortBy, desc, page, pageSize);

    private async Task<List<long>> Ids(HistoryCriteria c) => (await _service.QueryAsync(c)).Items.Select(i => i.Id).ToList();

    // ---- overlap ----

    [Theory]
    [InlineData(10, 20, true)]   // fully inside
    [InlineData(1, 10, true)]    // search.ToDate == start (boundary)
    [InlineData(20, 30, true)]   // search.FromDate == end (boundary)
    [InlineData(1, 9, false)]    // ends before start
    [InlineData(21, 30, false)]  // starts after end
    [InlineData(5, 25, true)]    // encloses window
    public async Task Overlap_BothBounds(int fromDay, int toDay, bool expected)
    {
        await AddSearch(fromDay, toDay, responses: R());
        var result = await _service.QueryAsync(Criteria(start: Day(10), end: Day(20)));
        Assert.Equal(expected ? 1 : 0, result.TotalCount);
    }

    [Theory]
    [InlineData(1, 9, false)]
    [InlineData(1, 10, true)]
    [InlineData(25, 28, true)]
    public async Task Overlap_StartOnly_UsesToDate(int fromDay, int toDay, bool expected)
    {
        await AddSearch(fromDay, toDay, responses: R());
        Assert.Equal(expected ? 1 : 0, (await _service.QueryAsync(Criteria(start: Day(10)))).TotalCount);
    }

    [Theory]
    [InlineData(21, 30, false)]
    [InlineData(20, 30, true)]
    [InlineData(1, 3, true)]
    public async Task Overlap_EndOnly_UsesFromDate(int fromDay, int toDay, bool expected)
    {
        await AddSearch(fromDay, toDay, responses: R());
        Assert.Equal(expected ? 1 : 0, (await _service.QueryAsync(Criteria(end: Day(20)))).TotalCount);
    }

    [Fact]
    public async Task NoDates_ReturnsEverything()
    {
        await AddSearch(1, 2, responses: R());
        await AddSearch(28, 30, responses: R());
        Assert.Equal(2, (await _service.QueryAsync(Criteria())).TotalCount);
    }

    // ---- filters ----

    [Fact]
    public async Task SupplierFilter_OneSeveralAll()
    {
        await AddSearch(10, 12, responses: [R("A"), R("B"), R("C")]);
        Assert.Equal(1, (await _service.QueryAsync(Criteria(suppliers: ["B"]))).TotalCount);
        Assert.Equal(2, (await _service.QueryAsync(Criteria(suppliers: ["A", "C"]))).TotalCount);
        Assert.Equal(3, (await _service.QueryAsync(Criteria())).TotalCount);
    }

    [Fact]
    public async Task FromAndToFilters_AreIndependent()
    {
        await AddSearch(10, 12, "CNSHA", "USLAX", responses: R());
        await AddSearch(10, 12, "CNSHA", "NLRTM", responses: R());
        await AddSearch(10, 12, "SGSIN", "USLAX", responses: R());
        Assert.Equal(2, (await _service.QueryAsync(Criteria(from: "CNSHA"))).TotalCount);
        Assert.Equal(2, (await _service.QueryAsync(Criteria(to: "USLAX"))).TotalCount);
        Assert.Equal(1, (await _service.QueryAsync(Criteria(from: "CNSHA", to: "USLAX"))).TotalCount);
        Assert.Equal(0, (await _service.QueryAsync(Criteria(from: "USLAX"))).TotalCount);
    }

    [Fact]
    public async Task IncludeFailures_TrueListsSuccessFailedNoResponse_FalseOnlySuccess_CancelledNever()
    {
        await AddSearch(10, 12, responses:
        [
            R("A"), R("B", SupplierResponseStatus.Failed, null, error: "boom"),
            R("G", SupplierResponseStatus.NoResponse, null), R("C", SupplierResponseStatus.Cancelled, null),
        ]);
        var all = await _service.QueryAsync(Criteria(includeFailures: true));
        Assert.Equal(3, all.TotalCount);
        Assert.DoesNotContain(all.Items, i => i.Status == SupplierResponseStatus.Cancelled);
        var ok = await _service.QueryAsync(Criteria(includeFailures: false));
        Assert.Equal(1, ok.TotalCount);
        Assert.Equal(SupplierResponseStatus.Success, ok.Items.Single().Status);
    }

    // ---- shape ----

    [Fact]
    public async Task Row_MapsAllFields()
    {
        var s = await AddSearch(10, 12, responses: R("A", cents: 123456, ms: 1830));
        var f = await AddSearch(10, 12, responses: R("B", SupplierResponseStatus.Failed, null, 700, error: "down"));
        var rows = (await _service.QueryAsync(Criteria(sortBy: HistorySortBy.Supplier))).Items;
        var a = rows[0];
        Assert.Equal(s.Id, a.SearchId);
        Assert.Equal(T0, a.SearchedAt);
        Assert.Equal(Day(10), a.FromDate);
        Assert.Equal(Day(12), a.ToDate);
        Assert.Equal(new HistoryLocationDto("CNSHA", "Shanghai, CN"), a.From);
        Assert.Equal(new HistoryLocationDto("USLAX", "Los Angeles, US"), a.To);
        Assert.Equal(new HistorySupplierDto("A", "Supplier A"), a.Supplier);
        Assert.Equal(1234.56m, a.Price);
        Assert.Equal("USD", a.Currency);
        Assert.Equal(1830, a.ResponseTimeMs);
        Assert.Null(a.Error);
        var b = rows[1];
        Assert.Equal(f.Id, b.SearchId);
        Assert.Null(b.Price);
        Assert.Equal("down", b.Error);
    }

    // ---- sorting ----

    private async Task SeedSortData()
    {
        // Distinct values on every key; inserted in scrambled order.
        await AddSearch(12, 14, "SGSIN", "USLAX", responses: R("C", SupplierResponseStatus.Failed, null, 900, T0.AddMinutes(1)));
        await AddSearch(10, 30, "CNSHA", "USLAX", responses: R("A", SupplierResponseStatus.Success, 300_00, 100, T0.AddMinutes(2)));
        await AddSearch(10, 20, "CNSHA", "NLRTM", responses: R("B", SupplierResponseStatus.NoResponse, null, 6000, T0.AddMinutes(3)));
        await AddSearch(11, 13, "NLRTM", "USLAX", responses: R("D", SupplierResponseStatus.Success, 200_00, 500, T0.AddMinutes(4)));
    }

    [Theory]
    [InlineData(HistorySortBy.Date)]
    [InlineData(HistorySortBy.Route)]
    [InlineData(HistorySortBy.Supplier)]
    [InlineData(HistorySortBy.Price)]
    [InlineData(HistorySortBy.ResponseTime)]
    [InlineData(HistorySortBy.Status)]
    public async Task Sort_EveryKey_AscAndDesc(HistorySortBy key)
    {
        await SeedSortData();
        var asc = await Codes(Criteria(sortBy: key, desc: false));
        var desc = await Codes(Criteria(sortBy: key, desc: true));
        Assert.Equal(Expected(key), asc);
        Assert.Equal(ExpectedDesc(key), desc);
    }

    private async Task<string> Codes(HistoryCriteria c) =>
        string.Join(",", (await _service.QueryAsync(c)).Items.Select(i => i.Supplier.Code));

    // Ids: C=1, A=2, B=3, D=4.
    private static string Expected(HistorySortBy k) => k switch
    {
        HistorySortBy.Date => "B,A,D,C",
        // labels: "Los Angeles, US" < ... route = FromName then ToName:
        // "Rotterdam, NL"(D) vs "Shanghai, CN"(A,B) vs "Singapore, SG"(C); within Shanghai: "Los Angeles" (A) < "Rotterdam" (B)
        HistorySortBy.Route => "D,A,B,C",
        HistorySortBy.Supplier => "A,B,C,D",
        HistorySortBy.Price => "D,A,B,C",           // nulls last; B(id3) vs C(id1) tie -> Id DESC => B before C
        HistorySortBy.ResponseTime => "A,D,C,B",
        HistorySortBy.Status => "C,B,D,A",          // Failed, NoResponse, Success x2 (tie -> Id DESC)
        _ => throw new ArgumentOutOfRangeException(nameof(k)),
    };

    private static string ExpectedDesc(HistorySortBy k) => k switch
    {
        HistorySortBy.Date => "C,D,A,B",
        HistorySortBy.Route => "C,B,A,D",
        HistorySortBy.Supplier => "D,C,B,A",
        HistorySortBy.Price => "A,D,B,C",           // nulls still last; tie -> Id DESC (B then C)
        HistorySortBy.ResponseTime => "B,C,D,A",
        HistorySortBy.Status => "D,A,B,C",
        _ => throw new ArgumentOutOfRangeException(nameof(k)),
    };

    [Fact]
    public async Task Sort_Date_TiesBrokenByReceivedAtDesc_ThenIdDesc()
    {
        await AddSearch(10, 20, responses: R("A", receivedAt: T0.AddMinutes(1)));
        await AddSearch(10, 20, responses: R("B", receivedAt: T0.AddMinutes(5)));
        await AddSearch(10, 20, responses: [R("C", receivedAt: T0.AddMinutes(3)), R("D", receivedAt: T0.AddMinutes(3))]);
        Assert.Equal("B,D,C,A", await Codes(Criteria(sortBy: HistorySortBy.Date)));
    }

    [Fact]
    public async Task Sort_Price_NullsLast_InBothDirections()
    {
        await AddSearch(10, 12, responses:
        [
            R("A", cents: 500_00), R("B", SupplierResponseStatus.Failed, null), R("C", cents: 100_00),
            R("D", SupplierResponseStatus.NoResponse, null), R("E", cents: 300_00),
        ]);
        var asc = (await _service.QueryAsync(Criteria(sortBy: HistorySortBy.Price))).Items;
        Assert.Equal([100m, 300m, 500m], asc.Take(3).Select(i => i.Price));
        Assert.All(asc.Skip(3), i => Assert.Null(i.Price));
        var desc = (await _service.QueryAsync(Criteria(sortBy: HistorySortBy.Price, desc: true))).Items;
        Assert.Equal([500m, 300m, 100m], desc.Take(3).Select(i => i.Price));
        Assert.All(desc.Skip(3), i => Assert.Null(i.Price));
    }

    // ---- paging ----

    [Theory]
    [InlineData(HistorySortBy.Date)]
    [InlineData(HistorySortBy.Route)]
    [InlineData(HistorySortBy.Supplier)]
    [InlineData(HistorySortBy.Price)]
    [InlineData(HistorySortBy.ResponseTime)]
    [InlineData(HistorySortBy.Status)]
    public async Task Paging_IsStable_NoDuplicatesOrGaps_WithTies(HistorySortBy key)
    {
        // 27 rows, deliberately many ties on every key.
        for (var i = 0; i < 9; i++)
        {
            await AddSearch(10, 20, responses:
            [
                R("A", cents: 100_00, ms: 500), R("B", SupplierResponseStatus.Failed, null, 500), R("C", cents: 100_00, ms: 500),
            ]);
        }
        var expected = (await _service.QueryAsync(Criteria(sortBy: key, desc: true, pageSize: 50))).Items.Select(i => i.Id).ToList();
        Assert.Equal(27, expected.Count);
        var paged = new List<long>();
        for (var p = 1; p <= 3; p++)
            paged.AddRange(await Ids(Criteria(sortBy: key, desc: true, page: p, pageSize: 10)));
        Assert.Equal(expected, paged);
        Assert.Equal(27, paged.Distinct().Count());
    }

    [Fact]
    public async Task Totals_AndPagePastEnd()
    {
        for (var i = 0; i < 12; i++) await AddSearch(10, 12, responses: R());
        var p1 = await _service.QueryAsync(Criteria(pageSize: 10));
        Assert.Equal((1, 10, 12, 2), (p1.Page, p1.PageSize, p1.TotalCount, p1.TotalPages));
        Assert.Equal(10, p1.Items.Count);
        var p2 = await _service.QueryAsync(Criteria(page: 2, pageSize: 10));
        Assert.Equal(2, p2.Items.Count);
        var p9 = await _service.QueryAsync(Criteria(page: 9, pageSize: 10));
        Assert.Empty(p9.Items);
        Assert.Equal(12, p9.TotalCount);
        Assert.Equal(2, p9.TotalPages);
    }

    [Fact]
    public async Task Empty_HasZeroPages()
    {
        var r = await _service.QueryAsync(Criteria());
        Assert.Equal((0, 0), (r.TotalCount, r.TotalPages));
        Assert.Empty(r.Items);
    }
}

public sealed class HistoryQueryValidatorTests
{
    private static readonly SupplierRegistry Registry = SupplierRegistry.FromClients(
        new[] { "A", "B", "C" }.Select(c => (ISupplierClient)new DelayedSupplier(c, 1, 1m, TimeProvider.System)));

    private static (HistoryCriteria? C, Dictionary<string, string[]> E) V(HistoryQuery q) => HistoryQueryValidator.Validate(q, Registry);

    [Fact]
    public void Defaults()
    {
        var (c, e) = V(new HistoryQuery());
        Assert.Empty(e);
        Assert.NotNull(c);
        Assert.Equal((1, 25, true, HistorySortBy.Date, false), (c.Page, c.PageSize, c.IncludeFailures, c.SortBy, c.Desc));
        Assert.Empty(c.Suppliers);
        Assert.Null(c.Start);
        Assert.Null(c.End);
    }

    [Fact]
    public void Normalizes_Suppliers_SortAndCodes()
    {
        var (c, e) = V(new HistoryQuery
        {
            Suppliers = ["a", " B ", "a", "c,A"], From = "cnsha", To = "uslax", SortBy = "ResponseTime", SortDir = "DESC",
            PageSize = 50, Page = 3, IncludeFailures = false,
        });
        Assert.Empty(e);
        Assert.Equal(["A", "B", "C"], c!.Suppliers);
        Assert.Equal(("CNSHA", "USLAX"), (c.From, c.To));
        Assert.Equal((HistorySortBy.ResponseTime, true, 50, 3, false), (c.SortBy, c.Desc, c.PageSize, c.Page, c.IncludeFailures));
    }

    [Fact]
    public void StartAfterEnd_IsError()
    {
        var (c, e) = V(new HistoryQuery { Start = new DateOnly(2026, 12, 10), End = new DateOnly(2026, 12, 9) });
        Assert.Null(c);
        Assert.Contains("end", e.Keys);
    }

    [Fact]
    public void StartEqualsEnd_IsFine() =>
        Assert.Empty(V(new HistoryQuery { Start = new DateOnly(2026, 12, 9), End = new DateOnly(2026, 12, 9) }).E);

    [Theory]
    [InlineData("sortBy", "bogus")]
    [InlineData("sortDir", "sideways")]
    [InlineData("suppliers", "Z")]
    [InlineData("from", "XXXXX")]
    [InlineData("to", "XXXXX")]
    public void BadStrings_AreErrors(string field, string value)
    {
        var q = field switch
        {
            "sortBy" => new HistoryQuery { SortBy = value },
            "sortDir" => new HistoryQuery { SortDir = value },
            "suppliers" => new HistoryQuery { Suppliers = [value] },
            "from" => new HistoryQuery { From = value },
            _ => new HistoryQuery { To = value },
        };
        var (c, e) = V(q);
        Assert.Null(c);
        Assert.Contains(field, e.Keys);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void PageBelowOne_IsError(int page)
    {
        var (c, e) = V(new HistoryQuery { Page = page });
        Assert.Null(c);
        Assert.Contains("page", e.Keys);
    }

    [Theory]
    [InlineData(5)]
    [InlineData(20)]
    [InlineData(100)]
    public void PageSize_MustBe10_25_Or50(int size)
    {
        var (c, e) = V(new HistoryQuery { PageSize = size });
        Assert.Null(c);
        Assert.Contains("pageSize", e.Keys);
    }

    [Theory]
    [InlineData(10)]
    [InlineData(25)]
    [InlineData(50)]
    public void PageSize_Allowed(int size) => Assert.Empty(V(new HistoryQuery { PageSize = size }).E);
}
