namespace PriceHunt.Api.Search;

public sealed record SearchCriteria(
    string FromLocation,
    string ToLocation,
    DateOnly FromDate,
    DateOnly ToDate,
    IReadOnlyList<string> Suppliers);
