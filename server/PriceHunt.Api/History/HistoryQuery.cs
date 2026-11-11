using PriceHunt.Api.Locations;
using PriceHunt.Api.Suppliers;

namespace PriceHunt.Api.History;

public enum HistorySortBy
{
    Date,
    Route,
    Supplier,
    Price,
    ResponseTime,
    Status,
}

/// <summary>Raw query-string parameters of <c>GET /api/history</c> (SPEC §10), bound by MVC (names are case-insensitive).</summary>
public sealed class HistoryQuery
{
    public DateOnly? Start { get; init; }
    public DateOnly? End { get; init; }
    /// <summary>Repeated (<c>suppliers=A&amp;suppliers=B</c>) or comma-separated (<c>suppliers=A,B</c>).</summary>
    public string[]? Suppliers { get; init; }
    public string? From { get; init; }
    public string? To { get; init; }
    public bool? IncludeFailures { get; init; }
    public string? SortBy { get; init; }
    public string? SortDir { get; init; }
    public int? Page { get; init; }
    public int? PageSize { get; init; }
}

/// <summary>Validated, normalized history query. Empty <see cref="Suppliers"/> means all suppliers.</summary>
public sealed record HistoryCriteria(
    DateOnly? Start,
    DateOnly? End,
    IReadOnlyList<string> Suppliers,
    string? From,
    string? To,
    bool IncludeFailures,
    HistorySortBy SortBy,
    bool Desc,
    int Page,
    int PageSize);

public static class HistoryQueryValidator
{
    public const int DefaultPageSize = 25;
    public const int MaxPage = 100_000;
    public static readonly int[] AllowedPageSizes = [10, 25, 50];

    private static readonly Dictionary<string, HistorySortBy> SortKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        ["date"] = HistorySortBy.Date,
        ["route"] = HistorySortBy.Route,
        ["supplier"] = HistorySortBy.Supplier,
        ["price"] = HistorySortBy.Price,
        ["responseTime"] = HistorySortBy.ResponseTime,
        ["status"] = HistorySortBy.Status,
    };

    public static (HistoryCriteria? Criteria, Dictionary<string, string[]> Errors) Validate(
        HistoryQuery query, SupplierRegistry registry)
    {
        var errors = new Dictionary<string, List<string>>();
        void Add(string field, string message)
        {
            if (!errors.TryGetValue(field, out var list)) errors[field] = list = [];
            list.Add(message);
        }

        if (query.Start is { } s && query.End is { } e && s > e) Add("end", "End date must be on or after the start date.");

        var suppliers = new List<string>();
        foreach (var token in (query.Suppliers ?? []).SelectMany(v => (v ?? "").Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)))
        {
            var supplier = registry.TryGet(token);
            if (supplier is null) Add("suppliers", $"Unknown supplier '{token}'.");
            else if (!suppliers.Contains(supplier.Code)) suppliers.Add(supplier.Code);
        }

        string? from = null, to = null;
        if (!string.IsNullOrWhiteSpace(query.From))
        {
            from = LocationCatalog.Find(query.From.Trim())?.Code;
            if (from is null) Add("from", "Unknown origin location.");
        }
        if (!string.IsNullOrWhiteSpace(query.To))
        {
            to = LocationCatalog.Find(query.To.Trim())?.Code;
            if (to is null) Add("to", "Unknown destination location.");
        }

        var sortBy = HistorySortBy.Date;
        if (!string.IsNullOrWhiteSpace(query.SortBy) && !SortKeys.TryGetValue(query.SortBy.Trim(), out sortBy))
            Add("sortBy", "sortBy must be one of: date, route, supplier, price, responseTime, status.");

        var desc = false;
        if (!string.IsNullOrWhiteSpace(query.SortDir))
        {
            var dir = query.SortDir.Trim();
            if (dir.Equals("desc", StringComparison.OrdinalIgnoreCase)) desc = true;
            else if (!dir.Equals("asc", StringComparison.OrdinalIgnoreCase)) Add("sortDir", "sortDir must be 'asc' or 'desc'.");
        }

        var page = query.Page ?? 1;
        if (page < 1 || page > MaxPage) Add("page", $"page must be between 1 and {MaxPage}.");

        var pageSize = query.PageSize ?? DefaultPageSize;
        if (!AllowedPageSizes.Contains(pageSize)) Add("pageSize", "pageSize must be one of 10, 25, 50.");

        if (errors.Count > 0)
            return (null, errors.ToDictionary(kv => kv.Key, kv => kv.Value.ToArray()));

        return (new HistoryCriteria(query.Start, query.End, suppliers, from, to,
            query.IncludeFailures ?? true, sortBy, desc, page, pageSize), []);
    }
}
