using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using PriceHunt.Api.Search;
using PriceHunt.Api.Suppliers;
using PriceHunt.Tests.TestDoubles;

namespace PriceHunt.Tests.Unit;

public sealed class SearchRequestValidatorTests
{
    private static readonly DateOnly Today = new(2026, 11, 9);
    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 11, 9, 23, 30, 0, TimeSpan.Zero));
    private readonly SupplierRegistry _suppliers;

    public SearchRequestValidatorTests()
    {
        var options = new SupplierOptions
        {
            Items = "ABCDEFG".Select(c => new SupplierItemOptions { Code = c.ToString(), Name = $"Supplier {c}" }).ToList(),
        };
        _suppliers = new SupplierRegistry(Options.Create(options), _time, new FakeRandomSource());
    }

    private static SearchRequest Req(
        string from = "CNSHA", string to = "USLAX", DateOnly? fromDate = null, DateOnly? toDate = null, string[]? suppliers = null) =>
        new(from, to, fromDate ?? Today.AddDays(5), toDate ?? Today.AddDays(10), suppliers);

    private (SearchCriteria? C, Dictionary<string, string[]> E) Run(SearchRequest r) =>
        SearchRequestValidator.Validate(r, _suppliers, _time);

    [Fact]
    public void Valid_NullSuppliers_MeansAll()
    {
        var (c, e) = Run(Req());
        Assert.Empty(e);
        Assert.Equal(["A", "B", "C", "D", "E", "F", "G"], c!.Suppliers);
    }

    [Fact]
    public void Suppliers_AreDedupedAndUppercased_KeepingOrder()
    {
        var (c, e) = Run(Req(suppliers: ["b", "A", "B", "a"]));
        Assert.Empty(e);
        Assert.Equal(["B", "A"], c!.Suppliers);
    }

    [Fact]
    public void LocationCodes_AreNormalized()
    {
        var (c, _) = Run(Req(from: "cnsha", to: "uslax"));
        Assert.Equal("CNSHA", c!.FromLocation);
        Assert.Equal("USLAX", c.ToLocation);
    }

    [Fact]
    public void EmptySuppliers_IsError() => Assert.Contains("suppliers", Run(Req(suppliers: [])).E.Keys);

    [Fact]
    public void UnknownSupplier_IsError() => Assert.Contains("suppliers", Run(Req(suppliers: ["A", "Z"])).E.Keys);

    [Fact]
    public void UnknownLocations_AreErrors()
    {
        var e = Run(Req(from: "XXXXX", to: null!)).E;
        Assert.Contains("fromLocation", e.Keys);
        Assert.Contains("toLocation", e.Keys);
    }

    [Fact]
    public void SameLocation_IsError() => Assert.Contains("toLocation", Run(Req(to: "CNSHA")).E.Keys);

    [Fact]
    public void FromAfterTo_IsError() =>
        Assert.Contains("toDate", Run(Req(fromDate: Today.AddDays(6), toDate: Today.AddDays(5))).E.Keys);

    [Fact]
    public void FromEqualsTo_IsOk() =>
        Assert.Empty(Run(Req(fromDate: Today.AddDays(6), toDate: Today.AddDays(6))).E);

    [Fact]
    public void YesterdayIsAllowed_TwoDaysAgoIsNot()
    {
        Assert.Empty(Run(Req(fromDate: Today.AddDays(-1), toDate: Today)).E);
        Assert.Contains("fromDate", Run(Req(fromDate: Today.AddDays(-2), toDate: Today)).E.Keys);
    }

    [Fact]
    public void Plus365IsAllowed_Plus366IsNot()
    {
        Assert.Empty(Run(Req(fromDate: Today.AddDays(365), toDate: Today.AddDays(370))).E);
        Assert.Contains("fromDate", Run(Req(fromDate: Today.AddDays(366), toDate: Today.AddDays(370))).E.Keys);
    }
}
