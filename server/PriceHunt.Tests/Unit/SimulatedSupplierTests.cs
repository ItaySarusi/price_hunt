using Microsoft.Extensions.Time.Testing;
using PriceHunt.Api.Search;
using PriceHunt.Api.Suppliers;
using PriceHunt.Tests.TestDoubles;

namespace PriceHunt.Tests.Unit;

public class SimulatedSupplierTests
{
    private static readonly SearchCriteria Criteria = new(
        "CNSHA", "USLAX", new DateOnly(2030, 1, 1), new DateOnly(2030, 1, 10), []);

    private static readonly SupplierOptions Options = new()
    {
        MinDelayMs = 500, MaxDelayMs = 5000, MinPrice = 800m, MaxPrice = 4500m, Currency = "USD",
    };

    private static SimulatedSupplier Make(FakeTimeProvider time, IRandomSource rnd, SupplierItemOptions? item = null) =>
        new(item ?? new SupplierItemOptions { Code = "A", Name = "Supplier A" }, Options, time, rnd);

    // Random call order: delay, failure roll (only if FailureRate > 0), price.

    [Fact]
    public async Task Does_not_complete_before_delay_and_completes_after()
    {
        var time = new FakeTimeProvider();
        var task = Make(time, new FakeRandomSource(0.0)).GetQuoteAsync(Criteria, CancellationToken.None);

        time.Advance(TimeSpan.FromMilliseconds(499));
        Assert.False(task.IsCompleted);

        time.Advance(TimeSpan.FromMilliseconds(1));
        var quote = await task;
        Assert.Equal("A", quote.SupplierCode);
        Assert.Equal("USD", quote.Currency);
    }

    [Fact]
    public async Task Max_random_gives_max_delay()
    {
        var time = new FakeTimeProvider();
        var task = Make(time, new FakeRandomSource(1.0)).GetQuoteAsync(Criteria, CancellationToken.None);

        time.Advance(TimeSpan.FromMilliseconds(4999));
        Assert.False(task.IsCompleted);
        time.Advance(TimeSpan.FromMilliseconds(1));
        await task;
    }

    [Theory]
    [InlineData(0.0, 800.00)]
    [InlineData(1.0, 4500.00)]
    [InlineData(0.5, 2650.00)]
    public async Task Price_is_within_bounds(double roll, double expected)
    {
        var time = new FakeTimeProvider();
        // delay roll 0, price roll = roll
        var task = Make(time, new FakeRandomSource(0, 0.0, roll)).GetQuoteAsync(Criteria, CancellationToken.None);
        time.Advance(TimeSpan.FromSeconds(5));
        var quote = await task;
        Assert.Equal((decimal)expected, quote.Price);
    }

    [Fact]
    public async Task Price_has_at_most_two_decimals_and_rounds_away_from_zero()
    {
        var time = new FakeTimeProvider();
        var task = Make(time, new FakeRandomSource(0, 0.0, 0.123456789)).GetQuoteAsync(Criteria, CancellationToken.None);
        time.Advance(TimeSpan.FromSeconds(5));
        var quote = await task;
        Assert.Equal(Math.Round(quote.Price, 2), quote.Price);
        Assert.InRange(quote.Price, 800m, 4500m);
    }

    [Fact]
    public async Task Random_prices_stay_in_bounds_with_two_decimals()
    {
        var time = new FakeTimeProvider();
        var rnd = new SystemRandomSource();
        for (var i = 0; i < 200; i++)
        {
            var task = Make(time, rnd).GetQuoteAsync(Criteria, CancellationToken.None);
            time.Advance(TimeSpan.FromSeconds(5));
            var q = await task;
            Assert.InRange(q.Price, 800m, 4500m);
            Assert.Equal(Math.Round(q.Price, 2), q.Price);
        }
    }

    private static readonly SupplierItemOptions F = new() { Code = "F", Name = "Supplier F", FailureRate = 0.3 };

    [Fact]
    public async Task Failure_roll_below_rate_throws_only_after_delay()
    {
        var time = new FakeTimeProvider();
        // delay roll 0 (500ms), failure roll 0.29 < 0.3
        var task = Make(time, new FakeRandomSource(0, 0.0, 0.29), F).GetQuoteAsync(Criteria, CancellationToken.None);

        time.Advance(TimeSpan.FromMilliseconds(499));
        Assert.False(task.IsCompleted);

        time.Advance(TimeSpan.FromMilliseconds(1));
        var ex = await Assert.ThrowsAsync<SupplierUnavailableException>(() => task);
        Assert.Equal("Supplier F is temporarily unavailable", ex.Message);
    }

    [Fact]
    public async Task Failure_roll_at_or_above_rate_succeeds()
    {
        var time = new FakeTimeProvider();
        var task = Make(time, new FakeRandomSource(0, 0.0, 0.3, 0.5), F).GetQuoteAsync(Criteria, CancellationToken.None);
        time.Advance(TimeSpan.FromSeconds(5));
        var quote = await task;
        Assert.Equal("F", quote.SupplierCode);
    }

    [Fact]
    public async Task NeverResponds_does_not_complete_and_ends_with_cancellation()
    {
        var time = new FakeTimeProvider();
        var g = new SupplierItemOptions { Code = "G", Name = "Supplier G", NeverResponds = true };
        using var cts = new CancellationTokenSource();
        var task = Make(time, new FakeRandomSource(0.0), g).GetQuoteAsync(Criteria, cts.Token);

        time.Advance(TimeSpan.FromHours(5));
        Assert.False(task.IsCompleted);

        cts.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => task);
        Assert.True(task.IsCanceled);
    }

    [Fact]
    public async Task Cancellation_during_delay_stops_promptly_without_advancing_time()
    {
        var time = new FakeTimeProvider();
        using var cts = new CancellationTokenSource();
        var task = Make(time, new FakeRandomSource(1.0)).GetQuoteAsync(Criteria, cts.Token);
        Assert.False(task.IsCompleted);

        cts.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => task);
        Assert.True(task.IsCanceled);
    }
}

public class SupplierRegistryTests
{
    [Fact]
    public void Builds_one_client_per_item_and_looks_up_case_insensitively()
    {
        var options = new SupplierOptions
        {
            Items = [new() { Code = "A", Name = "Supplier A" }, new() { Code = "B", Name = "Supplier B" }],
        };
        var registry = new SupplierRegistry(Microsoft.Extensions.Options.Options.Create(options),
            new FakeTimeProvider(), new FakeRandomSource());

        Assert.Equal(["A", "B"], registry.All.Select(s => s.Code));
        Assert.Equal("Supplier B", registry.TryGet("b")!.Name);
        Assert.Null(registry.TryGet("Z"));
    }
}
