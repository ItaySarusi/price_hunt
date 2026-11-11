using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PriceHunt.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Searches",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    FromLocationCode = table.Column<string>(type: "TEXT", maxLength: 5, nullable: false),
                    FromLocationName = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    ToLocationCode = table.Column<string>(type: "TEXT", maxLength: 5, nullable: false),
                    ToLocationName = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    FromDate = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    ToDate = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    SelectedSuppliers = table.Column<string>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    EndedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    DurationMs = table.Column<long>(type: "INTEGER", nullable: true),
                    Status = table.Column<string>(type: "TEXT", maxLength: 16, nullable: false),
                    IsDemo = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Searches", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SupplierResponses",
                columns: table => new
                {
                    Id = table.Column<long>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    SearchId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SupplierCode = table.Column<string>(type: "TEXT", maxLength: 1, nullable: false),
                    SupplierName = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 16, nullable: false),
                    PriceCents = table.Column<long>(type: "INTEGER", nullable: true),
                    Currency = table.Column<string>(type: "TEXT", maxLength: 3, nullable: false),
                    ResponseTimeMs = table.Column<long>(type: "INTEGER", nullable: false),
                    ReceivedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Error = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SupplierResponses", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SupplierResponses_Searches_SearchId",
                        column: x => x.SearchId,
                        principalTable: "Searches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Searches_CreatedAt",
                table: "Searches",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_Searches_FromDate_ToDate",
                table: "Searches",
                columns: new[] { "FromDate", "ToDate" });

            migrationBuilder.CreateIndex(
                name: "IX_Searches_FromLocationCode_ToLocationCode",
                table: "Searches",
                columns: new[] { "FromLocationCode", "ToLocationCode" });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierResponses_PriceCents",
                table: "SupplierResponses",
                column: "PriceCents");

            migrationBuilder.CreateIndex(
                name: "IX_SupplierResponses_SearchId",
                table: "SupplierResponses",
                column: "SearchId");

            migrationBuilder.CreateIndex(
                name: "IX_SupplierResponses_Status",
                table: "SupplierResponses",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_SupplierResponses_SupplierCode",
                table: "SupplierResponses",
                column: "SupplierCode");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SupplierResponses");

            migrationBuilder.DropTable(
                name: "Searches");
        }
    }
}
