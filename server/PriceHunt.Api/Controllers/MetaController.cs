using Microsoft.AspNetCore.Mvc;
using PriceHunt.Api.Locations;
using PriceHunt.Api.Suppliers;

namespace PriceHunt.Api.Controllers;

public sealed record LocationDto(string Code, string Name, string CountryCode, string Label);
public sealed record SupplierInfoDto(string Code, string Name);

[ApiController]
[Route("api/meta")]
public sealed class MetaController(SupplierRegistry suppliers) : ControllerBase
{
    [HttpGet("locations")]
    public ActionResult<IReadOnlyList<LocationDto>> GetLocations() =>
        Ok(LocationCatalog.All.Select(l => new LocationDto(l.Code, l.Name, l.CountryCode, l.Label)).ToList());

    [HttpGet("suppliers")]
    public ActionResult<IReadOnlyList<SupplierInfoDto>> GetSuppliers() =>
        Ok(suppliers.All.Select(s => new SupplierInfoDto(s.Code, s.Name)).ToList());
}
