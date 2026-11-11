using PriceHunt.Api.Suppliers;

namespace PriceHunt.Tests.TestDoubles;

/// <summary>Returns the queued values in order, then repeats <paramref name="fallback"/>.</summary>
public sealed class FakeRandomSource(double fallback = 0.0, params double[] sequence) : IRandomSource
{
    private readonly Queue<double> _queue = new(sequence);
    public int Calls { get; private set; }

    public double NextDouble()
    {
        Calls++;
        return _queue.Count > 0 ? _queue.Dequeue() : fallback;
    }
}
