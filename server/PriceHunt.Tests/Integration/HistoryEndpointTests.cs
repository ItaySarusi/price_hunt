using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using PriceHunt.Tests.TestDoubles;

namespace PriceHunt.Tests.Integration;

public sealed class HistoryEndpointTests : IDisposable
{
    private readonly PriceHuntApiFactory _factory = new()
    {
        Overrides =
        {
            ["Suppliers:MinDelayMs"] = "20",
            ["Suppliers:MaxDelayMs"] = "200",
            ["Search:TimeoutSeconds"] = "1",
        },
    };

    public void Dispose() => _factory.Dispose();

    private static string Future(int days) => DateTime.UtcNow.AddDays(days).ToString("yyyy-MM-dd");

    private async Task<string> RunSearchAsync(HttpClient client, object? suppliers, string from = "CNSHA", string to = "USLAX", int fromDay = 10, int toDay = 20)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, "/api/search/stream")
        {
            Content = JsonContent.Create(new { fromLocation = from, toLocation = to, fromDate = Future(fromDay), toDate = Future(toDay), suppliers }),
        };
        using var res = await client.SendAsync(req, HttpCompletionOption.ResponseHeadersRead);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadAsStringAsync(); // consume to the end frame
        Assert.Contains("event: end", body);
        var line = body.Split('\n').First(l => l.StartsWith("data:") && l.Contains("searchId"));
        return JsonDocument.Parse(line["data:".Length..].Trim()).RootElement.GetProperty("searchId").GetString()!;
    }

    private static async Task<JsonElement> GetJsonAsync(HttpClient client, string url)
    {
        using var res = await client.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement.Clone();
    }

    [Fact]
    public async Task History_ReturnsRowsPersistedByRealSearch_WithCamelCaseShape()
    {
        using var client = _factory.CreateClient();
        var searchId = await RunSearchAsync(client, new[] { "A", "B", "C" });

        var json = await GetJsonAsync(client, $"/api/history?start={Future(5)}&end={Future(25)}");
        Assert.Equal(3, json.GetProperty("totalCount").GetInt32());
        Assert.Equal(1, json.GetProperty("totalPages").GetInt32());
        Assert.Equal(1, json.GetProperty("page").GetInt32());
        Assert.Equal(25, json.GetProperty("pageSize").GetInt32());

        var items = json.GetProperty("items").EnumerateArray().ToList();
        Assert.Equal(3, items.Count);
        foreach (var item in items)
        {
            Assert.Equal(searchId, item.GetProperty("searchId").GetString());
            Assert.True(item.GetProperty("id").GetInt64() > 0);
            Assert.EndsWith("Z", item.GetProperty("searchedAt").GetString());
            Assert.Equal(Future(10), item.GetProperty("fromDate").GetString());
            Assert.Equal(Future(20), item.GetProperty("toDate").GetString());
            Assert.Equal("CNSHA", item.GetProperty("from").GetProperty("code").GetString());
            Assert.Equal("Shanghai, CN", item.GetProperty("from").GetProperty("label").GetString());
            Assert.Equal("USLAX", item.GetProperty("to").GetProperty("code").GetString());
            Assert.Equal("Los Angeles, US", item.GetProperty("to").GetProperty("label").GetString());
            Assert.StartsWith("Supplier ", item.GetProperty("supplier").GetProperty("name").GetString());
            Assert.Equal("USD", item.GetProperty("currency").GetString());
            Assert.True(item.TryGetProperty("responseTimeMs", out _));
            Assert.True(item.TryGetProperty("error", out _));
            var status = item.GetProperty("status").GetString();
            Assert.Contains(status, new[] { "Success", "Failed" });
            if (status == "Success") Assert.Equal(JsonValueKind.Number, item.GetProperty("price").ValueKind);
            else Assert.Equal(JsonValueKind.Null, item.GetProperty("price").ValueKind);
        }
    }

    [Fact]
    public async Task History_SupplierFilter_OneSeveralAll()
    {
        using var client = _factory.CreateClient();
        await RunSearchAsync(client, new[] { "A", "B", "C", "D" });
        var window = $"start={Future(5)}&end={Future(25)}";

        var one = await GetJsonAsync(client, $"/api/history?{window}&suppliers=B");
        Assert.Equal(["B"], one.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("supplier").GetProperty("code").GetString()));

        var several = await GetJsonAsync(client, $"/api/history?{window}&suppliers=A&suppliers=c&sortBy=supplier");
        Assert.Equal(["A", "C"], several.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("supplier").GetProperty("code").GetString()));

        var commaSeparated = await GetJsonAsync(client, $"/api/history?{window}&suppliers=A,D&sortBy=supplier&sortDir=desc");
        Assert.Equal(["D", "A"], commaSeparated.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("supplier").GetProperty("code").GetString()));

        var all = await GetJsonAsync(client, $"/api/history?{window}");
        Assert.Equal(4, all.GetProperty("totalCount").GetInt32());

        var allExplicit = await GetJsonAsync(client, $"/api/history?{window}&suppliers=A&suppliers=B&suppliers=C&suppliers=D");
        Assert.Equal(4, allExplicit.GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task History_WithG_StoresNoResponse_AndIncludeFailuresFilters()
    {
        using var client = _factory.CreateClient();
        await RunSearchAsync(client, new[] { "A", "G" });

        var withFailures = await GetJsonAsync(client, "/api/history?includeFailures=true");
        var statuses = withFailures.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("status").GetString()).ToList();
        Assert.Contains("NoResponse", statuses);

        var onlyOk = await GetJsonAsync(client, "/api/history?includeFailures=false");
        Assert.All(onlyOk.GetProperty("items").EnumerateArray(), i => Assert.Equal("Success", i.GetProperty("status").GetString()));
    }

    [Fact]
    public async Task History_DateWindow_ExcludesNonOverlappingSearches()
    {
        using var client = _factory.CreateClient();
        await RunSearchAsync(client, new[] { "A" }, fromDay: 10, toDay: 20);
        var outside = await GetJsonAsync(client, $"/api/history?start={Future(30)}&end={Future(40)}");
        Assert.Equal(0, outside.GetProperty("totalCount").GetInt32());
        var boundary = await GetJsonAsync(client, $"/api/history?start={Future(20)}");
        Assert.Equal(1, boundary.GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task History_FromToLocationFilter()
    {
        using var client = _factory.CreateClient();
        await RunSearchAsync(client, new[] { "A" }, "CNSHA", "USLAX");
        await RunSearchAsync(client, new[] { "A" }, "SGSIN", "NLRTM");

        Assert.Equal(1, (await GetJsonAsync(client, "/api/history?from=CNSHA")).GetProperty("totalCount").GetInt32());
        Assert.Equal(1, (await GetJsonAsync(client, "/api/history?to=nlrtm")).GetProperty("totalCount").GetInt32());
        Assert.Equal(1, (await GetJsonAsync(client, "/api/history?from=SGSIN&to=NLRTM")).GetProperty("totalCount").GetInt32());
        Assert.Equal(0, (await GetJsonAsync(client, "/api/history?from=CNSHA&to=NLRTM")).GetProperty("totalCount").GetInt32());
        Assert.Equal(2, (await GetJsonAsync(client, "/api/history")).GetProperty("totalCount").GetInt32());
    }

    [Theory]
    [InlineData("start=2026-12-10&end=2026-12-09", "end")]
    [InlineData("sortBy=bogus", "sortBy")]
    [InlineData("sortDir=up", "sortDir")]
    [InlineData("pageSize=20", "pageSize")]
    [InlineData("page=0", "page")]
    [InlineData("page=2147483647", "page")]
    [InlineData("page=100001", "page")]
    [InlineData("suppliers=Z", "suppliers")]
    [InlineData("from=XXXXX", "from")]
    public async Task History_InvalidParams_Return400ProblemDetailsWithErrors(string query, string field)
    {
        using var client = _factory.CreateClient();
        using var res = await client.GetAsync($"/api/history?{query}");
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal("application/problem+json", res.Content.Headers.ContentType?.MediaType);
        var json = JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement;
        Assert.True(json.GetProperty("errors").TryGetProperty(field, out _));
    }

    [Fact]
    public async Task History_UnparseableValues_Return400()
    {
        using var client = _factory.CreateClient();
        foreach (var q in new[] { "start=notadate", "page=abc", "includeFailures=maybe" })
        {
            using var res = await client.GetAsync($"/api/history?{q}");
            Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        }
    }
}
