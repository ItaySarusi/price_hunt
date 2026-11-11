using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PriceHunt.Api.Data;
using PriceHunt.Api.Data.Entities;
using PriceHunt.Tests.TestDoubles;

namespace PriceHunt.Tests.Integration;

public sealed class SearchStreamTests : IDisposable
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

    private static object Body(object? suppliers = null, string from = "CNSHA", string to = "USLAX", string? fromDate = null, string? toDate = null) =>
        new { fromLocation = from, toLocation = to, fromDate = fromDate ?? Future(10), toDate = toDate ?? Future(20), suppliers };

    private static HttpRequestMessage Post(object body)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/search/stream") { Content = JsonContent.Create(body) };
        req.Headers.Accept.ParseAdd("text/event-stream");
        return req;
    }

    private sealed record Frame(string Event, JsonElement Data, string RawData, TimeSpan At);

    private static async Task<List<Frame>> ReadFramesAsync(HttpResponseMessage response, Stopwatch sw)
    {
        var frames = new List<Frame>();
        using var reader = new StreamReader(await response.Content.ReadAsStreamAsync(), Encoding.UTF8);
        string? ev = null, data = null;
        while (await reader.ReadLineAsync() is { } line)
        {
            if (line.StartsWith("event:")) ev = line["event:".Length..].Trim();
            else if (line.StartsWith("data:")) data = line["data:".Length..].TrimStart();
            else if (line.Length == 0 && ev is not null && data is not null)
            {
                frames.Add(new Frame(ev, JsonDocument.Parse(data).RootElement.Clone(), data, sw.Elapsed));
                ev = data = null;
            }
        }
        return frames;
    }

    [Fact]
    public async Task Stream_ReturnsOrderedFrames_WithCamelCasePayloads()
    {
        using var client = _factory.CreateClient();
        var sw = Stopwatch.StartNew();
        using var response = await client.SendAsync(Post(Body(new[] { "a", "B", "c", "D", "E", "F" })), HttpCompletionOption.ResponseHeadersRead);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/event-stream", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("no-cache", response.Headers.CacheControl?.ToString());
        Assert.Equal("no", response.Headers.GetValues("X-Accel-Buffering").Single());

        var frames = await ReadFramesAsync(response, sw);
        Assert.Equal("started", frames[0].Event);
        Assert.Equal("end", frames[^1].Event);
        var middle = frames[1..^1];
        Assert.Equal(6, middle.Count);
        Assert.All(middle, f => Assert.Contains(f.Event, new[] { "quote", "supplier-failed" }));

        var started = frames[0].Data;
        Assert.Equal(6, started.GetProperty("total").GetInt32());
        Assert.Equal(["A", "B", "C", "D", "E", "F"], started.GetProperty("suppliers").EnumerateArray().Select(x => x.GetString()!));
        Assert.True(started.TryGetProperty("searchId", out _));
        Assert.True(started.TryGetProperty("timeoutMs", out _));
        Assert.True(started.TryGetProperty("startedAt", out _));

        foreach (var q in middle.Where(f => f.Event == "quote"))
        {
            var d = q.Data;
            Assert.Equal(started.GetProperty("searchId").GetString(), d.GetProperty("searchId").GetString());
            Assert.StartsWith("Supplier ", d.GetProperty("supplierName").GetString());
            Assert.Equal("USD", d.GetProperty("currency").GetString());
            Assert.Equal(JsonValueKind.Number, d.GetProperty("price").ValueKind);
            Assert.EndsWith("Z", d.GetProperty("receivedAt").GetString());
            Assert.True(d.TryGetProperty("responseTimeMs", out _));
            Assert.False(d.TryGetProperty("eventType", out _));
        }
        foreach (var f in middle.Where(f => f.Event == "supplier-failed"))
            Assert.True(f.Data.TryGetProperty("reason", out _));

        var end = frames[^1].Data;
        Assert.Equal("Completed", end.GetProperty("status").GetString());
        Assert.Equal(6, end.GetProperty("total").GetInt32());
        Assert.Equal(6, end.GetProperty("responded").GetInt32());
        Assert.Equal(0, end.GetProperty("noResponse").GetInt32());
        Assert.Equal(end.GetProperty("responded").GetInt32(),
            end.GetProperty("succeeded").GetInt32() + end.GetProperty("failed").GetInt32());
    }

    [Fact]
    public async Task Stream_WithG_TimesOut_AndFramesArriveIncrementally()
    {
        using var client = _factory.CreateClient();
        var sw = Stopwatch.StartNew();
        using var response = await client.SendAsync(Post(Body()), HttpCompletionOption.ResponseHeadersRead);
        var frames = await ReadFramesAsync(response, sw);

        var end = frames[^1];
        Assert.Equal("TimedOut", end.Data.GetProperty("status").GetString());
        Assert.Equal(1, end.Data.GetProperty("noResponse").GetInt32());
        var firstQuote = frames.First(f => f.Event == "quote");
        // Quotes arrive within ~200ms; the stream cannot complete before the 1s deadline.
        Assert.True(end.At - firstQuote.At > TimeSpan.FromMilliseconds(300),
            $"first quote at {firstQuote.At.TotalMilliseconds:F0}ms, end at {end.At.TotalMilliseconds:F0}ms");
    }

    [Fact]
    public async Task Stream_PriceHasTwoDecimals_InRawJson()
    {
        using var client = _factory.CreateClient();
        using var response = await client.SendAsync(Post(Body(new[] { "A", "B" })), HttpCompletionOption.ResponseHeadersRead);
        var frames = await ReadFramesAsync(response, Stopwatch.StartNew());
        foreach (var q in frames.Where(f => f.Event == "quote"))
            Assert.Matches("\"price\":\\d+\\.\\d{2}[,}]", q.RawData);
    }

    public static TheoryData<string, object, string> InvalidRequests() => new()
    {
        { "unknown location", Body(from: "XXXXX"), "fromLocation" },
        { "same from/to", Body(to: "CNSHA"), "toLocation" },
        { "from after to", Body(fromDate: Future(20), toDate: Future(10)), "toDate" },
        { "past date", Body(fromDate: Future(-5), toDate: Future(10)), "fromDate" },
        { "too far ahead", Body(fromDate: Future(400), toDate: Future(410)), "fromDate" },
        { "empty suppliers", Body(suppliers: Array.Empty<string>()), "suppliers" },
        { "unknown supplier", Body(suppliers: new[] { "A", "Z" }), "suppliers" },
    };

    [Theory]
    [MemberData(nameof(InvalidRequests))]
    public async Task InvalidRequest_Returns400ProblemDetails(string _, object body, string field)
    {
        using var client = _factory.CreateClient();
        using var response = await client.SendAsync(Post(body));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(400, json.GetProperty("status").GetInt32());
        Assert.True(json.GetProperty("errors").TryGetProperty(field, out var msgs));
        Assert.True(msgs.GetArrayLength() > 0);
    }

    [Fact]
    public async Task MalformedDate_Returns400()
    {
        using var client = _factory.CreateClient();
        using var response = await client.SendAsync(Post(new { fromLocation = "CNSHA", toLocation = "USLAX", fromDate = "nope", toDate = "2030-01-01" }));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ClientDisconnect_MarksSearchAndPendingSuppliersCancelled()
    {
        using var client = _factory.CreateClient();
        var cts = new CancellationTokenSource();
        var response = await client.SendAsync(Post(Body()), HttpCompletionOption.ResponseHeadersRead, cts.Token);
        var stream = await response.Content.ReadAsStreamAsync(cts.Token);
        using var reader = new StreamReader(stream);
        Assert.Equal("event: started", await reader.ReadLineAsync(cts.Token));

        cts.Cancel();
        response.Dispose();

        var factory = _factory.Services.GetRequiredService<IDbContextFactory<PriceHuntDbContext>>();
        var sw = Stopwatch.StartNew();
        SearchRecord? search = null;
        while (sw.Elapsed < TimeSpan.FromSeconds(2))
        {
            await using var db = await factory.CreateDbContextAsync();
            search = await db.Searches.Include(s => s.Responses).SingleOrDefaultAsync();
            if (search?.Status == SearchStatus.Cancelled) break;
            await Task.Delay(50);
        }
        Assert.NotNull(search);
        Assert.Equal(SearchStatus.Cancelled, search!.Status);
        Assert.Contains(search.Responses, r => r.SupplierCode == "G" && r.Status == SupplierResponseStatus.Cancelled);
    }
}
