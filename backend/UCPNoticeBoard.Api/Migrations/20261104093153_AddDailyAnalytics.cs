using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace UCPNoticeBoard.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddDailyAnalytics : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "LastSeenAppAt",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastSeenExtensionAt",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "DailyCounts",
                columns: table => new
                {
                    Day = table.Column<DateOnly>(type: "date", nullable: false),
                    Metric = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Count = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DailyCounts", x => new { x.Day, x.Metric });
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DailyCounts");

            migrationBuilder.DropColumn(
                name: "LastSeenAppAt",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "LastSeenExtensionAt",
                table: "Users");
        }
    }
}
