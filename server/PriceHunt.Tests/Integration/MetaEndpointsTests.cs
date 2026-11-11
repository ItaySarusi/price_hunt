using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using PriceHunt.Tests.TestDoubles;

namespace PriceHunt.Tests.Integration;

public sealed class MetaEndpointsTests(PriceHuntApiFactory factory) : IClassFixture<PriceHuntApiFactory>
{
    [Fact]
    public async Task Locations_ReturnsCamelCaseCatalogSortedByLabel()
    {
        using var client = factory.CreateClient();
        var response = await client.GetAsync("/api/meta/locations");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var items = (await response.Content.ReadFromJsonAsync<JsonElement>()).EnumerateArray().ToList();
        Assert.Equal(33, items.Count);
        var first = items[0];
        Assert.Equal(["code", "name", "countryCode", "label"],
            first.EnumerateObject().Select(p => p.Name).ToArray());
        var labels = items.Select(i => i.GetProperty("label").GetString()!).ToList();
        Assert.Equal(labels.OrderBy(l => l, StringComparer.Ordinal), labels);
        var sha = items.Single(i => i.GetProperty("code").GetString() == "CNSHA");
        Assert.Equal("Shanghai", sha.GetProperty("name").GetString());
        Assert.Equal("CN", sha.GetProperty("countryCode").GetString());
        Assert.Equal("Shanghai, CN", sha.GetProperty("label").GetString());
    }

    [Fact]
    public async Task Suppliers_ReturnsSevenWithOnlyCodeAndName()
    {
        using var client = factory.CreateClient();
        var response = await client.GetAsync("/api/meta/suppliers");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var items = (await response.Content.ReadFromJsonAsync<JsonElement>()).EnumerateArray().ToList();
        Assert.Equal(7, items.Count);
        Assert.Equal(["A", "B", "C", "D", "E", "F", "G"], items.Select(i => i.GetProperty("code").GetString()!));
        Assert.All(items, i => Assert.Equal(["code", "name"], i.EnumerateObject().Select(p => p.Name).ToArray()));
        Assert.Equal("Supplier A", items[0].GetProperty("name").GetString());
        var raw = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("failureRate", raw, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("neverResponds", raw, StringComparison.OrdinalIgnoreCase);
    }
}
