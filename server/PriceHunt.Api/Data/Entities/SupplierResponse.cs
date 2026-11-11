namespace PriceHunt.Api.Data.Entities;

public sealed class SupplierResponse
{
    public long Id { get; set; }
    public Guid SearchId { get; set; }
    public SearchRecord? Search { get; set; }
    public string SupplierCode { get; set; } = "";
    public string SupplierName { get; set; } = "";
    public SupplierResponseStatus Status { get; set; }
    public long? PriceCents { get; set; }
    public string Currency { get; set; } = "USD";
    public long ResponseTimeMs { get; set; }
    public DateTime ReceivedAt { get; set; }
    public string? Error { get; set; }
}
