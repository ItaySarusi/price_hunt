using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using PriceHunt.Api.History;
using PriceHunt.Api.Suppliers;

namespace PriceHunt.Api.Controllers;

[ApiController]
[Route("api/history")]
public sealed class HistoryController(HistoryService history, SupplierRegistry suppliers) : ControllerBase
{
    [HttpGet]
    public async Task<IResult> Get([FromQuery] HistoryQuery query, CancellationToken ct)
    {
        var (criteria, errors) = HistoryQueryValidator.Validate(query, suppliers);
        if (criteria is null)
            return TypedResults.Json(new HttpValidationProblemDetails(errors) { Status = 400, Title = "One or more validation errors occurred." }, statusCode: 400, contentType: "application/problem+json");

        return TypedResults.Ok(await history.QueryAsync(criteria, ct));
    }
}
