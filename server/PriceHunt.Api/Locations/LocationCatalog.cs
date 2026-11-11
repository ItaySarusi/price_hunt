using System.Collections.Frozen;

namespace PriceHunt.Api.Locations;

public sealed record Location(string Code, string Name, string CountryCode)
{
    public string Label => $"{Name}, {CountryCode}";
}

public static class LocationCatalog
{
    public static IReadOnlyList<Location> All { get; } = new Location[]
    {
        new("CNSHA", "Shanghai", "CN"),
        new("CNNGB", "Ningbo", "CN"),
        new("CNSZX", "Shenzhen", "CN"),
        new("HKHKG", "Hong Kong", "HK"),
        new("SGSIN", "Singapore", "SG"),
        new("KRPUS", "Busan", "KR"),
        new("JPTYO", "Tokyo", "JP"),
        new("TWKHH", "Kaohsiung", "TW"),
        new("VNSGN", "Ho Chi Minh City", "VN"),
        new("NLRTM", "Rotterdam", "NL"),
        new("BEANR", "Antwerp", "BE"),
        new("DEHAM", "Hamburg", "DE"),
        new("GBFXT", "Felixstowe", "GB"),
        new("FRLEH", "Le Havre", "FR"),
        new("CAVAN", "Vancouver", "CA"),
        new("MXZLO", "Manzanillo", "MX"),
        new("AUMEL", "Melbourne", "AU"),
        new("ITGOA", "Genoa", "IT"),
        new("ESVLC", "Valencia", "ES"),
        new("ESBCN", "Barcelona", "ES"),
        new("GRPIR", "Piraeus", "GR"),
        new("TRIST", "Istanbul", "TR"),
        new("ILHFA", "Haifa", "IL"),
        new("ILASD", "Ashdod", "IL"),
        new("AEJEA", "Jebel Ali", "AE"),
        new("INNSA", "Nhava Sheva", "IN"),
        new("USLAX", "Los Angeles", "US"),
        new("USLGB", "Long Beach", "US"),
        new("USNYC", "New York", "US"),
        new("USSAV", "Savannah", "US"),
        new("USHOU", "Houston", "US"),
        new("BRSSZ", "Santos", "BR"),
        new("ZADUR", "Durban", "ZA"),
    }.OrderBy(l => l.Label, StringComparer.Ordinal).ToArray();

    private static readonly FrozenDictionary<string, Location> ByCode =
        All.ToFrozenDictionary(l => l.Code, StringComparer.OrdinalIgnoreCase);

    public static bool TryGet(string? code, out Location? location)
    {
        location = null;
        return code is not null && ByCode.TryGetValue(code, out location);
    }

    public static Location? Find(string? code) => TryGet(code, out var l) ? l : null;
}
