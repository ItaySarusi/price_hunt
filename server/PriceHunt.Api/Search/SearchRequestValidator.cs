using PriceHunt.Api.Locations;
using PriceHunt.Api.Suppliers;

namespace PriceHunt.Api.Search;

/// <summary>Validates a <see cref="SearchRequest"/> per SPEC §7.2 and normalizes it into <see cref="SearchCriteria"/>.</summary>
public static class SearchRequestValidator
{
    public const int MaxDaysAhead = 365;

    public static (SearchCriteria? Criteria, Dictionary<string, string[]> Errors) Validate(
        SearchRequest request, SupplierRegistry suppliers, TimeProvider timeProvider)
    {
        var errors = new Dictionary<string, List<string>>();
        void Add(string field, string message)
        {
            if (!errors.TryGetValue(field, out var list)) errors[field] = list = [];
            list.Add(message);
        }

        var from = LocationCatalog.Find(request.FromLocation);
        var to = LocationCatalog.Find(request.ToLocation);
        if (from is null) Add("fromLocation", "Unknown origin location.");
        if (to is null) Add("toLocation", "Unknown destination location.");
        if (from is not null && to is not null && from.Code == to.Code)
            Add("toLocation", "Origin and destination must be different.");

        var today = DateOnly.FromDateTime(timeProvider.GetUtcNow().UtcDateTime);
        if (request.FromDate < today.AddDays(-1)) Add("fromDate", "From date cannot be in the past.");
        if (request.FromDate > today.AddDays(MaxDaysAhead))
            Add("fromDate", $"From date cannot be more than {MaxDaysAhead} days ahead.");
        if (request.FromDate > request.ToDate) Add("toDate", "To date must be on or after the from date.");

        var codes = new List<string>();
        if (request.Suppliers is null)
        {
            codes.AddRange(suppliers.All.Select(s => s.Code));
        }
        else if (request.Suppliers.Length == 0)
        {
            Add("suppliers", "Select at least one supplier.");
        }
        else
        {
            foreach (var raw in request.Suppliers)
            {
                var supplier = raw is null ? null : suppliers.TryGet(raw.Trim());
                if (supplier is null) Add("suppliers", $"Unknown supplier '{raw}'.");
                else if (!codes.Contains(supplier.Code)) codes.Add(supplier.Code);
            }
        }

        if (errors.Count > 0)
            return (null, errors.ToDictionary(e => e.Key, e => e.Value.ToArray()));

        return (new SearchCriteria(from!.Code, to!.Code, request.FromDate, request.ToDate, codes), []);
    }
}
