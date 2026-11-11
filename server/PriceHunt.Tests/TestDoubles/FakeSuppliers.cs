using PriceHunt.Api.Search;
using PriceHunt.Api.Suppliers;

namespace PriceHunt.Tests.TestDoubles;

/// <summary>Answers with a fixed price after a fixed delay on the given TimeProvider.</summary>
public sealed class DelayedSupplier(string code, int delayMs, decimal price, TimeProvider time) : ISupplierClient
{
    public string Code => code;
    public string Name => $"Supplier {code}";
    public CancellationToken ReceivedToken { get; private set; }

    public async Task<SupplierQuote> GetQuoteAsync(SearchCriteria criteria, CancellationToken ct)
    {
        ReceivedToken = ct;
        await Task.Delay(TimeSpan.FromMilliseconds(delayMs), time, ct);
        return new SupplierQuote(code, price, "USD");
    }
}

/// <summary>Throws <see cref="SupplierUnavailableException"/> after a fixed delay.</summary>
public sealed class FailingSupplier(string code, int delayMs, TimeProvider time) : ISupplierClient
{
    public string Code => code;
    public string Name => $"Supplier {code}";

    public async Task<SupplierQuote> GetQuoteAsync(SearchCriteria criteria, CancellationToken ct)
    {
        await Task.Delay(TimeSpan.FromMilliseconds(delayMs), time, ct);
        throw new SupplierUnavailableException($"{Name} is temporarily unavailable");
    }
}

/// <summary>Throws synchronously, before returning a task.</summary>
public sealed class ThrowingSupplier(string code) : ISupplierClient
{
    public string Code => code;
    public string Name => $"Supplier {code}";

    public Task<SupplierQuote> GetQuoteAsync(SearchCriteria criteria, CancellationToken ct)
        => throw new InvalidOperationException("secret detail");
}

/// <summary>Never answers; records the token it was given so tests can verify cancellation propagated.</summary>
public sealed class SpySupplier(string code, TimeProvider time) : ISupplierClient
{
    public string Code => code;
    public string Name => $"Supplier {code}";
    public CancellationToken ReceivedToken { get; private set; }
    public bool Called { get; private set; }
    public bool ObservedCancellation { get; private set; }

    public async Task<SupplierQuote> GetQuoteAsync(SearchCriteria criteria, CancellationToken ct)
    {
        Called = true;
        ReceivedToken = ct;
        try
        {
            await Task.Delay(Timeout.InfiniteTimeSpan, time, ct);
        }
        catch (OperationCanceledException)
        {
            ObservedCancellation = true;
            throw;
        }
        throw new InvalidOperationException("unreachable");
    }
}
