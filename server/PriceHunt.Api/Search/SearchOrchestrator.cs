using System.Runtime.CompilerServices;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PriceHunt.Api.Data;
using PriceHunt.Api.Data.Entities;
using PriceHunt.Api.Locations;
using PriceHunt.Api.Suppliers;

namespace PriceHunt.Api.Search;

/// <summary>
/// Runs one search (SPEC §8): fans out to every selected supplier concurrently, streams outcomes in completion
/// order, enforces the global deadline and persists the search plus one row per supplier.
/// </summary>
public sealed class SearchOrchestrator(
    IDbContextFactory<PriceHuntDbContext> dbFactory,
    SupplierRegistry registry,
    TimeProvider timeProvider,
    IOptions<SearchOptions> options,
    ILogger<SearchOrchestrator> logger)
{
    private const int MaxErrorLength = 200;

    public async IAsyncEnumerable<SearchEvent> RunAsync(
        SearchCriteria criteria,
        [EnumeratorCancellation] CancellationToken requestAborted = default)
    {
        var suppliers = ResolveSuppliers(criteria);
        var timeout = TimeSpan.FromSeconds(options.Value.TimeoutSeconds);

        // §8.1 — own DbContext, insert the Running search.
        var startTimestamp = timeProvider.GetTimestamp();
        var createdAt = timeProvider.GetUtcNow().UtcDateTime;
        await using var db = await dbFactory.CreateDbContextAsync(CancellationToken.None);
        var search = new SearchRecord
        {
            Id = Guid.CreateVersion7(),
            FromLocationCode = criteria.FromLocation,
            FromLocationName = LocationCatalog.Find(criteria.FromLocation)?.Label ?? criteria.FromLocation,
            ToLocationCode = criteria.ToLocation,
            ToLocationName = LocationCatalog.Find(criteria.ToLocation)?.Label ?? criteria.ToLocation,
            FromDate = criteria.FromDate,
            ToDate = criteria.ToDate,
            SelectedSuppliers = suppliers.Select(s => s.Code).ToList(),
            CreatedAt = createdAt,
            Status = SearchStatus.Running,
        };
        db.Searches.Add(search);
        await db.SaveChangesAsync(CancellationToken.None);

        logger.LogInformation(
            "Search {SearchId} started: {From} -> {To} {FromDate}..{ToDate}, suppliers {Suppliers}",
            search.Id, search.FromLocationCode, search.ToLocationCode, search.FromDate, search.ToDate,
            string.Join(',', search.SelectedSuppliers));

        // §8.2 — deadline on the injected TimeProvider, linked with the client's abort token.
        using var timeoutCts = new CancellationTokenSource(timeout, timeProvider);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(requestAborted, timeoutCts.Token);

        var state = new RunState(search, suppliers);
        var tasks = new List<Task<SupplierOutcome>>(suppliers.Count);
        SearchEnded? end = null;
        var finalized = false;
        try
        {
            // §8.3
            yield return new SearchStarted(
                search.Id, suppliers.Count, search.SelectedSuppliers, (long)timeout.TotalMilliseconds, createdAt);

            // §8.4 — start all suppliers concurrently.
            foreach (var supplier in suppliers)
            {
                tasks.Add(RunOneAsync(supplier, criteria, linked.Token));
            }

            // §8.5 — consume in completion order; ends as soon as every task finished.
            await foreach (var task in Task.WhenEach(tasks))
            {
                var outcome = await task; // RunOneAsync never throws.
                switch (outcome)
                {
                    case SupplierOutcome.Success s:
                        var cents = ToCents(s.Quote.Price);
                        state.Record(db, s, SupplierResponseStatus.Success, cents, s.Quote.Currency, error: null);
                        await db.SaveChangesAsync(CancellationToken.None);
                        yield return new QuoteReceived(
                            search.Id, s.Supplier.Code, s.Supplier.Name, FromCents(cents), s.Quote.Currency,
                            s.ElapsedMs, s.CompletedAt);
                        break;

                    case SupplierOutcome.Failed f:
                        var reason = Truncate(f.Reason);
                        state.Record(db, f, SupplierResponseStatus.Failed, priceCents: null, "USD", reason);
                        await db.SaveChangesAsync(CancellationToken.None);
                        yield return new SupplierFailed(
                            search.Id, f.Supplier.Code, f.Supplier.Name, reason, f.ElapsedMs, f.CompletedAt);
                        break;

                    case SupplierOutcome.Cancelled:
                        break; // persisted during finalization (§8.6)
                }
            }

            finalized = true; // set first: a failing finalization must not be retried by the finally block
            end = await FinalizeAsync(db, state, tasks, linked, requestAborted, timeoutCts, startTimestamp, abandoned: false);
        }
        finally
        {
            // §8.7 — the consumer stopped enumerating (client disconnect) or something threw:
            // finalization must still run, with CancellationToken.None for DB writes.
            if (!finalized)
            {
                await FinalizeAsync(db, state, tasks, linked, requestAborted, timeoutCts, startTimestamp, abandoned: true);
            }
        }

        if (end is not null)
        {
            yield return end;
        }
    }

    /// <summary>Step 6: settles every task, stores non-answerers, updates the search. Returns the end event or null.</summary>
    private async Task<SearchEnded?> FinalizeAsync(
        PriceHuntDbContext db,
        RunState state,
        List<Task<SupplierOutcome>> tasks,
        CancellationTokenSource linked,
        CancellationToken requestAborted,
        CancellationTokenSource timeoutCts,
        long startTimestamp,
        bool abandoned)
    {
        var cutOffMs = ElapsedMs(startTimestamp);
        var cutOffAt = timeProvider.GetUtcNow().UtcDateTime;

        await linked.CancelAsync();
        await Task.WhenAll(tasks); // RunOneAsync never throws; completes promptly once cancelled.

        var clientCancelled = abandoned || requestAborted.IsCancellationRequested;
        var unanswered = state.Suppliers.Where(s => !state.Answered.Contains(s.Code)).ToList();
        var status = clientCancelled ? SearchStatus.Cancelled
            : unanswered.Count > 0 ? SearchStatus.TimedOut
            : SearchStatus.Completed;

        var missingStatus = clientCancelled ? SupplierResponseStatus.Cancelled : SupplierResponseStatus.NoResponse;
        foreach (var supplier in unanswered)
        {
            db.SupplierResponses.Add(new SupplierResponse
            {
                SearchId = state.Search.Id,
                SupplierCode = supplier.Code,
                SupplierName = supplier.Name,
                Status = missingStatus,
                PriceCents = null,
                Currency = "USD",
                ResponseTimeMs = cutOffMs,
                ReceivedAt = cutOffAt,
            });
        }

        state.Search.Status = status;
        state.Search.EndedAt = cutOffAt;
        state.Search.DurationMs = cutOffMs;
        await db.SaveChangesAsync(CancellationToken.None);

        logger.LogInformation(
            "Search {SearchId} ended: {Status} in {ElapsedMs} ms (total {Total}, succeeded {Succeeded}, failed {Failed}, no response {NoResponse})",
            state.Search.Id, status, cutOffMs, state.Suppliers.Count, state.Succeeded, state.Failed, unanswered.Count);

        if (clientCancelled)
        {
            return null;
        }

        return new SearchEnded(
            state.Search.Id,
            status.ToString(),
            state.Suppliers.Count,
            Responded: state.Succeeded + state.Failed,
            state.Succeeded,
            state.Failed,
            NoResponse: unanswered.Count,
            cutOffMs);
    }

    /// <summary>Calls one supplier. Never throws (SPEC §8.4, R8).</summary>
    private async Task<SupplierOutcome> RunOneAsync(ISupplierClient supplier, SearchCriteria criteria, CancellationToken ct)
    {
        var started = timeProvider.GetTimestamp();
        try
        {
            var quote = await supplier.GetQuoteAsync(criteria, ct);
            return new SupplierOutcome.Success(supplier, quote, ElapsedMs(started), Now());
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            return new SupplierOutcome.Cancelled(supplier, ElapsedMs(started), Now());
        }
        catch (SupplierUnavailableException ex)
        {
            return new SupplierOutcome.Failed(supplier, ex.Message, ElapsedMs(started), Now());
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Supplier {Supplier} failed unexpectedly", supplier.Code);
            return new SupplierOutcome.Failed(supplier, "Supplier error", ElapsedMs(started), Now());
        }
    }

    private IReadOnlyList<ISupplierClient> ResolveSuppliers(SearchCriteria criteria)
    {
        var resolved = new List<ISupplierClient>(criteria.Suppliers.Count);
        foreach (var code in criteria.Suppliers)
        {
            var supplier = registry.TryGet(code)
                ?? throw new ArgumentException($"Unknown supplier '{code}'.", nameof(criteria));
            if (!resolved.Contains(supplier))
            {
                resolved.Add(supplier);
            }
        }
        return resolved;
    }

    private long ElapsedMs(long startTimestamp) => (long)timeProvider.GetElapsedTime(startTimestamp).TotalMilliseconds;

    private DateTime Now() => timeProvider.GetUtcNow().UtcDateTime;

    private static long ToCents(decimal price) => (long)Math.Round(price * 100m, MidpointRounding.AwayFromZero);

    /// <summary>Multiplying by 0.01m keeps scale 2, so 1200 cents serializes as 12.00.</summary>
    private static decimal FromCents(long cents) => cents * 0.01m;

    private static string Truncate(string s) => s.Length <= MaxErrorLength ? s : s[..MaxErrorLength];

    /// <summary>Mutable bookkeeping on the orchestrator's sequential path only (never touched by supplier tasks).</summary>
    private sealed class RunState(SearchRecord search, IReadOnlyList<ISupplierClient> suppliers)
    {
        public SearchRecord Search { get; } = search;
        public IReadOnlyList<ISupplierClient> Suppliers { get; } = suppliers;
        public HashSet<string> Answered { get; } = new(StringComparer.OrdinalIgnoreCase);
        public int Succeeded { get; private set; }
        public int Failed { get; private set; }

        public void Record(
            PriceHuntDbContext db, SupplierOutcome outcome, SupplierResponseStatus status,
            long? priceCents, string currency, string? error)
        {
            Answered.Add(outcome.Supplier.Code);
            if (status == SupplierResponseStatus.Success) Succeeded++; else Failed++;
            db.SupplierResponses.Add(new SupplierResponse
            {
                SearchId = Search.Id,
                SupplierCode = outcome.Supplier.Code,
                SupplierName = outcome.Supplier.Name,
                Status = status,
                PriceCents = priceCents,
                Currency = currency,
                ResponseTimeMs = outcome.ElapsedMs,
                ReceivedAt = outcome.CompletedAt,
                Error = error,
            });
        }
    }
}
