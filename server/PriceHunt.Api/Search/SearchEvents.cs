using System.Text.Json.Serialization;

namespace PriceHunt.Api.Search;

/// <summary>
/// One event of a search stream (SPEC §7.3). <see cref="EventType"/> is the SSE event name;
/// it is excluded from the JSON payload.
/// </summary>
public abstract record SearchEvent(Guid SearchId)
{
    [JsonIgnore]
    public abstract string EventType { get; }
}

public sealed record SearchStarted(
    Guid SearchId,
    int Total,
    IReadOnlyList<string> Suppliers,
    long TimeoutMs,
    DateTime StartedAt) : SearchEvent(SearchId)
{
    [JsonIgnore]
    public override string EventType => "started";
}

public sealed record QuoteReceived(
    Guid SearchId,
    string Supplier,
    string SupplierName,
    decimal Price,
    string Currency,
    long ResponseTimeMs,
    DateTime ReceivedAt) : SearchEvent(SearchId)
{
    [JsonIgnore]
    public override string EventType => "quote";
}

public sealed record SupplierFailed(
    Guid SearchId,
    string Supplier,
    string SupplierName,
    string Reason,
    long ResponseTimeMs,
    DateTime ReceivedAt) : SearchEvent(SearchId)
{
    [JsonIgnore]
    public override string EventType => "supplier-failed";
}

public sealed record SearchEnded(
    Guid SearchId,
    string Status,
    int Total,
    int Responded,
    int Succeeded,
    int Failed,
    int NoResponse,
    long ElapsedMs) : SearchEvent(SearchId)
{
    [JsonIgnore]
    public override string EventType => "end";
}
