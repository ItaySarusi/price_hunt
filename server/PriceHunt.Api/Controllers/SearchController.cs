using Microsoft.AspNetCore.Http;
using System.Net.ServerSentEvents;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using PriceHunt.Api.Search;
using PriceHunt.Api.Suppliers;

namespace PriceHunt.Api.Controllers;

[ApiController]
[Route("api/search")]
public sealed class SearchController(
    SearchOrchestrator orchestrator,
    SupplierRegistry suppliers,
    TimeProvider timeProvider,
    IOptions<Microsoft.AspNetCore.Http.Json.JsonOptions> jsonOptions) : ControllerBase
{
    [HttpPost("stream")]
    public IResult Stream([FromBody] SearchRequest request)
    {
        var (criteria, errors) = SearchRequestValidator.Validate(request, suppliers, timeProvider);
        if (criteria is null) return TypedResults.Json(new HttpValidationProblemDetails(errors) { Status = 400, Title = "One or more validation errors occurred." }, statusCode: 400, contentType: "application/problem+json");

        Response.Headers.CacheControl = "no-cache";
        Response.Headers["X-Accel-Buffering"] = "no";
        return TypedResults.ServerSentEvents(Frames(criteria, HttpContext.RequestAborted));
    }

    private async IAsyncEnumerable<SseItem<string>> Frames(
        SearchCriteria criteria,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        var options = jsonOptions.Value.SerializerOptions;
        await foreach (var e in orchestrator.RunAsync(criteria, ct))
        {
            yield return new SseItem<string>(JsonSerializer.Serialize(e, e.GetType(), options), e.EventType);
        }
    }
}
