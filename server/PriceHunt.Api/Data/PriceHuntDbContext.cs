using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using PriceHunt.Api.Data.Entities;

namespace PriceHunt.Api.Data;

public sealed class PriceHuntDbContext(DbContextOptions<PriceHuntDbContext> options) : DbContext(options)
{
    public DbSet<SearchRecord> Searches => Set<SearchRecord>();
    public DbSet<SupplierResponse> SupplierResponses => Set<SupplierResponse>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // SQLite returns DateTime with Kind=Unspecified; always treat stored values as UTC.
        configurationBuilder.Properties<DateTime>().HaveConversion<UtcDateTimeConverter>();
        configurationBuilder.Properties<DateTime?>().HaveConversion<NullableUtcDateTimeConverter>();
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SearchRecord>(e =>
        {
            e.ToTable("Searches");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).ValueGeneratedNever();
            e.Property(x => x.FromLocationCode).HasMaxLength(5).IsRequired();
            e.Property(x => x.FromLocationName).HasMaxLength(64).IsRequired();
            e.Property(x => x.ToLocationCode).HasMaxLength(5).IsRequired();
            e.Property(x => x.ToLocationName).HasMaxLength(64).IsRequired();

            e.Property(x => x.SelectedSuppliers)
                .HasConversion(
                    v => string.Join(',', v),
                    v => v.Length == 0 ? new List<string>() : v.Split(',').ToList(),
                    new ValueComparer<List<string>>(
                        (a, b) => a != null && b != null && a.SequenceEqual(b),
                        v => v.Aggregate(0, (h, s) => HashCode.Combine(h, s.GetHashCode())),
                        v => v.ToList()))
                .IsRequired();

            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);

            e.HasIndex(x => new { x.FromDate, x.ToDate });
            e.HasIndex(x => new { x.FromLocationCode, x.ToLocationCode });
            e.HasIndex(x => x.CreatedAt);
        });

        modelBuilder.Entity<SupplierResponse>(e =>
        {
            e.ToTable("SupplierResponses");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).ValueGeneratedOnAdd();
            e.Property(x => x.SupplierCode).HasMaxLength(1).IsRequired();
            e.Property(x => x.SupplierName).HasMaxLength(32).IsRequired();
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.Currency).HasMaxLength(3).IsRequired();
            e.Property(x => x.Error).HasMaxLength(200);

            e.HasOne(x => x.Search)
                .WithMany(s => s.Responses)
                .HasForeignKey(x => x.SearchId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasIndex(x => x.SearchId);
            e.HasIndex(x => x.SupplierCode);
            e.HasIndex(x => x.Status);
            e.HasIndex(x => x.PriceCents);
        });
    }

    private sealed class UtcDateTimeConverter() : ValueConverter<DateTime, DateTime>(
        v => v.Kind == DateTimeKind.Utc ? v : v.ToUniversalTime(),
        v => DateTime.SpecifyKind(v, DateTimeKind.Utc));

    private sealed class NullableUtcDateTimeConverter() : ValueConverter<DateTime?, DateTime?>(
        v => v.HasValue ? (v.Value.Kind == DateTimeKind.Utc ? v : v.Value.ToUniversalTime()) : v,
        v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : v);
}
