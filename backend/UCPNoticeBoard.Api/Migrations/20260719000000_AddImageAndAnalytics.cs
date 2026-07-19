using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace UCPNoticeBoard.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddImageAndAnalytics : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ImageUrl",
                table: "Notices",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastSeenAt",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ViewCount",
                table: "Users",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "ImageUrl", table: "Notices");
            migrationBuilder.DropColumn(name: "LastSeenAt", table: "Users");
            migrationBuilder.DropColumn(name: "ViewCount", table: "Users");
        }
    }
}
