using PriceHunt.Api.Data.Entities;

namespace PriceHunt.Api.History;

public sealed record HistoryLocationDto(string Code, string Label);

public sealed record HistorySupplierDto(string Code, string Name);

public sealed record HistoryRowDto(
    long Id,
    Guid SearchId,
    DateTime SearchedAt,
    DateOnly FromDate,
    DateOnly ToDate,
    HistoryLocationDto From,
    HistoryLocationDto To,
    HistorySupplierDto Supplier,
    SupplierResponseStatus Status,
    decimal? Price,
    string Currency,
    long ResponseTimeMs,
    string? Error);
