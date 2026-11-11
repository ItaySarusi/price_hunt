using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using PriceHunt.Api.Data;
using PriceHunt.Api.Data.Entities;
using PriceHunt.Api.Search;
using PriceHunt.Api.Suppliers;
using PriceHunt.Tests.TestDoubles;

namespace PriceHunt.Tests.Unit;

public sealed class SearchOrchestratorTests : IAsyncLifetime
{
    private static readonly DateTimeOffset Start = new(2026, 11, 9, 10, 0, 0, TimeSpan.Zero);
    private static readonly TimeSpan Wait = TimeSpan.FromSeconds(5);

    private readonly FakeTimeProvider _time = new(Start);
    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"pricehunt-orch-{Guid.NewGuid():N}.db");
    private IDbContextFactory<PriceHuntDbContext> _db = null!;

    private static readonly SearchCriteria BaseCriteria = new(
        "CNSHA", "USLAX", new DateOnly(2026, 11, 20), new DateOnly(2026, 11, 30), []);

    public async Task InitializeAsync()
    {
        _db = new TestDbContextFactory($"Data Source={_dbPath};Pooling=False");
        await using var ctx = await _db.CreateDbContextAsync();
        await ctx.Database.MigrateAsync();
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

    private SearchOrchestrator CreateOrchestrator(params ISupplierClient[] suppliers) => new(
        _db,
        SupplierRegistry.FromClients(suppliers),
        _time,
        Options.Create(new SearchOptions { TimeoutSeconds = 6 }),
        NullLogger<SearchOrchestrator>.Instance);

    private static SearchCriteria For(params ISupplierClient[] suppliers)
        => BaseCriteria with { Suppliers = suppliers.Select(s => s.Code).ToList() };

    private void Advance(int ms) => _time.Advance(TimeSpan.FromMilliseconds(ms));

    private static async Task<SearchEvent> NextAsync(IAsyncEnumerator<SearchEvent> e)
    {
        Assert.True(await e.MoveNextAsync().AsTask().WaitAsync(Wait), "expected another event");
        return e.Current;
    }

    /// <summary>Starts MoveNextAsync (which must stay pending), advances fake time, then awaits the event.</summary>
    private async Task<SearchEvent> AdvanceAndNextAsync(IAsyncEnumerator<SearchEvent> e, int ms)
    {
        var pending = e.MoveNextAsync().AsTask();
        Assert.False(pending.IsCompleted, "event arrived before time advanced");
        Advance(ms);
        Assert.True(await pending.WaitAsync(Wait), "expected another event");
        return e.Current;
    }

    private async Task<SearchRecord> LoadSearchAsync(Guid id)
    {
        await using var ctx = await _db.CreateDbContextAsync();
        return await ctx.Searches.Include(s => s.Responses).AsNoTracking().SingleAsync(s => s.Id == id);
    }

    [Fact]
    public async Task Emits_Started_ThenQuotesInCompletionOrder_ThenCompletedEnd_WithoutWaitingForDeadline()
    {
        var a = new DelayedSupplier("A", 3000, 1000.00m, _time);
        var b = new DelayedSupplier("B", 1000, 1234.56m, _time);
        var c = new DelayedSupplier("C", 2000, 999.99m, _time);
        var orchestrator = CreateOrchestrator(a, b, c);

        await using var e = orchestrator.RunAsync(For(a, b, c)).GetAsyncEnumerator();

        var started = Assert.IsType<SearchStarted>(await NextAsync(e));
        Assert.Equal("started", started.EventType);
        Assert.Equal(3, started.Total);
        Assert.Equal(["A", "B", "C"], started.Suppliers);
        Assert.Equal(6000, started.TimeoutMs);
        Assert.Equal(Start.UtcDateTime, started.StartedAt);
        Assert.Equal(DateTimeKind.Utc, started.StartedAt.Kind);

        var q1 = Assert.IsType<QuoteReceived>(await AdvanceAndNextAsync(e, 1000));
        var q2 = Assert.IsType<QuoteReceived>(await AdvanceAndNextAsync(e, 1000));
        var q3 = Assert.IsType<QuoteReceived>(await AdvanceAndNextAsync(e, 1000));
        Assert.Equal(["B", "C", "A"], new[] { q1.Supplier, q2.Supplier, q3.Supplier });

        Assert.Equal("quote", q1.EventType);
        Assert.Equal(started.SearchId, q1.SearchId);
        Assert.Equal("Supplier B", q1.SupplierName);
        Assert.Equal(1234.56m, q1.Price);
        Assert.Equal("USD", q1.Currency);
        Assert.Equal(1000, q1.ResponseTimeMs);
        Assert.Equal(Start.UtcDateTime.AddSeconds(1), q1.ReceivedAt);
        Assert.Equal("1000.00", q3.Price.ToString(System.Globalization.CultureInfo.InvariantCulture));

        // All answered at t=3s: end arrives immediately, without advancing towards the 6 s deadline.
        var end = Assert.IsType<SearchEnded>(await NextAsync(e));
        Assert.Equal("end", end.EventType);
        Assert.Equal("Completed", end.Status);
        Assert.Equal(3, end.Total);
        Assert.Equal(3, end.Responded);
        Assert.Equal(3, end.Succeeded);
        Assert.Equal(0, end.Failed);
        Assert.Equal(0, end.NoResponse);
        Assert.Equal(3000, end.ElapsedMs);
        Assert.Equal(Start.AddSeconds(3), _time.GetUtcNow());
        Assert.False(await e.MoveNextAsync());

        var search = await LoadSearchAsync(started.SearchId);
        Assert.Equal(SearchStatus.Completed, search.Status);
        Assert.Equal(3000, search.DurationMs);
        Assert.Equal(Start.UtcDateTime.AddSeconds(3), search.EndedAt);
    }

    [Fact]
    public async Task PersistsSearchAndEveryOutcome_WithCorrectFields()
    {
        var a = new DelayedSupplier("A", 1500, 1234.56m, _time);
        var f = new FailingSupplier("F", 500, _time);
        var orchestrator = CreateOrchestrator(a, f);

        await using var e = orchestrator.RunAsync(For(a, f)).GetAsyncEnumerator();
        var started = Assert.IsType<SearchStarted>(await NextAsync(e));

        // Running row exists as soon as the search starts.
        var running = await LoadSearchAsync(started.SearchId);
        Assert.Equal(SearchStatus.Running, running.Status);
        Assert.Null(running.EndedAt);

        await AdvanceAndNextAsync(e, 500);
        await AdvanceAndNextAsync(e, 1000);
        Assert.IsType<SearchEnded>(await NextAsync(e));

        var search = await LoadSearchAsync(started.SearchId);
        Assert.Equal("CNSHA", search.FromLocationCode);
        Assert.Equal("Shanghai, CN", search.FromLocationName);
        Assert.Equal("USLAX", search.ToLocationCode);
        Assert.Equal("Los Angeles, US", search.ToLocationName);
        Assert.Equal(new DateOnly(2026, 11, 20), search.FromDate);
        Assert.Equal(new DateOnly(2026, 11, 30), search.ToDate);
        Assert.Equal(["A", "F"], search.SelectedSuppliers);
        Assert.Equal(Start.UtcDateTime, search.CreatedAt);
        Assert.Equal(Start.UtcDateTime.AddMilliseconds(1500), search.EndedAt);
        Assert.Equal(1500, search.DurationMs);
        Assert.Equal(SearchStatus.Completed, search.Status);
        Assert.False(search.IsDemo);

        Assert.Equal(2, search.Responses.Count);
        var ra = search.Responses.Single(r => r.SupplierCode == "A");
        Assert.Equal("Supplier A", ra.SupplierName);
        Assert.Equal(SupplierResponseStatus.Success, ra.Status);
        Assert.Equal(123456L, ra.PriceCents);
        Assert.Equal("USD", ra.Currency);
        Assert.Equal(1500, ra.ResponseTimeMs);
        Assert.Equal(Start.UtcDateTime.AddMilliseconds(1500), ra.ReceivedAt);
        Assert.Null(ra.Error);

        var rf = search.Responses.Single(r => r.SupplierCode == "F");
        Assert.Equal(SupplierResponseStatus.Failed, rf.Status);
        Assert.Null(rf.PriceCents);
        Assert.Equal(500, rf.ResponseTimeMs);
        Assert.Equal(Start.UtcDateTime.AddMilliseconds(500), rf.ReceivedAt);
        Assert.Equal("Supplier F is temporarily unavailable", rf.Error);
    }

    [Fact]
    public async Task NeverRespondingSupplier_TimesOutAtExactlySixSeconds_AndIsStoredAsNoResponse()
    {
        var a = new DelayedSupplier("A", 1000, 1500m, _time);
        var g = new SpySupplier("G", _time);
        var orchestrator = CreateOrchestrator(a, g);

        await using var e = orchestrator.RunAsync(For(a, g)).GetAsyncEnumerator();
        var started = Assert.IsType<SearchStarted>(await NextAsync(e));
        Assert.IsType<QuoteReceived>(await AdvanceAndNextAsync(e, 1000));

        var pending = e.MoveNextAsync().AsTask();
        Advance(4999); // t = 5.999 s
        await Task.Delay(50);
        Assert.False(pending.IsCompleted, "search ended before the 6 s deadline");
        Assert.False(g.ReceivedToken.IsCancellationRequested);

        Advance(1); // t = 6 s exactly
        Assert.True(await pending.WaitAsync(Wait));
        var end = Assert.IsType<SearchEnded>(e.Current);
        Assert.Equal("TimedOut", end.Status);
        Assert.Equal(2, end.Total);
        Assert.Equal(1, end.Responded);
        Assert.Equal(1, end.Succeeded);
        Assert.Equal(0, end.Failed);
        Assert.Equal(1, end.NoResponse);
        Assert.Equal(6000, end.ElapsedMs);
        Assert.True(g.ObservedCancellation);
        Assert.False(await e.MoveNextAsync());

        var search = await LoadSearchAsync(started.SearchId);
        Assert.Equal(SearchStatus.TimedOut, search.Status);
        Assert.Equal(6000, search.DurationMs);
        var rg = search.Responses.Single(r => r.SupplierCode == "G");
        Assert.Equal(SupplierResponseStatus.NoResponse, rg.Status);
        Assert.Null(rg.PriceCents);
        Assert.Equal(6000, rg.ResponseTimeMs);
        Assert.Equal(Start.UtcDateTime.AddSeconds(6), rg.ReceivedAt);
        Assert.Equal(SupplierResponseStatus.Success, search.Responses.Single(r => r.SupplierCode == "A").Status);
    }

    [Fact]
    public async Task SupplierFailure_DoesNotAffectOthers()
    {
        var a = new DelayedSupplier("A", 1000, 1100m, _time);
        var f = new FailingSupplier("F", 500, _time);
        var b = new DelayedSupplier("B", 1500, 1200m, _time);
        var x = new ThrowingSupplier("X");
        var orchestrator = CreateOrchestrator(a, f, b, x);

        var events = new List<SearchEvent>();
        await using var e = orchestrator.RunAsync(For(a, f, b, x)).GetAsyncEnumerator();
        events.Add(await NextAsync(e));                 // started
        events.Add(await NextAsync(e));                 // X fails synchronously, no time needed
        events.Add(await AdvanceAndNextAsync(e, 500));  // F fails
        events.Add(await AdvanceAndNextAsync(e, 500));  // A quote
        events.Add(await AdvanceAndNextAsync(e, 500));  // B quote
        events.Add(await NextAsync(e));                 // end

        var xFail = Assert.IsType<SupplierFailed>(events[1]);
        Assert.Equal("X", xFail.Supplier);
        Assert.Equal("Supplier error", xFail.Reason);
        Assert.Equal(0, xFail.ResponseTimeMs);

        var fFail = Assert.IsType<SupplierFailed>(events[2]);
        Assert.Equal("supplier-failed", fFail.EventType);
        Assert.Equal("F", fFail.Supplier);
        Assert.Equal("Supplier F", fFail.SupplierName);
        Assert.Equal("Supplier F is temporarily unavailable", fFail.Reason);
        Assert.Equal(500, fFail.ResponseTimeMs);
        Assert.Equal(Start.UtcDateTime.AddMilliseconds(500), fFail.ReceivedAt);

        Assert.Equal("A", Assert.IsType<QuoteReceived>(events[3]).Supplier);
        Assert.Equal("B", Assert.IsType<QuoteReceived>(events[4]).Supplier);

        var end = Assert.IsType<SearchEnded>(events[5]);
        Assert.Equal("Completed", end.Status);
        Assert.Equal(4, end.Responded);
        Assert.Equal(2, end.Succeeded);
        Assert.Equal(2, end.Failed);
        Assert.Equal(0, end.NoResponse);

        var search = await LoadSearchAsync(end.SearchId);
        Assert.Equal(SearchStatus.Completed, search.Status);
        Assert.Equal(SupplierResponseStatus.Success, search.Responses.Single(r => r.SupplierCode == "A").Status);
        Assert.Equal(SupplierResponseStatus.Success, search.Responses.Single(r => r.SupplierCode == "B").Status);
        Assert.Equal(SupplierResponseStatus.Failed, search.Responses.Single(r => r.SupplierCode == "F").Status);
        Assert.Equal(SupplierResponseStatus.Failed, search.Responses.Single(r => r.SupplierCode == "X").Status);
        Assert.Equal("Supplier error", search.Responses.Single(r => r.SupplierCode == "X").Error);
    }

    [Fact]
    public async Task ClientCancel_CancelsSupplierTokens_StoresCancelled_AndEmitsNoEnd()
    {
        var a = new DelayedSupplier("A", 1000, 1500m, _time);
        var b = new DelayedSupplier("B", 3000, 1600m, _time);
        var spy = new SpySupplier("G", _time);
        var orchestrator = CreateOrchestrator(a, b, spy);
        using var requestAborted = new CancellationTokenSource();

        await using var e = orchestrator.RunAsync(For(a, b, spy), requestAborted.Token).GetAsyncEnumerator();
        var started = Assert.IsType<SearchStarted>(await NextAsync(e));
        Assert.IsType<QuoteReceived>(await AdvanceAndNextAsync(e, 1000));

        var pending = e.MoveNextAsync().AsTask();
        Advance(500); // t = 1.5 s
        Assert.False(pending.IsCompleted);
        await requestAborted.CancelAsync();

        Assert.False(await pending.WaitAsync(Wait), "no end event may be emitted after a client cancel");
        Assert.True(spy.Called);
        Assert.True(spy.ReceivedToken.IsCancellationRequested);
        Assert.True(spy.ObservedCancellation);
        Assert.True(b.ReceivedToken.IsCancellationRequested);

        var search = await LoadSearchAsync(started.SearchId);
        Assert.Equal(SearchStatus.Cancelled, search.Status);
        Assert.Equal(1500, search.DurationMs);
        Assert.Equal(Start.UtcDateTime.AddMilliseconds(1500), search.EndedAt);
        Assert.Equal(SupplierResponseStatus.Success, search.Responses.Single(r => r.SupplierCode == "A").Status);
        foreach (var code in new[] { "B", "G" })
        {
            var r = search.Responses.Single(r => r.SupplierCode == code);
            Assert.Equal(SupplierResponseStatus.Cancelled, r.Status);
            Assert.Null(r.PriceCents);
            Assert.Equal(1500, r.ResponseTimeMs);
        }
    }

    [Fact]
    public async Task AbandonedEnumeration_MidStream_StillPersistsCancelled()
    {
        var a = new DelayedSupplier("A", 1000, 1500m, _time);
        var spy = new SpySupplier("G", _time);
        var orchestrator = CreateOrchestrator(a, spy);

        var e = orchestrator.RunAsync(For(a, spy)).GetAsyncEnumerator();
        var started = Assert.IsType<SearchStarted>(await NextAsync(e));
        Assert.IsType<QuoteReceived>(await AdvanceAndNextAsync(e, 1000));

        // What ASP.NET does when the client disconnects: stop enumerating and dispose the iterator.
        await e.DisposeAsync().AsTask().WaitAsync(Wait);

        Assert.True(spy.ReceivedToken.IsCancellationRequested);
        Assert.True(spy.ObservedCancellation);
        var search = await LoadSearchAsync(started.SearchId);
        Assert.Equal(SearchStatus.Cancelled, search.Status);
        Assert.Equal(1000, search.DurationMs);
        Assert.Equal(SupplierResponseStatus.Success, search.Responses.Single(r => r.SupplierCode == "A").Status);
        var rg = search.Responses.Single(r => r.SupplierCode == "G");
        Assert.Equal(SupplierResponseStatus.Cancelled, rg.Status);
        Assert.Equal(1000, rg.ResponseTimeMs);
    }

    [Fact]
    public async Task AbandonedEnumeration_RightAfterStarted_PersistsEverySupplierAsCancelled()
    {
        var a = new DelayedSupplier("A", 1000, 1500m, _time);
        var b = new DelayedSupplier("B", 2000, 1500m, _time);
        var orchestrator = CreateOrchestrator(a, b);

        var e = orchestrator.RunAsync(For(a, b)).GetAsyncEnumerator();
        var started = Assert.IsType<SearchStarted>(await NextAsync(e));
        await e.DisposeAsync().AsTask().WaitAsync(Wait);

        var search = await LoadSearchAsync(started.SearchId);
        Assert.Equal(SearchStatus.Cancelled, search.Status);
        Assert.Equal(0, search.DurationMs);
        Assert.Equal(2, search.Responses.Count);
        Assert.All(search.Responses, r => Assert.Equal(SupplierResponseStatus.Cancelled, r.Status));
    }

    private sealed class TestDbContextFactory(string connectionString) : IDbContextFactory<PriceHuntDbContext>
    {
        private readonly DbContextOptions<PriceHuntDbContext> _options =
            new DbContextOptionsBuilder<PriceHuntDbContext>().UseSqlite(connectionString).Options;

        public PriceHuntDbContext CreateDbContext() => new(_options);
    }
}
