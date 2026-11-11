using System.Net;
using Microsoft.AspNetCore.Hosting;
using PriceHunt.Tests.TestDoubles;

namespace PriceHunt.Tests.Integration;

public sealed class SmokeTests(PriceHuntApiFactory factory) : IClassFixture<PriceHuntApiFactory>
{
    [Fact]
    public async Task OpenApiDocument_IsServed_InDevelopment()
    {
        using var client = factory.WithWebHostBuilder(b => b.UseEnvironment("Development")).CreateClient();
        var response = await client.GetAsync("/openapi/v1.json");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task UnknownRoute_Returns404()
    {
        using var client = factory.CreateClient();
        var response = await client.GetAsync("/api/does-not-exist");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
