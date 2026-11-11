namespace PriceHunt.Api.Suppliers;

public sealed class SupplierUnavailableException(string message) : Exception(message);
