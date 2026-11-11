using Microsoft.EntityFrameworkCore;
using PriceHunt.Api.Data.Entities;
using PriceHunt.Api.Locations;
using PriceHunt.Api.Search;
using PriceHunt.Api.Suppliers;

namespace PriceHunt.Api.Data;

/// <summary>Deterministic demo history (SPEC §9.4). Only runs on an empty Searches table.</summary>
public static class DemoDataSeeder
{
    private const int SearchCount = 40;
    private const int SeedValue = 42;

    /// <returns>Number of searches inserted (0 when skipped).</returns>
    public static async Task<int> SeedAsync(
        IDbContextFactory<PriceHuntDbContext> dbFactory,
        bool enabled,
        SupplierOptions suppliers,
        SearchOptions search,
        TimeProvider time,
        CancellationToken ct = default)
    {
        if (!enabled || suppliers.Items.Count == 0) return 0;

        await using var db = await dbFactory.CreateDbContextAsync(ct);
        if (await db.Searches.AnyAsync(ct)) return 0;

        var searches = Generate(suppliers, search, time.GetUtcNow().UtcDateTime);
        db.Searches.AddRange(searches);
        await db.SaveChangesAsync(ct); // single SaveChanges => single transaction
        return searches.Count;
    }

    private static List<SearchRecord> Generate(SupplierOptions opts, SearchOptions search, DateTime now)
    {
        var rng = new Random(SeedValue);
        var today = DateOnly.FromDateTime(now);
        var locations = LocationCatalog.All;
        var timeoutMs = search.TimeoutSeconds * 1000L;
        var result = new List<SearchRecord>(SearchCount);

        for (var i = 0; i < SearchCount; i++)
        {
            var from = locations[rng.Next(locations.Count)];
            Location to;
            do { to = locations[rng.Next(locations.Count)]; } while (to.Code == from.Code);

            var fromDate = today.AddDays(rng.Next(-10, 46));
            var toDate = fromDate.AddDays(rng.Next(1, 22));
            var createdAt = now.AddSeconds(-rng.NextInt64(1, 14L * 24 * 3600));
            createdAt = new DateTime(createdAt.Ticks - createdAt.Ticks % TimeSpan.TicksPerMillisecond, DateTimeKind.Utc);

            var selected = opts.Items.ToList();
            if (rng.NextDouble() >= 0.7)
            {
                var size = rng.Next(1, selected.Count); // 1..Count-1 (1-6 of 7)
                selected = selected.OrderBy(_ => rng.Next()).Take(size).OrderBy(s => s.Code, StringComparer.Ordinal).ToList();
            }

            var cancelled = rng.NextDouble() < 0.10;
            var cutoffMs = rng.NextInt64(opts.MinDelayMs, opts.MaxDelayMs + 1);

            var record = new SearchRecord
            {
                Id = Guid.CreateVersion7(new DateTimeOffset(createdAt)),
                FromLocationCode = from.Code,
                FromLocationName = from.Label,
                ToLocationCode = to.Code,
                ToLocationName = to.Label,
                FromDate = fromDate,
                ToDate = toDate,
                SelectedSuppliers = selected.Select(s => s.Code).ToList(),
                CreatedAt = createdAt,
                IsDemo = true,
            };

            long lastMs = 0;
            var hasNever = false;
            foreach (var s in selected)
            {
                // Always draw delay/failure/price so the stream stays aligned regardless of branch.
                var delay = rng.NextInt64(opts.MinDelayMs, opts.MaxDelayMs + 1);
                var failRoll = rng.NextDouble();
                var cents = (long)Math.Round(
                    (opts.MinPrice + (decimal)rng.NextDouble() * (opts.MaxPrice - opts.MinPrice)) * 100m,
                    MidpointRounding.AwayFromZero);

                var resp = new SupplierResponse
                {
                    SupplierCode = s.Code,
                    SupplierName = s.Name,
                    Currency = opts.Currency,
                };

                if (s.NeverResponds || (cancelled && delay > cutoffMs))
                {
                    hasNever |= s.NeverResponds;
                    if (cancelled)
                    {
                        resp.Status = SupplierResponseStatus.Cancelled;
                        resp.ResponseTimeMs = cutoffMs;
                    }
                    else
                    {
                        resp.Status = SupplierResponseStatus.NoResponse;
                        resp.ResponseTimeMs = timeoutMs;
                    }
                }
                else if (s.FailureRate > 0 && failRoll < s.FailureRate)
                {
                    resp.Status = SupplierResponseStatus.Failed;
                    resp.ResponseTimeMs = delay;
                    resp.Error = $"{s.Name} is temporarily unavailable";
                    lastMs = Math.Max(lastMs, delay);
                }
                else
                {
                    resp.Status = SupplierResponseStatus.Success;
                    resp.ResponseTimeMs = delay;
                    resp.PriceCents = cents;
                    lastMs = Math.Max(lastMs, delay);
                }

                resp.ReceivedAt = createdAt.AddMilliseconds(resp.ResponseTimeMs);
                record.Responses.Add(resp);
            }

            if (cancelled)
            {
                record.Status = SearchStatus.Cancelled;
                record.DurationMs = cutoffMs;
            }
            else if (hasNever)
            {
                record.Status = SearchStatus.TimedOut;
                record.DurationMs = timeoutMs;
            }
            else
            {
                record.Status = SearchStatus.Completed;
                record.DurationMs = lastMs;
            }
            record.EndedAt = createdAt.AddMilliseconds(record.DurationMs.Value);
            result.Add(record);
        }

        return result;
    }
}
