namespace PriceHunt.Api.Suppliers;

public sealed class SupplierOptions
{
    public const string SectionName = "Suppliers";

    public int MinDelayMs { get; set; } = 500;
    public int MaxDelayMs { get; set; } = 5000;
    public decimal MinPrice { get; set; } = 800m;
    public decimal MaxPrice { get; set; } = 4500m;
    public string Currency { get; set; } = "USD";
    public List<SupplierItemOptions> Items { get; set; } = [];
}

public sealed class SupplierItemOptions
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public double FailureRate { get; set; }
    public bool NeverResponds { get; set; }
}
