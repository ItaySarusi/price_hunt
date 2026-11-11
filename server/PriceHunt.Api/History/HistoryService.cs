using Microsoft.EntityFrameworkCore;
using PriceHunt.Api.Data;
using PriceHunt.Api.Data.Entities;

namespace PriceHunt.Api.History;

/// <summary>Filters, sorts and pages supplier responses entirely in the database (SPEC §10).</summary>
public sealed class HistoryService(IDbContextFactory<PriceHuntDbContext> dbFactory)
{
    public async Task<PagedResult<HistoryRowDto>> QueryAsync(HistoryCriteria c, CancellationToken ct = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);

        var query = db.SupplierResponses.AsNoTracking()
            .Where(r => r.Status != SupplierResponseStatus.Cancelled);

        if (!c.IncludeFailures) query = query.Where(r => r.Status == SupplierResponseStatus.Success);
        if (c.Suppliers.Count > 0)
        {
            var codes = c.Suppliers.ToList();
            query = query.Where(r => codes.Contains(r.SupplierCode));
        }
        if (c.Start is { } start) query = query.Where(r => r.Search!.ToDate >= start);
        if (c.End is { } end) query = query.Where(r => r.Search!.FromDate <= end);
        if (c.From is { } from) query = query.Where(r => r.Search!.FromLocationCode == from);
        if (c.To is { } to) query = query.Where(r => r.Search!.ToLocationCode == to);

        var total = await query.CountAsync(ct);

        var rows = await Order(query, c.SortBy, c.Desc)
            .Skip((c.Page - 1) * c.PageSize)
            .Take(c.PageSize)
            .Select(r => new
            {
                r.Id, r.SearchId, r.Search!.CreatedAt, r.Search.FromDate, r.Search.ToDate,
                FromCode = r.Search.FromLocationCode, FromLabel = r.Search.FromLocationName,
                ToCode = r.Search.ToLocationCode, ToLabel = r.Search.ToLocationName,
                r.SupplierCode, r.SupplierName, r.Status, r.PriceCents, r.Currency, r.ResponseTimeMs, r.Error,
            })
            .ToListAsync(ct);

        var items = rows.Select(r => new HistoryRowDto(
            r.Id, r.SearchId, r.CreatedAt, r.FromDate, r.ToDate,
            new HistoryLocationDto(r.FromCode, r.FromLabel),
            new HistoryLocationDto(r.ToCode, r.ToLabel),
            new HistorySupplierDto(r.SupplierCode, r.SupplierName),
            r.Status, r.PriceCents is { } p ? p / 100m : null, r.Currency, r.ResponseTimeMs, r.Error)).ToList();

        var totalPages = (int)Math.Ceiling(total / (double)c.PageSize);
        return new PagedResult<HistoryRowDto>(items, c.Page, c.PageSize, total, totalPages);
    }

    private static IOrderedQueryable<SupplierResponse> Order(IQueryable<SupplierResponse> q, HistorySortBy key, bool desc)
    {
        var o = key switch
        {
            HistorySortBy.Date => Asc(q, r => r.Search!.FromDate, desc).ThenBy(desc, r => r.Search!.ToDate).ThenByDescending(r => r.ReceivedAt),
            HistorySortBy.Route => Asc(q, r => r.Search!.FromLocationName, desc).ThenBy(desc, r => r.Search!.ToLocationName),
            HistorySortBy.Supplier => Asc(q, r => r.SupplierName, desc),
            // Nulls last in both directions: sort by "is null" first (false < true), then by value.
            HistorySortBy.Price => q.OrderBy(r => r.PriceCents == null).ThenBy(desc, r => r.PriceCents),
            HistorySortBy.ResponseTime => Asc(q, r => r.ResponseTimeMs, desc),
            HistorySortBy.Status => Asc(q, r => r.Status, desc),
            _ => throw new ArgumentOutOfRangeException(nameof(key)),
        };
        return o.ThenByDescending(r => r.Id);
    }

    private static IOrderedQueryable<SupplierResponse> Asc<TKey>(
        IQueryable<SupplierResponse> q, System.Linq.Expressions.Expression<Func<SupplierResponse, TKey>> key, bool desc)
        => desc ? q.OrderByDescending(key) : q.OrderBy(key);
}

internal static class OrderedQueryableExtensions
{
    public static IOrderedQueryable<T> ThenBy<T, TKey>(
        this IOrderedQueryable<T> q, bool desc, System.Linq.Expressions.Expression<Func<T, TKey>> key)
        => desc ? q.ThenByDescending(key) : q.ThenBy(key);
}
