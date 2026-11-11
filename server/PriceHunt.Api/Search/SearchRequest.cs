namespace PriceHunt.Api.Search;

/// <summary>Body of <c>POST /api/search/stream</c> (SPEC §7.1).</summary>
public sealed record SearchRequest(
    string? FromLocation,
    string? ToLocation,
    DateOnly FromDate,
    DateOnly ToDate,
    string[]? Suppliers);
