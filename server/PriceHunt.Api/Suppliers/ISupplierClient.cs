using PriceHunt.Api.Search;

namespace PriceHunt.Api.Suppliers;

public sealed record SupplierQuote(string SupplierCode, decimal Price, string Currency);

public interface ISupplierClient
{
    string Code { get; }
    string Name { get; }
    Task<SupplierQuote> GetQuoteAsync(SearchCriteria criteria, CancellationToken ct);
}
