namespace PriceHunt.Api.Suppliers;

/// <summary>Source of uniform random doubles in [0, 1). Fakeable in tests.</summary>
public interface IRandomSource
{
    double NextDouble();
}

public sealed class SystemRandomSource : IRandomSource
{
    public double NextDouble() => Random.Shared.NextDouble();
}
