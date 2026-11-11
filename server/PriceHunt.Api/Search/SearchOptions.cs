namespace PriceHunt.Api.Search;

public sealed class SearchOptions
{
    public const string SectionName = "Search";

    /// <summary>Global search deadline (SPEC §5.1, default 6 s).</summary>
    public int TimeoutSeconds { get; set; } = 6;
}
