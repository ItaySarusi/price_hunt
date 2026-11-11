using Microsoft.Extensions.Options;
using PriceHunt.Api.Search;

namespace PriceHunt.Api.Suppliers;

public sealed class SimulatedSupplier(
    SupplierItemOptions item,
    SupplierOptions options,
    TimeProvider timeProvider,
    IRandomSource random) : ISupplierClient
{
    public string Code => item.Code;
    public string Name => item.Name;

    /// <remarks>
    /// Order of <see cref="IRandomSource.NextDouble"/> calls (relied on by test fakes):
    /// 1) delay, 2) failure roll (only when FailureRate &gt; 0, after the delay), 3) price.
    /// A NeverResponds supplier consumes only the delay roll and then waits forever.
    /// </remarks>
    public async Task<SupplierQuote> GetQuoteAsync(SearchCriteria criteria, CancellationToken ct)
    {
        var delayMs = options.MinDelayMs + random.NextDouble() * (options.MaxDelayMs - options.MinDelayMs);
        await Task.Delay(TimeSpan.FromMilliseconds(delayMs), timeProvider, ct);

        if (item.NeverResponds)
        {
            await Task.Delay(Timeout.InfiniteTimeSpan, timeProvider, ct);
        }

        if (item.FailureRate > 0 && random.NextDouble() < item.FailureRate)
        {
            throw new SupplierUnavailableException($"{Name} is temporarily unavailable");
        }

        var raw = (double)options.MinPrice + random.NextDouble() * (double)(options.MaxPrice - options.MinPrice);
        var price = Math.Round((decimal)raw, 2, MidpointRounding.AwayFromZero);
        return new SupplierQuote(Code, price, options.Currency);
    }
}

public sealed class SupplierRegistry
{
    private readonly Dictionary<string, ISupplierClient> _byCode;

    public SupplierRegistry(IOptions<SupplierOptions> options, TimeProvider timeProvider, IRandomSource random)
        : this(options.Value.Items
            .Select(i => (ISupplierClient)new SimulatedSupplier(i, options.Value, timeProvider, random))
            .ToList())
    {
    }

    private SupplierRegistry(IReadOnlyList<ISupplierClient> clients)
    {
        All = clients;
        _byCode = All.ToDictionary(s => s.Code, StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>Builds a registry over arbitrary clients (used by tests with fake suppliers).</summary>
    public static SupplierRegistry FromClients(IEnumerable<ISupplierClient> clients) => new(clients.ToList());

    public IReadOnlyList<ISupplierClient> All { get; }

    public ISupplierClient? TryGet(string code) => _byCode.GetValueOrDefault(code);
}
