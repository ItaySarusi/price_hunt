using PriceHunt.Api.Suppliers;

namespace PriceHunt.Api.Search;

/// <summary>Result of one supplier call. Produced by <c>RunOneAsync</c>, which never throws (SPEC §8.4).</summary>
public abstract record SupplierOutcome(ISupplierClient Supplier, long ElapsedMs, DateTime CompletedAt)
{
    public sealed record Success(ISupplierClient Supplier, SupplierQuote Quote, long ElapsedMs, DateTime CompletedAt)
        : SupplierOutcome(Supplier, ElapsedMs, CompletedAt);

    public sealed record Failed(ISupplierClient Supplier, string Reason, long ElapsedMs, DateTime CompletedAt)
        : SupplierOutcome(Supplier, ElapsedMs, CompletedAt);

    public sealed record Cancelled(ISupplierClient Supplier, long ElapsedMs, DateTime CompletedAt)
        : SupplierOutcome(Supplier, ElapsedMs, CompletedAt);
}
