using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using PriceHunt.Api.Search;
using PriceHunt.Tests.TestDoubles;

namespace PriceHunt.Tests.Integration;

public sealed class SearchOrchestratorRegistrationTests(PriceHuntApiFactory factory) : IClassFixture<PriceHuntApiFactory>
{
    [Fact]
    public void Orchestrator_IsResolvable_AndTimeoutIsBoundFromConfiguration()
    {
        Assert.NotNull(factory.Services.GetRequiredService<SearchOrchestrator>());
        Assert.Equal(6, factory.Services.GetRequiredService<IOptions<SearchOptions>>().Value.TimeoutSeconds);
    }
}
