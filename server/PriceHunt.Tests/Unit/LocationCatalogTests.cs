using PriceHunt.Api.Locations;

namespace PriceHunt.Tests.Unit;

public sealed class LocationCatalogTests
{
    [Fact]
    public void All_HasExactly33Entries() => Assert.Equal(33, LocationCatalog.All.Count);

    [Fact]
    public void Codes_AreUnique() =>
        Assert.Equal(33, LocationCatalog.All.Select(l => l.Code).Distinct(StringComparer.OrdinalIgnoreCase).Count());

    [Fact]
    public void All_IsSortedByLabel() =>
        Assert.Equal(LocationCatalog.All.OrderBy(l => l.Label, StringComparer.Ordinal).Select(l => l.Code),
            LocationCatalog.All.Select(l => l.Code));

    [Theory]
    [InlineData("CNSHA")]
    [InlineData("cnsha")]
    [InlineData("CnSha")]
    public void TryGet_IsCaseInsensitive(string code)
    {
        Assert.True(LocationCatalog.TryGet(code, out var loc));
        Assert.Equal("CNSHA", loc!.Code);
    }

    [Theory]
    [InlineData("XXXXX")]
    [InlineData("")]
    [InlineData(null)]
    public void TryGet_Unknown_ReturnsFalse(string? code)
    {
        Assert.False(LocationCatalog.TryGet(code, out var loc));
        Assert.Null(loc);
        Assert.Null(LocationCatalog.Find(code));
    }

    [Fact]
    public void Label_IsNameCommaCountry()
    {
        var loc = LocationCatalog.Find("VNSGN")!;
        Assert.Equal("Ho Chi Minh City", loc.Name);
        Assert.Equal("VN", loc.CountryCode);
        Assert.Equal("Ho Chi Minh City, VN", loc.Label);
    }

    [Theory]
    [InlineData("AEJEA", "Jebel Ali")]
    [InlineData("INNSA", "Nhava Sheva")]
    [InlineData("USLAX", "Los Angeles")]
    public void SpecialNames(string code, string name) => Assert.Equal(name, LocationCatalog.Find(code)!.Name);

    [Fact]
    public void CountryCode_MatchesCodePrefix() =>
        Assert.All(LocationCatalog.All, l => Assert.StartsWith(l.CountryCode, l.Code));
}
