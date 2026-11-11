namespace PriceHunt.Api.Data.Entities;

public sealed class SearchRecord
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public string FromLocationCode { get; set; } = "";
    public string FromLocationName { get; set; } = "";
    public string ToLocationCode { get; set; } = "";
    public string ToLocationName { get; set; } = "";
    public DateOnly FromDate { get; set; }
    public DateOnly ToDate { get; set; }
    public List<string> SelectedSuppliers { get; set; } = [];
    public DateTime CreatedAt { get; set; }
    public DateTime? EndedAt { get; set; }
    public long? DurationMs { get; set; }
    public SearchStatus Status { get; set; }
    public bool IsDemo { get; set; }
    public List<SupplierResponse> Responses { get; set; } = [];
}
