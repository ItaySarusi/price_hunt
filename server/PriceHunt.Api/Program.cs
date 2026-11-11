using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using PriceHunt.Api.Data;
using PriceHunt.Api.Search;
using PriceHunt.Api.Suppliers;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

const string CorsPolicy = "Client";

builder.Services
    .AddControllers()
    .AddJsonOptions(o =>
    {
        o.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

builder.Services.Configure<SupplierOptions>(builder.Configuration.GetSection(SupplierOptions.SectionName));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IRandomSource, SystemRandomSource>();
builder.Services.AddSingleton<SupplierRegistry>();
builder.Services.Configure<SearchOptions>(builder.Configuration.GetSection(SearchOptions.SectionName));
builder.Services.AddSingleton<SearchOrchestrator>();
builder.Services.AddSingleton<PriceHunt.Api.History.HistoryService>();
var sqlite = new SqliteConnectionStringBuilder(
    builder.Configuration.GetConnectionString("Default") ?? "Data Source=pricehunt.db");
if (!Path.IsPathRooted(sqlite.DataSource))
{
    sqlite.DataSource = Path.GetFullPath(sqlite.DataSource, builder.Environment.ContentRootPath);
}
builder.Services.AddDbContextFactory<PriceHuntDbContext>(o => o.UseSqlite(sqlite.ToString()));

builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();
builder.Services.AddCors(o => o.AddPolicy(CorsPolicy, p => p
    .WithOrigins("http://localhost:4200")
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();

await app.Services.InitializeDatabaseAsync();

// Global exception handler -> ProblemDetails (500); details only in Development.
app.UseExceptionHandler(errorApp => errorApp.Run(async context =>
{
    var env = context.RequestServices.GetRequiredService<IWebHostEnvironment>();
    var feature = context.Features.Get<IExceptionHandlerFeature>();
    var problem = new ProblemDetails
    {
        Status = StatusCodes.Status500InternalServerError,
        Title = "An unexpected error occurred.",
        Type = "https://tools.ietf.org/html/rfc9110#section-15.6.1",
        Instance = context.Request.Path,
    };
    if (env.IsDevelopment() && feature?.Error is { } ex)
    {
        problem.Detail = ex.ToString();
    }
    context.Response.StatusCode = StatusCodes.Status500InternalServerError;
    context.Response.ContentType = "application/problem+json";
    await context.Response.WriteAsJsonAsync(problem, context.RequestAborted);
}));
app.UseStatusCodePages();

app.UseCors(CorsPolicy);

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.UseAuthorization();
app.MapControllers();

app.Run();

public partial class Program;
